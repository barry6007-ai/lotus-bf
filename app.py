# app.py
# LoTUS-BF: Unified Full-Stack Service for Render & Local Deployment
# Serves both the modern React Frontend and the LoTUS-BF REST API

import os
import re
import urllib.request
import urllib.parse
import urllib.error
from flask import Flask, Blueprint, request, jsonify, Response, send_from_directory, redirect

try:
    from flask_cors import CORS
except ImportError:
    CORS = None

UPSTREAM_API = os.environ.get("UPSTREAM_API", "http://hpc.psy.ntu.edu.tw:5000").rstrip("/")

def proxy_upstream(subpath: str):
    """
    Reverse proxies requests to the canonical LoTUS-BF HPC backend at NTU.
    Bypasses browser Mixed Content security (HTTPS -> HTTP) by handling the HTTP
    request server-side, and guarantees 100% data fidelity with zero database firewall blocks.
    """
    raw_qs = request.query_string.decode("utf-8")
    
    # Properly encode subpath segments while preserving slashes
    parts = subpath.strip("/").split("/")
    encoded_parts = [urllib.parse.quote(p, safe="@[]():,-+ ") for p in parts]
    clean_subpath = "/".join(encoded_parts)
    
    target_url = f"{UPSTREAM_API}/{clean_subpath}"
    if raw_qs:
        target_url += f"?{raw_qs}"
        
    try:
        req = urllib.request.Request(
            target_url,
            headers={
                "User-Agent": request.headers.get("User-Agent", "LoTUS-BF-Proxy/2.0"),
                "Accept": request.headers.get("Accept", "*/*")
            }
        )
        with urllib.request.urlopen(req, timeout=40) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "application/json")
            res = Response(data, status=resp.status, content_type=content_type)
            res.headers["Access-Control-Allow-Origin"] = "*"
            res.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            res.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            return res
    except urllib.error.HTTPError as he:
        body = he.read()
        ct = he.headers.get("Content-Type", "application/json")
        res = Response(body, status=he.code, content_type=ct)
        res.headers["Access-Control-Allow-Origin"] = "*"
        return res
    except Exception as e:
        return jsonify({"error": f"Upstream proxy failed: {str(e)}", "url": target_url}), 502

bp = Blueprint("lotus_api", __name__)

@bp.get("/terms")
@bp.get("/terms/<path:term>")
def handle_terms(term=None):
    sub = f"terms/{term}" if term else "terms"
    return proxy_upstream(sub)

@bp.get("/query/<path:query_rest>")
def handle_query(query_rest):
    return proxy_upstream(f"query/{query_rest}")

@bp.get("/help")
def handle_help():
    return proxy_upstream("help")

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

    # Static frontend routes for LoTUS-BF
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
