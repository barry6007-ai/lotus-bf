import { useState, useEffect, useMemo } from 'react';
import { apiUrl } from '../utils/apiConfig';

const QUICK_EXAMPLES = [
  'reward',
  'language',
  'emotion NOT fear',
  '[-2, 50, -6] AND reward',
  'pain OR depression'
];

function validateQuery(q) {
  if (!q || !q.trim()) return null;
  const str = q.trim();

  // 1. Check illegal symbols like &&, ||, +, &
  if (/(&&|\|\||[+&|])/.test(str)) {
    return { type: 'warn', msg: '請使用標準大寫英文布林運算子 (AND, OR, NOT)，而非符號 (&, |, +)' };
  }

  // 2. Unclosed quotes
  let quoteCount = 0;
  for (const ch of str) {
    if (ch === '"') quoteCount++;
  }
  if (quoteCount % 2 !== 0) {
    return { type: 'warn', msg: '雙引號 " 尚未閉合' };
  }

  // 3. Parentheses balance
  let openParen = 0;
  for (const ch of str) {
    if (ch === '(') openParen++;
    else if (ch === ')') {
      openParen--;
      if (openParen < 0) return { type: 'error', msg: '右括號 ) 多於左括號 (' };
    }
  }
  if (openParen > 0) return { type: 'warn', msg: `有 ${openParen} 個左括號 ( 尚未閉合` };

  // 4. Square brackets balance
  let openBracket = 0;
  for (const ch of str) {
    if (ch === '[') openBracket++;
    else if (ch === ']') {
      openBracket--;
      if (openBracket < 0) return { type: 'error', msg: '座標右括號 ] 多於左括號 [' };
    }
  }
  if (openBracket > 0) return { type: 'warn', msg: '座標括號 [ 尚未閉合' };

  // 5. Inspect coordinate syntax inside [...]
  const coordMatches = str.match(/\[[^\]]*\]/g);
  if (coordMatches) {
    const validCoordRegex = /^[-+]?\d*\.?\d+\s*,\s*[-+]?\d*\.?\d+\s*,\s*[-+]?\d*\.?\d+(?:\s*~\s*\d*\.?\d+)?$/;
    for (const match of coordMatches) {
      const inner = match.slice(1, -1).trim();
      if (!inner) {
        return { type: 'warn', msg: '座標括號內不可為空，格式需為 [X, Y, Z]' };
      }
      if (!validCoordRegex.test(inner)) {
        if (/[a-zA-Z]/.test(inner.replace(/~/g, ''))) {
          return { type: 'warn', msg: `座標不能包含英文字母 "${match}"，需為三維數值如 [-22, -4, 18]` };
        }
        const parts = inner.split(',').map((p) => p.trim()).filter(Boolean);
        if (parts.length !== 3 && !inner.includes('~')) {
          return { type: 'warn', msg: `座標需為三個數值 [X, Y, Z]，目前為 "${match}"` };
        }
        return { type: 'warn', msg: `座標格式錯誤 "${match}"，範例：[-22, -4, 18] 或 [-2, 50, -6 ~ 6]` };
      }
    }
  }

  // 6. Leading boolean operators
  if (/^\s*(AND|OR)\b/i.test(str)) {
    const m = str.match(/^\s*(AND|OR)\b/i);
    return { type: 'warn', msg: `查詢語句不可由 "${m[1].toUpperCase()}" 開頭` };
  }

  // 7. Trailing boolean operator
  if (/\b(AND|OR|NOT)\s*$/i.test(str)) {
    const match = str.match(/\b(AND|OR|NOT)\s*$/i);
    return { type: 'warn', msg: `語句末尾為運算子 "${match[1].toUpperCase()}"，請接續詞彙或座標` };
  }

  // 8. Consecutive boolean operators
  if (/\b(AND|OR)\s+(AND|OR|NOT)\b/i.test(str) || /\bNOT\s+(AND|OR|NOT)\b/i.test(str)) {
    return { type: 'warn', msg: '請避免連續使用布林運算子 (例如：AND AND 或 OR NOT)' };
  }

  // 9. Empty parentheses
  if (/\(\s*\)/.test(str)) {
    return { type: 'warn', msg: '括號內不可為空 ()' };
  }

  // 10. Operator directly following '('
  if (/\(\s*(AND|OR)\b/i.test(str)) {
    const m = str.match(/\(\s*(AND|OR)\b/i);
    return { type: 'warn', msg: `左括號後不可直接接續 "${m[1].toUpperCase()}"` };
  }

  // 11. Operator directly preceding ')'
  if (/\b(AND|OR|NOT)\s*\)/i.test(str)) {
    const m = str.match(/\b(AND|OR|NOT)\s*\)/i);
    return { type: 'warn', msg: `右括號前不可為運算子 "${m[1].toUpperCase()}"` };
  }

  // 12. Coordinate immediately glued to word without space or operator
  if (/\][a-zA-Z0-9_]/.test(str) || /[a-zA-Z0-9_]\[/.test(str)) {
    return { type: 'warn', msg: '座標括號與詞彙之間請保留空格或布林運算子' };
  }

  // 13. Adjacent coordinates without operator e.g. `[1,2,3] [4,5,6]`
  if (/\]\s*\[/.test(str)) {
    return { type: 'warn', msg: '多個座標之間請以 AND 或 OR 連接' };
  }

  return { type: 'valid', msg: '語法格式正確' };
}

export function QueryBuilder({ query, setQuery }) {
  const [history, setHistory] = useState([]);
  const [allTerms, setAllTerms] = useState([]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lotus_query_history');
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  // Fetch terms list once for autocomplete suggestions
  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/terms'))
      .then((r) => r.ok ? r.json() : fetch('terms.json').then(r2 => r2.json()))
      .then((d) => {
        if (alive && Array.isArray(d?.terms)) setAllTerms(d.terms);
      })
      .catch(() => {
        fetch('terms.json')
          .then((r) => r.json())
          .then((d) => { if (alive && Array.isArray(d?.terms)) setAllTerms(d.terms); })
          .catch(() => {});
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveHistory = (q) => {
    const trimmed = (q || '').trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, 6);
      try {
        localStorage.setItem('lotus_query_history', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const append = (token) => setQuery((q) => (q ? `${q} ${token}` : token));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.currentTarget.value;
      setQuery(val);
      saveHistory(val);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('lotus_query_history');
    } catch {}
  };

  // Autocomplete suggestions based on last word
  const lastWord = useMemo(() => {
    const tokens = (query || '').split(/\s+/);
    const last = tokens.pop() || '';
    return last.replace(/[()[\]]/g, '').trim().toLowerCase();
  }, [query]);

  const suggestions = useMemo(() => {
    if (!lastWord || lastWord.length < 2) return [];
    if (['and', 'or', 'not'].includes(lastWord)) return [];
    return allTerms
      .filter((t) => t.toLowerCase().startsWith(lastWord) && t.toLowerCase() !== lastWord)
      .slice(0, 5);
  }, [lastWord, allTerms]);

  const applySuggestion = (suggested) => {
    const tokens = (query || '').split(/\s+/);
    tokens.pop(); // remove prefix
    const next = [...tokens, suggested].join(' ');
    setQuery(next);
  };

  const validation = useMemo(() => validateQuery(query), [query]);

  return (
    <div className="flex flex-col gap-3 qb">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="card__title">Query Builder</div>
        {validation && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              validation.type === 'valid'
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {validation.type === 'valid' ? '✓ ' : '⚠️ '}
            {validation.msg}
          </span>
        )}
      </div>

      {/* Input */}
      <div className="relative w-full">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="建立查詢語句，例如：[-22,-4,18] NOT emotion 或 reward AND dopamine"
          className="qb__input w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
          style={{ width: '100%' }}
        />
      </div>

      {/* Autocomplete suggestion pills */}
      {suggestions.length > 0 && (
        <div className="chip-row" style={{ marginTop: '-4px' }}>
          <span className="chip-label">✨ 自動補全：</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => applySuggestion(s)}
              className="chip-btn"
              title={`補全為 ${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Operators + Reset (single row) */}
      <div className="flex gap-2 flex-nowrap overflow-x-auto">
        {[
          { label: 'AND', onClick: () => append('AND') },
          { label: 'OR', onClick: () => append('OR') },
          { label: 'NOT', onClick: () => append('NOT') },
          { label: '(', onClick: () => append('(') },
          { label: ')', onClick: () => append(')') },
          { label: 'Reset', onClick: () => setQuery('') },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.onClick}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Quick Example Chips */}
      <div className="chip-row">
        <span className="chip-label">💡 範例：</span>
        {QUICK_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuery(ex);
              saveHistory(ex);
            }}
            className="chip-btn"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Search History Chips */}
      {history.length > 0 && (
        <div className="chip-row">
          <span className="chip-label">🕒 歷史：</span>
          {history.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setQuery(h)}
              className="chip-btn chip-btn--history"
            >
              {h}
            </button>
          ))}
          <button
            type="button"
            onClick={clearHistory}
            className="text-[11px] text-gray-400 hover:text-red-500 ml-1"
            style={{
              background: 'transparent !important',
              color: '#9ca3af !important',
              padding: '0 !important',
            }}
            title="清空歷史紀錄"
          >
            [清空]
          </button>
        </div>
      )}
    </div>
  );
}
