// src/components/RelatedTerms.jsx
import { useEffect, useState } from 'react'
import { apiUrl } from '../utils/apiConfig'

const SUGGESTIONS = ['reward', 'memory', 'emotion', 'language', 'pain', 'attention']

export function RelatedTerms({ activeTerm, onSelectTerm, onPickTerm }) {
  const [termInput, setTermInput] = useState('')
  const [related, setRelated] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [addMode, setAddMode] = useState('and') // 'and' | 'or' | 'replace'

  // Sync internal input when external activeTerm changes
  useEffect(() => {
    if (activeTerm) {
      setTermInput(activeTerm)
    }
  }, [activeTerm])

  const targetTerm = (termInput || activeTerm || '').trim().toLowerCase()

  useEffect(() => {
    if (!targetTerm || targetTerm.startsWith('[')) {
      setRelated([])
      return
    }

    let alive = true
    const ac = new AbortController()

    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const res = await fetch(apiUrl(`/terms/${encodeURIComponent(targetTerm)}`), { signal: ac.signal })
        if (!res.ok) {
          if (res.status === 404) {
            setRelated([])
            return
          }
          throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        if (!alive) return
        setRelated(Array.isArray(data?.related) ? data.related.slice(0, 16) : [])
      } catch (e) {
        if (!alive) return
        setErr(e?.message || String(e))
        setRelated([])
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
      ac.abort()
    }
  }, [targetTerm])

  const handleSelect = (t) => {
    setTermInput(t)
    onSelectTerm?.(t)
  }

  const handleAdd = (t, mode = addMode) => {
    onPickTerm?.(t, mode)
    handleSelect(t)
  }

  return (
    <div className="related-terms">
      <div className="related-terms__header">
        <div className="related-terms__title-wrap">
          <span className="related-terms__title">💡 相關詞彙</span>
          <span className="related-terms__subtitle">(/terms/:term)</span>
        </div>
        {loading && <span className="related-terms__badge">載入中...</span>}
      </div>

      <div className="related-terms__input-row">
        <input
          type="text"
          value={termInput}
          onChange={(e) => {
            setTermInput(e.target.value)
            onSelectTerm?.(e.target.value)
          }}
          placeholder="輸入或點選詞彙查詢相關詞..."
          className="related-terms__input"
        />
        {termInput && (
          <button
            type="button"
            onClick={() => {
              setTermInput('')
              onSelectTerm?.('')
            }}
            className="related-terms__clear-btn"
            title="清除"
          >
            ✕
          </button>
        )}
      </div>

      {err && <div className="related-terms__err">{err}</div>}

      {!targetTerm && (
        <div className="related-terms__empty">
          <div className="related-terms__hint">
            點選上方詞彙列表，或試試這些熱門神經科學主題：
          </div>
          <div className="related-terms__suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSelect(s)}
                className="chip-btn"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {targetTerm && !loading && related.length === 0 && !err && (
        <div className="related-terms__hint">查無「{targetTerm}」的相關詞資料</div>
      )}

      {related.length > 0 && (
        <div className="related-terms__list-wrap">
          {/* Mode Switcher */}
          <div className="related-terms__mode-row">
            <span className="related-terms__mode-label">點選加入方式：</span>
            <div className="related-terms__mode-pills">
              <button
                type="button"
                onClick={() => setAddMode('and')}
                className={`related-mode-btn ${addMode === 'and' ? 'related-mode-btn--active' : ''}`}
                title="點擊詞彙以 AND (交集) 附加到搜尋句"
              >
                + AND (交集)
              </button>
              <button
                type="button"
                onClick={() => setAddMode('or')}
                className={`related-mode-btn ${addMode === 'or' ? 'related-mode-btn--active' : ''}`}
                title="點擊詞彙以 OR (聯集) 附加到搜尋句"
              >
                + OR (聯集)
              </button>
              <button
                type="button"
                onClick={() => setAddMode('replace')}
                className={`related-mode-btn ${addMode === 'replace' ? 'related-mode-btn--active' : ''}`}
                title="點擊詞彙直接替換搜尋詞"
              >
                替換
              </button>
            </div>
          </div>

          <div className="related-terms__meta">
            與「<strong>{targetTerm}</strong>」高度相關詞彙（Jaccard 相似度）：
          </div>

          <div className="related-terms__list">
            {related.map((item) => (
              <button
                key={item.term}
                type="button"
                onClick={() => handleAdd(item.term, addMode)}
                className="related-term-chip"
                title={`以 ${addMode.toUpperCase()} 加入搜尋：共同研究 ${item.co_count} 篇 | Jaccard ${(item.jaccard * 100).toFixed(1)}%`}
              >
                <span className="related-term-name">{item.term}</span>
                <span className="related-term-pct">
                  {(item.jaccard * 100).toFixed(0)}%
                </span>
                <span className="related-term-add" title={`加入方式：${addMode}`}>
                  {addMode === 'replace' ? '➔' : `+${addMode.toUpperCase()}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
