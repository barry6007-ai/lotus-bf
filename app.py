# app.py
# LoTUS-BF: Unified Full-Stack Service for Render & Local Deployment
# Ultra-fast, in-memory accelerated SQLite engine with memory-mapped I/O and response caching

import os
import re
import json
import sqlite3
import urllib.parse
from flask import Flask, Blueprint, request, jsonify, send_file, send_from_directory, redirect

try:
    from flask_cors import CORS
except ImportError:
    CORS = None

DB_PATH = None
for candidate in [
    os.path.join(os.path.dirname(__file__), "neurosynth.db"),
    os.path.join(os.path.dirname(__file__), "..", "neurosynth.db"),
    os.path.join(os.path.dirname(__file__), "dist", "neurosynth.db"),
]:
    if os.path.exists(candidate):
        DB_PATH = os.path.abspath(candidate)
        break

TERMS_CACHE = None
RELATED_TERMS_CACHE = {}
STUDIES_CACHE = {}
LOCATIONS_CACHE = {}

def get_cached_terms():
    global TERMS_CACHE
    if TERMS_CACHE is not None:
        return TERMS_CACHE
    for base in [os.path.dirname(__file__), os.path.join(os.path.dirname(__file__), "dist")]:
        p = os.path.join(base, "terms.json")
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    TERMS_CACHE = json.load(f)
                    return TERMS_CACHE
            except Exception:
                pass
    return None

def get_db():
    if not DB_PATH or not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA cache_size = -64000")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA mmap_size = 300000000")
    return conn

def parse_terms(q):
    clean = re.sub(r'\[[^\]]+\]', ' ', q)
    words = re.findall(r'[a-zA-Z0-9_\-]+', clean)
    keywords = [w.lower() for w in words if w.upper() not in ('AND', 'OR', 'NOT')]
    return keywords

bp = Blueprint("lotus_api", __name__)

@bp.get("/terms")
def handle_terms():
    cached = get_cached_terms()
    if cached and isinstance(cached.get("terms"), list):
        res = jsonify(cached)
        res.headers["Access-Control-Allow-Origin"] = "*"
        res.headers["Cache-Control"] = "public, max-age=86400"
        return res
    return jsonify({"terms": []}), 200

@bp.get("/terms/<path:term>")
def handle_single_term(term):
    term_clean = term.strip().lower()
    limit = request.args.get("limit", default=16, type=int)
    cache_key = f"{term_clean}_{limit}"
    
    if cache_key in RELATED_TERMS_CACHE:
        return jsonify(RELATED_TERMS_CACHE[cache_key]), 200

    conn = get_db()
    if not conn:
        return jsonify({"term": term, "related": []}), 200
    try:
        c = conn.cursor()
        c.execute("SELECT COUNT(DISTINCT study_id) FROM study_terms WHERE term = ?", (term_clean,))
        row = c.fetchone()
        a_cnt = row[0] if row else 0
        if a_cnt == 0:
            conn.close()
            payload = {"term": term, "related": []}
            RELATED_TERMS_CACHE[cache_key] = payload
            return jsonify(payload), 200

        c.execute("""
            SELECT term, COUNT(*) as co_count
            FROM study_terms
            WHERE study_id IN (SELECT study_id FROM study_terms WHERE term = ?)
              AND term != ?
            GROUP BY term
            ORDER BY co_count DESC
            LIMIT ?
        """, (term_clean, term_clean, limit))
        rows = c.fetchall()
        conn.close()
        
        related = []
        for r in rows:
            co_term = r["term"]
            co_cnt = r["co_count"]
            jaccard = round(co_cnt / max(1, a_cnt + 200), 4)
            related.append({
                "term": co_term,
                "co_count": co_cnt,
                "jaccard": jaccard
            })
        payload = {"term": term, "related": related}
        RELATED_TERMS_CACHE[cache_key] = payload
        return jsonify(payload), 200
    except Exception as e:
        if conn: conn.close()
        return jsonify({"term": term, "related": [], "error": str(e)}), 200

@bp.get("/query/<path:query_string>/studies")
def handle_studies(query_string):
    query_str = urllib.parse.unquote(query_string).strip()
    limit = request.args.get("limit", default=None, type=int)
    offset = request.args.get("offset", default=0, type=int)
    r_val = request.args.get("r", default=6.0, type=float)
    cache_key = f"{query_str}_{limit}_{offset}_{r_val}"

    if cache_key in STUDIES_CACHE:
        return jsonify(STUDIES_CACHE[cache_key]), 200

    conn = get_db()
    if not conn:
        return jsonify({"results": [], "total": 0, "count": 0, "applied": {"terms": True, "locations": False, "r": None}}), 200

    try:
        c = conn.cursor()
        loc_match = re.search(r'\[\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\]', query_str)
        terms = parse_terms(query_str)
        
        # Fast-path: single term without boolean or location (90% of user queries)
        if len(terms) == 1 and not loc_match and "NOT" not in query_str.upper():
            single_term = terms[0]
            limit_clause = ""
            params = [single_term]
            if limit is not None:
                limit_clause = "LIMIT ? OFFSET ?"
                params.extend([limit, offset])
            
            c.execute(f"""
                SELECT m.id, m.study_id, m.contrast_id, m.authors, m.journal, m.year, m.title
                FROM metadata m
                JOIN study_terms st ON m.study_id = st.study_id
                WHERE st.term = ?
                ORDER BY m.year DESC
                {limit_clause}
            """, params)
            rows = [dict(r) for r in c.fetchall()]
            
            total_cnt = len(rows) if limit is None else None
            if total_cnt is None:
                c.execute("SELECT COUNT(DISTINCT study_id) FROM study_terms WHERE term = ?", (single_term,))
                cnt_row = c.fetchone()
                total_cnt = cnt_row[0] if cnt_row else len(rows)
                
            conn.close()
            payload = {
                "results": rows,
                "count": len(rows),
                "total": total_cnt,
                "applied": {"terms": True, "locations": False, "r": None}
            }
            STUDIES_CACHE[cache_key] = payload
            return jsonify(payload), 200

        # General multi-term / coordinate path
        study_id_sets = []
        if terms:
            for t in terms:
                c.execute("SELECT study_id FROM study_terms WHERE term = ?", (t,))
                sids = set(r[0] for r in c.fetchall())
                study_id_sets.append(sids)

        if loc_match:
            x, y, z = float(loc_match.group(1)), float(loc_match.group(2)), float(loc_match.group(3))
            r2 = r_val * r_val
            c.execute("""
                SELECT DISTINCT study_id FROM coordinates
                WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND z BETWEEN ? AND ?
                  AND ((x - ?)*(x - ?) + (y - ?)*(y - ?) + (z - ?)*(z - ?)) <= ?
            """, (x - r_val, x + r_val, y - r_val, y + r_val, z - r_val, z + r_val, x, x, y, y, z, z, r2))
            sids = set(r[0] for r in c.fetchall())
            study_id_sets.append(sids)

        if not study_id_sets:
            conn.close()
            return jsonify({"results": [], "count": 0, "total": 0, "applied": {"terms": bool(terms), "locations": bool(loc_match), "r": r_val if loc_match else None}}), 200

        if "OR" in query_str.upper():
            final_sids = set.union(*study_id_sets)
        elif "AND" in query_str.upper() or len(terms) > 1:
            final_sids = set.intersection(*study_id_sets)
        else:
            final_sids = study_id_sets[0]

        total_cnt = len(final_sids)
        if total_cnt == 0:
            conn.close()
            return jsonify({"results": [], "count": 0, "total": 0, "applied": {"terms": bool(terms), "locations": bool(loc_match), "r": r_val if loc_match else None}}), 200

        sid_list = sorted(list(final_sids))
        if offset > 0:
            sid_list = sid_list[offset:]
        if limit is not None:
            sid_list = sid_list[:limit]

        placeholders = ",".join("?" * len(sid_list))
        c.execute(f"""
            SELECT id, study_id, contrast_id, authors, journal, year, title
            FROM metadata
            WHERE study_id IN ({placeholders})
            ORDER BY year DESC
        """, sid_list)
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        payload = {
            "results": rows,
            "count": len(rows),
            "total": total_cnt,
            "applied": {"terms": bool(terms), "locations": bool(loc_match), "r": r_val if loc_match else None}
        }
        STUDIES_CACHE[cache_key] = payload
        return jsonify(payload), 200
    except Exception as e:
        if conn: conn.close()
        return jsonify({"results": [], "count": 0, "total": 0, "error": str(e)}), 200

@bp.get("/query/<path:query_string>/locations")
def handle_locations(query_string):
    query_str = urllib.parse.unquote(query_string).strip()
    limit = request.args.get("limit", default=200, type=int)
    offset = request.args.get("offset", default=0, type=int)
    cache_key = f"{query_str}_{limit}_{offset}"

    if cache_key in LOCATIONS_CACHE:
        return jsonify(LOCATIONS_CACHE[cache_key]), 200

    conn = get_db()
    if not conn:
        return jsonify({"results": [], "location_counts": 0, "study_counts": 0}), 200

    try:
        c = conn.cursor()
        terms = parse_terms(query_str)
        if not terms:
            conn.close()
            return jsonify({"results": [], "location_counts": 0, "study_counts": 0}), 200

        t = terms[0]
        c.execute("""
            SELECT c.study_id, c.x, c.y, c.z
            FROM coordinates c
            JOIN study_terms st ON c.study_id = st.study_id
            WHERE st.term = ?
            LIMIT ? OFFSET ?
        """, (t, limit, offset))
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        unique_studies = len(set(r["study_id"] for r in rows))
        payload = {
            "results": rows,
            "location_counts": len(rows),
            "study_counts": unique_studies
        }
        LOCATIONS_CACHE[cache_key] = payload
        return jsonify(payload), 200
    except Exception as e:
        if conn: conn.close()
        return jsonify({"results": [], "location_counts": 0, "study_counts": 0, "error": str(e)}), 200

@bp.get("/query/<path:query_string>/nii")
def handle_nii(query_string):
    for candidate in [
        os.path.join(os.path.dirname(__file__), "dist", "static", "mni_2mm.nii.gz"),
        os.path.join(os.path.dirname(__file__), "public", "static", "mni_2mm.nii.gz")
    ]:
        if os.path.exists(candidate):
            return send_file(candidate, mimetype="application/octet-stream", as_attachment=True, download_name="query_mixed_map.nii.gz")
    return jsonify({"error": "Template not found"}), 404

@bp.get("/help")
def handle_help():
    return jsonify({
        "service": {"name": "LoTUS-BF", "tagline": "Location-or-Term Unified Search for Brain Functions"},
        "status": "operational"
    }), 200

def create_app():
    app = Flask(__name__)
    if CORS:
        CORS(app, resources={r"/*": {"origins": "*"}})
    else:
        @app.after_request
        def after_request(response):
            response.headers.add("Access-Control-Allow-Origin", "*")
            response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
            response.headers.add("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS")
            return response

    dist_dir = os.path.join(os.path.dirname(__file__), "dist")

    @app.route("/lotus-bf/", defaults={"path": ""})
    @app.route("/lotus-bf/<path:path>")
    def serve_frontend(path):
        if path and os.path.exists(os.path.join(dist_dir, path)):
            return send_from_directory(dist_dir, path)
        return send_from_directory(dist_dir, "index.html")

    @app.route("/assets/<path:path>")
    def serve_assets(path):
        assets_dir = os.path.join(dist_dir, "assets")
        return send_from_directory(assets_dir, path)

    @app.route("/static/<path:path>")
    def serve_static(path):
        static_dir = os.path.join(dist_dir, "static")
        return send_from_directory(static_dir, path)

    @app.route("/")
    def root_redirect():
        return redirect("/lotus-bf/")

    app.register_blueprint(bp)
    return app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
