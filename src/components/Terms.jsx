import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../utils/apiConfig'

export function Terms ({ onPickTerm }) {
  const [terms, setTerms] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [addMode, setAddMode] = useState('and') // 'and' | 'or' | 'replace'

  useEffect(() => {
    let alive = true
    const ac = new AbortController()
    const load = async () => {
      setLoading(true)
      setErr('')
      try {
        const res = await fetch(apiUrl('/terms'), { signal: ac.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!alive) return
        setTerms(Array.isArray(data?.terms) ? data.terms : [])
      } catch (e) {
        if (!alive) return
        setErr(`Failed to fetch terms: ${e?.message || e}`)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false; ac.abort() }
  }, [])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return terms
    return terms.filter(t => t.toLowerCase().includes(s))
  }, [terms, search])

  return (
    <div className='terms'>
      {/* Search Controls */}
      <div className='terms__controls'>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Search terms…'
          className='input'
        />
        <button
          onClick={() => setSearch('')}
          className='btn btn--primary'
        >
          Clear
        </button>
      </div>

      {/* Mode Switcher */}
      <div className='related-terms__mode-row'>
        <span className='related-terms__mode-label'>點選加入方式：</span>
        <div className='related-terms__mode-pills'>
          <button
            type='button'
            onClick={() => setAddMode('and')}
            className={`related-mode-btn ${addMode === 'and' ? 'related-mode-btn--active' : ''}`}
            title='點擊詞彙以 AND (交集) 附加到搜尋句'
          >
            + AND (交集)
          </button>
          <button
            type='button'
            onClick={() => setAddMode('or')}
            className={`related-mode-btn ${addMode === 'or' ? 'related-mode-btn--active' : ''}`}
            title='點擊詞彙以 OR (聯集) 附加到搜尋句'
          >
            + OR (聯集)
          </button>
          <button
            type='button'
            onClick={() => setAddMode('replace')}
            className={`related-mode-btn ${addMode === 'replace' ? 'related-mode-btn--active' : ''}`}
            title='點擊詞彙直接替換搜尋詞'
          >
            替換
          </button>
        </div>
      </div>

      {loading && (
        <div className='terms__skeleton'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='terms__skeleton-row' />
          ))}
        </div>
      )}

      {err && (
        <div className='alert alert--error'>
          {err}
        </div>
      )}

      {!loading && !err && (
        <div className='terms__list'>
          {filtered.length === 0 ? (
            <div className='terms__empty'>No terms found</div>
          ) : (
            <ul className='terms__ul'>
              {filtered.slice(0, 500).map((t, idx) => (
                <li key={`${t}-${idx}`} className='terms__li'>
                  <a
                    href='#'
                    className='terms__name'
                    title={`以 ${addMode.toUpperCase()} 方式加入 ${t}`}
                    aria-label={`Add term ${t}`}
                    onClick={(e) => {
                      e.preventDefault()
                      onPickTerm?.(t, addMode)
                    }}
                  >
                    <span>{t}</span>
                    <span className='terms__action-badge'>
                      {addMode === 'replace' ? '➔ 替換' : `+${addMode.toUpperCase()}`}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
