
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Terms } from './components/Terms'
import { RelatedTerms } from './components/RelatedTerms'
import { QueryBuilder } from './components/QueryBuilder'
import { Studies } from './components/Studies'
import { Locations } from './components/Locations'
import { NiiViewer } from './components/NiiViewer'
import { useUrlQueryState } from './hooks/useUrlQueryState'
import { getApiBaseUrl, setApiBaseUrl, DEFAULT_REMOTE_API, apiUrl } from './utils/apiConfig'
import './App.css'

export default function App () {
  const [query, setQuery] = useUrlQueryState('q')
  const [activeTab, setActiveTab] = useState('studies')
  const [copied, setCopied] = useState(false)

  // --- API config & connection state ---
  const [showApiModal, setShowApiModal] = useState(false)
  const [apiEndpoint, setApiEndpoint] = useState(() => getApiBaseUrl())
  const [apiTestStatus, setApiTestStatus] = useState('')
  const [apiTestMsg, setApiTestMsg] = useState('')
  const [showMixedBanner, setShowMixedBanner] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        const cur = getApiBaseUrl()
        return (cur && cur.startsWith('http:')) || (!cur && DEFAULT_REMOTE_API.startsWith('http:'))
      }
    } catch {}
    return false
  })

  const testApiConnection = async (target) => {
    const url = (target !== undefined ? target : apiEndpoint).trim().replace(/\/+$/, '')
    const testUrl = url ? `${url}/help` : '/help'
    setApiTestStatus('testing')
    setApiTestMsg('連線測試中...')
    try {
      const t0 = performance.now()
      const res = await fetch(testUrl, { signal: AbortSignal.timeout(5000) })
      const dt = Math.round(performance.now() - t0)
      if (res.ok) {
        setApiTestStatus('ok')
        setApiTestMsg(`連線成功！(回應時間 ${dt}ms)`)
      } else {
        setApiTestStatus('error')
        setApiTestMsg(`伺服器回應 HTTP ${res.status}`)
      }
    } catch (e) {
      setApiTestStatus('error')
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && (url.startsWith('http:') || !url)) {
        setApiTestMsg('連線被瀏覽器阻擋（Mixed Content：HTTPS 頁面無法直接存取 HTTP 服務，請於網址列鎖頭允許不安全內容）')
      } else {
        setApiTestMsg(`連線失敗: ${e?.message || '無法連線至伺服器'}`)
      }
    }
  }

  const handleSaveApi = () => {
    setApiBaseUrl(apiEndpoint)
    setShowApiModal(false)
    window.location.reload()
  }

  // --- theme state: 'system' | 'dark' | 'light' ---
  const [themeMode, setThemeMode] = useState(() => {
    try {
      return localStorage.getItem('lotus_theme') || 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    const applyTheme = () => {
      let isDark = false
      if (themeMode === 'dark') isDark = true
      else if (themeMode === 'light') isDark = false
      else isDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)

      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }

    applyTheme()
    try {
      localStorage.setItem('lotus_theme', themeMode)
    } catch {}

    if (!window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onMediaChange = () => {
      if (themeMode === 'system') applyTheme()
    }
    media.addEventListener('change', onMediaChange)
    return () => media.removeEventListener('change', onMediaChange)
  }, [themeMode])

  const cycleTheme = () => {
    setThemeMode((m) => (m === 'system' ? 'dark' : m === 'dark' ? 'light' : 'system'))
  }

  const [activeTerm, setActiveTerm] = useState('')
  const [selectedCoord, setSelectedCoord] = useState(null)

  // Derive effective term for RelatedTerms
  const effectiveTerm = useMemo(() => {
    if (activeTerm) return activeTerm
    if (!query) return ''
    const tokens = query.split(/\s+/)
    for (const tok of tokens) {
      const clean = tok.replace(/^[([{"']+|[)\]}"',]+$/g, '').trim()
      if (clean && !['AND', 'OR', 'NOT'].includes(clean.toUpperCase()) && !clean.startsWith('[')) {
        return clean
      }
    }
    return ''
  }, [activeTerm, query])

  const handlePickTerm = useCallback((t, mode = 'and') => {
    if (!t) return
    if (typeof t === 'string' && !t.startsWith('[')) {
      setActiveTerm(t)
    }
    setQuery((q) => {
      const cur = (q || '').trim()
      if (!cur) return t
      if (mode === 'replace') return t
      if (mode === 'or') {
        return /\b(AND|OR|NOT)\s*$/i.test(cur) ? `${cur} ${t}` : `${cur} OR ${t}`
      }
      // If already ends with an operator or open paren, append directly
      if (/\b(AND|OR|NOT)\s*$/i.test(cur) || cur.endsWith('(')) {
        return `${cur} ${t}`
      }
      // Default smart mode: append with AND
      return `${cur} AND ${t}`
    })
  }, [setQuery])

  const handleShare = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // --- resizable panes state ---
  const gridRef = useRef(null)
  const [sizes, setSizes] = useState([28, 44, 28]) // [left, middle, right]
  const MIN_PX = 240

  const startDrag = (which, e) => {
    e.preventDefault()
    const startX = e.clientX
    const rect = gridRef.current.getBoundingClientRect()
    const total = rect.width
    const curPx = sizes.map(p => (p / 100) * total)

    const onMouseMove = (ev) => {
      const dx = ev.clientX - startX
      if (which === 0) {
        let newLeft = curPx[0] + dx
        let newMid = curPx[1] - dx
        if (newLeft < MIN_PX) { newMid -= (MIN_PX - newLeft); newLeft = MIN_PX }
        if (newMid < MIN_PX) { newLeft -= (MIN_PX - newMid); newMid = MIN_PX }
        const s0 = (newLeft / total) * 100
        const s1 = (newMid / total) * 100
        const s2 = 100 - s0 - s1
        setSizes([s0, s1, Math.max(s2, 0)])
      } else {
        let newMid = curPx[1] + dx
        let newRight = curPx[2] - dx
        if (newMid < MIN_PX) { newRight -= (MIN_PX - newMid); newMid = MIN_PX }
        if (newRight < MIN_PX) { newMid -= (MIN_PX - newRight); newRight = MIN_PX }
        const s1 = (newMid / total) * 100
        const s2 = (newRight / total) * 100
        const s0 = (curPx[0] / total) * 100
        setSizes([s0, s1, Math.max(s2, 0)])
      }
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="app">
      {/* Inline style injection to enforce no-hover look */}
      <style>{`
        :root {
          --primary-600: #2563eb;
          --primary-700: #1d4ed8;
          --primary-800: #1e40af;
          --border: #e5e7eb;
        }
        [data-theme="dark"] {
          --border: #223049;
          --primary-600: #3b82f6;
        }
        .app { padding: 18px !important; box-sizing: border-box; width: 100%; max-width: 100vw; overflow-x: hidden; }
        .app__grid { width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
        .card:not(.card--nii) input[type="text"],
        .card:not(.card--nii) input[type="search"],
        .card:not(.card--nii) input[type="number"],
        .card:not(.card--nii) select,
        .card:not(.card--nii) textarea {
          width: 100% !important;
          max-width: 100% !important;
          display: block;
        }
        .card--nii {
          min-width: 200px;
          overflow-x: hidden !important;
          overflow-y: auto !important;
        }
        /* Downsized buttons */
        .card button,
        .card [role="button"],
        .card .btn,
        .card .button {
          font-size: 12px !important;
          padding: 4px 8px !important;
          border-radius: 8px !important;
          line-height: 1.2 !important;
          background: var(--primary-600) !important;
          color: #fff !important;
          border: none !important;
        }
        /* No visual change on hover/active */
        .card button:hover,
        .card button:active,
        .card [role="button"]:hover,
        .card [role="button"]:active,
        .card .btn:hover,
        .card .btn:active,
        .card .button:hover,
        .card .button:active {
          background: var(--primary-600) !important;
          color: #fff !important;
        }
        /* Toolbars / chips also no-hover */
        .card .toolbar button,
        .card .toolbar [role="button"],
        .card .toolbar .btn,
        .card .toolbar .button,
        .card .qb-toolbar button,
        .card .qb-toolbar [role="button"],
        .card .qb-toolbar .btn,
        .card .qb-toolbar .button,
        .card .query-builder button,
        .card .query-builder [role="button"],
        .card .query-builder .btn,
        .card .query-builder .button,
        .card .chip,
        .card .pill,
        .card .tag {
          background: var(--primary-600) !important;
          color: #fff !important;
          border: none !important;
        }
        .card .toolbar button:hover,
        .card .qb-toolbar button:hover,
        .card .query-builder button:hover,
        .card .chip:hover,
        .card .pill:hover,
        .card .tag:hover,
        .card .toolbar button:active,
        .card .qb-toolbar button:active,
        .card .query-builder button:active {
          background: var(--primary-600) !important;
          color: #fff !important;
        }
        /* Disabled stays same color but dimmer for affordance */
        .card .toolbar button:disabled,
        .card .qb-toolbar button:disabled,
        .card .query-builder button:disabled,
        .card button[disabled],
        .card [aria-disabled="true"] {
          background: var(--primary-600) !important;
          color: #fff !important;
          opacity: .55 !important;
        }
      `}</style>

      <header className="app__header">
        <div className="app__brand">
          <div className="app__logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04" />
            </svg>
          </div>
          <div>
            <div className="app__title-group">
              <h1 className="app__title">LoTUS-BF</h1>
              <span className="app__badge">v2.0 Modern</span>
            </div>
            <div className="app__subtitle">
              Location-or-Term Unified Search for Brain Functions (Neuroinformatics & Psychoinformatics)
            </div>
          </div>
        </div>

        <div className="app__header-actions">
          <div className="theme-toggle-group">
            <span className="theme-toggle-label">外觀：</span>
            <button
              type="button"
              onClick={cycleTheme}
              className="theme-toggle-btn"
              title={`切換網頁外觀主題：目前為【${themeMode === 'system' ? '自動（跟隨系統）' : themeMode === 'dark' ? '深色模式' : '淺色模式'}】（點擊切換）`}
            >
              {themeMode === 'system' && '🖥️ 自動'}
              {themeMode === 'dark' && '🌙 深色'}
              {themeMode === 'light' && '☀️ 淺色'}
            </button>
          </div>
          <button
            type="button"
            onClick={handleShare}
            className="app__share-btn"
          >
            🔗 {copied ? '已複製！' : '分享搜尋'}
          </button>
          <button
            type="button"
            onClick={() => {
              setApiEndpoint(getApiBaseUrl())
              setApiTestStatus('')
              setApiTestMsg('')
              setShowApiModal(true)
            }}
            className="app__status-badge"
            style={{ cursor: 'pointer', border: 'none', background: 'inherit' }}
            title="點擊設定或更換後端 API 伺服器端點"
          >
            <span className="app__status-dot" />
            API 設定
          </button>
        </div>
      </header>

      {showMixedBanner && (
        <div style={{
          background: 'rgba(234, 88, 12, 0.12)',
          borderBottom: '1px solid rgba(234, 88, 12, 0.3)',
          color: 'var(--text-main)',
          padding: '8px 16px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxSizing: 'border-box',
          width: '100%'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>⚠️ <strong>跨協議提示 (Mixed Content)</strong>：本站以 HTTPS 運行，而課程伺服器為 HTTP 協定。若搜尋資料未顯示，請點擊瀏覽器網址列左側圖示（或鎖頭）將「不安全內容 (Insecure content)」設為「允許」並重新整理；亦可點擊右上角「API 設定」自訂端點。</span>
          </div>
          <button
            type="button"
            onClick={() => setShowMixedBanner(false)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '15px',
              color: 'inherit',
              padding: '2px 6px'
            }}
            title="關閉提示"
          >
            ✕
          </button>
        </div>
      )}

      <main className="app__grid" ref={gridRef}>
        <section className="card card--terms" style={{ flexBasis: `${sizes[0]}%` }}>
          <div className="card__title">Terms</div>
          <Terms onPickTerm={handlePickTerm} />
          <div className="divider" style={{ margin: '14px 0' }} />
          <RelatedTerms
            activeTerm={effectiveTerm}
            onSelectTerm={setActiveTerm}
            onPickTerm={handlePickTerm}
          />
        </section>

        <div className="resizer" aria-label="Resize left/middle" onMouseDown={(e) => startDrag(0, e)} />

        <section className="card card--stack" style={{ flexBasis: `${sizes[1]}%` }}>
          <QueryBuilder query={query} setQuery={setQuery} />
          <div className="divider" />

          {/* Studies vs Locations Tab switcher */}
          <div className="tab-bar">
            <button
              type="button"
              onClick={() => setActiveTab('studies')}
              className={activeTab === 'studies' ? 'tab-btn tab-btn--active' : 'tab-btn'}
            >
              📄 相關論文 (Studies)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('locations')}
              className={activeTab === 'locations' ? 'tab-btn tab-btn--active' : 'tab-btn'}
            >
              📍 活化座標 (Locations)
            </button>
          </div>

          {activeTab === 'studies' ? (
            <Studies query={query} />
          ) : (
            <Locations query={query} onSelectCoord={setSelectedCoord} />
          )}
        </section>

        <div className="resizer" aria-label="Resize middle/right" onMouseDown={(e) => startDrag(1, e)} />

        <section className="card card--nii" style={{ flexBasis: `${sizes[2]}%` }}>
          <NiiViewer query={query} onAddCoord={handlePickTerm} targetCoord={selectedCoord} />
        </section>
      </main>

      {/* API Configuration Modal */}
      {showApiModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-card, #fff)',
            color: 'var(--text-main, #111)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 520,
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            border: '1px solid var(--border, #e5e7eb)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>⚙️ 後端 API 伺服器設定</h2>
              <button
                type="button"
                onClick={() => setShowApiModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-sub, #6b7280)', margin: 0, lineHeight: 1.5 }}>
              本專案前端可靈活連接課程官方伺服器、本機開發代理或任何相容的 LoTUS-BF REST API。
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>快捷切換：</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setApiEndpoint(DEFAULT_REMOTE_API)
                    testApiConnection(DEFAULT_REMOTE_API)
                  }}
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border, #ccc)',
                    background: apiEndpoint === DEFAULT_REMOTE_API ? 'var(--primary-600, #3b82f6)' : 'transparent',
                    color: apiEndpoint === DEFAULT_REMOTE_API ? '#fff' : 'inherit',
                    cursor: 'pointer'
                  }}
                >
                  🏫 臺大課程官方 HPC (hpc.psy.ntu.edu.tw:5000)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApiEndpoint('')
                    testApiConnection('')
                  }}
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border, #ccc)',
                    background: !apiEndpoint ? 'var(--primary-600, #3b82f6)' : 'transparent',
                    color: !apiEndpoint ? '#fff' : 'inherit',
                    cursor: 'pointer'
                  }}
                >
                  💻 相對路徑 / 本機代理 (/)
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>API Base URL：</label>
              <input
                type="text"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="留空代表相對路徑（使用本地代理）"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border, #ccc)',
                  background: 'var(--bg-main, #f9fafb)',
                  color: 'inherit',
                  fontSize: 13
                }}
              />
            </div>

            {apiTestStatus && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                background: apiTestStatus === 'ok' ? 'rgba(34, 197, 94, 0.15)' : apiTestStatus === 'testing' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: apiTestStatus === 'ok' ? '#16a34a' : apiTestStatus === 'testing' ? '#2563eb' : '#dc2626',
                border: `1px solid ${apiTestStatus === 'ok' ? 'rgba(34, 197, 94, 0.3)' : apiTestStatus === 'testing' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                {apiTestMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => testApiConnection(apiEndpoint)}
                disabled={apiTestStatus === 'testing'}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border, #ccc)',
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                🔍 測試連線
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowApiModal(false)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border, #ccc)',
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveApi}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    background: 'var(--primary-600, #3b82f6)',
                    color: '#fff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  儲存並套用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
