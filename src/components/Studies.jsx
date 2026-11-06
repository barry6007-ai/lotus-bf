import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeQueryForApi } from '../utils/queryUtils'
import { apiUrl } from '../utils/apiConfig'

function classNames (...xs) { return xs.filter(Boolean).join(' ') }

export function Studies ({ query }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [sortKey, setSortKey] = useState('year')
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  const [page, setPage] = useState(1)
  const [copiedId, setCopiedId] = useState(null)
  const [yearRange, setYearRange] = useState(null) // [startYear, endYear] | null
  const [dragStartYear, setDragStartYear] = useState(null)
  const [pageSize, setPageSize] = useState(20) // 20 | 50 | 100 | 'all'
  const svgRef = useRef(null)

  useEffect(() => {
    setPage(1)
    setYearRange(null)
  }, [query])

  // Global mouseup listener for smooth brush dragging
  useEffect(() => {
    const handleGlobalMouseUp = () => setDragStartYear(null)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  useEffect(() => {
    if (!query) return
    let alive = true
    const ac = new AbortController()
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const apiQuery = normalizeQueryForApi(query)
        const url = apiUrl(`/query/${encodeURIComponent(apiQuery)}/studies`)
        const res = await fetch(url, { signal: ac.signal })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
        if (!alive) return
        const list = Array.isArray(data?.results) ? data.results : []
        setRows(list)
      } catch (e) {
        if (!alive) return
        setErr(`Unable to fetch studies: ${e?.message || e}`)
        setRows([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false; ac.abort() }
  }, [query])

  const changeSort = (key) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // Publication year distribution for Bar Chart
  const yearDistribution = useMemo(() => {
    if (!rows.length) return { data: [], maxCount: 1 }
    const counts = {}
    for (const r of rows) {
      const y = Number(r.year)
      if (y && y >= 1970 && y <= 2040) {
        counts[y] = (counts[y] || 0) + 1
      }
    }
    const years = Object.keys(counts).map(Number).sort((a, b) => a - b)
    if (!years.length) return { data: [], maxCount: 1 }
    const minYear = years[0]
    const maxYear = years[years.length - 1]
    const result = []
    let maxCount = 1
    for (let y = minYear; y <= maxYear; y++) {
      const c = counts[y] || 0
      if (c > maxCount) maxCount = c
      result.push({ year: y, count: c })
    }
    return { data: result, maxCount }
  }, [rows])

  const fullMinYear = yearDistribution.data?.[0]?.year || 1990
  const fullMaxYear = yearDistribution.data?.[yearDistribution.data.length - 1]?.year || 2024
  const currentRange = yearRange || [fullMinYear, fullMaxYear]

  // Filter by selected year range if active
  const filteredRows = useMemo(() => {
    if (!yearRange) return rows
    const [start, end] = yearRange
    return rows.filter((r) => {
      const y = Number(r.year)
      return y >= start && y <= end
    })
  }, [rows, yearRange])

  const sorted = useMemo(() => {
    const arr = [...filteredRows]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const A = a?.[sortKey]
      const B = b?.[sortKey]
      if (sortKey === 'year') return (Number(A || 0) - Number(B || 0)) * dir
      return String(A || '').localeCompare(String(B || ''), 'en') * dir
    })
    return arr
  }, [filteredRows, sortKey, sortDir])

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = pageSize === 'all' ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize)

  // Export CSV
  const handleExportCSV = () => {
    if (!rows.length) return
    const headers = ['Year', 'Journal', 'Title', 'Authors', 'Study_ID']
    const csvLines = [
      headers.join(','),
      ...rows.map(r => [
        r.year ?? '',
        `"${String(r.journal || '').replace(/"/g, '""')}"`,
        `"${String(r.title || '').replace(/"/g, '""')}"`,
        `"${String(r.authors || '').replace(/"/g, '""')}"`,
        r.study_id ?? ''
      ].join(','))
    ]
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `studies_${query.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Copy citation
  const handleCopyCitation = (r, e) => {
    e.stopPropagation()
    const citation = `${r.authors || 'Unknown'} (${r.year || 'n.d.'}). ${r.title || 'Untitled'}. ${r.journal || ''}.`
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(citation)
      setCopiedId(r.study_id || r.id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  // SVG Chart Geometry Constants
  const SVG_WIDTH = 620
  const SVG_HEIGHT = 175
  const PADDING_LEFT = 45
  const PADDING_RIGHT = 20
  const PADDING_TOP = 25
  const PADDING_BOTTOM = 35
  const PLOT_WIDTH = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT
  const PLOT_HEIGHT = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM
  const BASELINE_Y = PADDING_TOP + PLOT_HEIGHT

  const dataLen = yearDistribution.data.length
  const slotWidth = dataLen > 0 ? PLOT_WIDTH / dataLen : 0
  const barWidth = Math.max(3, Math.min(22, slotWidth * 0.72))

  // Map mouse coordinate to Year
  const getYearFromEvent = (e) => {
    const svg = svgRef.current
    if (!svg || dataLen === 0) return null
    const rect = svg.getBoundingClientRect()
    const clickX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH
    const clampedX = Math.max(PADDING_LEFT, Math.min(PADDING_LEFT + PLOT_WIDTH, clickX))
    const idx = Math.min(dataLen - 1, Math.max(0, Math.floor((clampedX - PADDING_LEFT) / slotWidth)))
    return yearDistribution.data[idx]?.year
  }

  const handleSvgMouseDown = (e) => {
    e.preventDefault()
    const y = getYearFromEvent(e)
    if (y != null) {
      setDragStartYear(y)
      setYearRange([y, y])
    }
  }

  const handleSvgMouseMove = (e) => {
    if (dragStartYear !== null) {
      const curY = getYearFromEvent(e)
      if (curY != null) {
        setYearRange([Math.min(dragStartYear, curY), Math.max(dragStartYear, curY)])
      }
    }
  }

  // Calculate brush overlay coordinates
  const brushBox = useMemo(() => {
    if (!yearRange || dataLen === 0) return null
    const [start, end] = yearRange
    const startIdx = yearDistribution.data.findIndex(d => d.year === start)
    const endIdx = yearDistribution.data.findIndex(d => d.year === end)
    if (startIdx === -1 || endIdx === -1) return null
    const x1 = PADDING_LEFT + startIdx * slotWidth
    const x2 = PADDING_LEFT + (endIdx + 1) * slotWidth
    return { x: x1, width: x2 - x1 }
  }, [yearRange, dataLen, slotWidth, yearDistribution.data])

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const max = yearDistribution.maxCount || 1
    if (max <= 3) return [0, max]
    const mid = Math.ceil(max / 2)
    return [0, mid, max]
  }, [yearDistribution.maxCount])

  return (
    <div className='flex flex-col rounded-2xl border'>
      <div className='flex items-center justify-between p-3 flex-wrap gap-2'>
        <div className='flex items-center gap-2'>
          <div className='card__title'>Studies</div>
          <span className='text-xs text-gray-500 font-medium'>
            {yearRange
              ? `(顯示 ${sorted.length} / 共 ${rows.length} 篇研究)`
              : `(共 ${rows.length} 篇研究)`}
          </span>
        </div>
        {rows.length > 0 && (
          <button
            type='button'
            onClick={handleExportCSV}
            className='inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg cursor-pointer'
            style={{ background: 'var(--primary-600)', color: '#fff', border: 'none' }}
            title='匯出文獻列表為 CSV 檔案'
          >
            📥 匯出 CSV
          </button>
        )}
      </div>

      {/* SVG Bar Chart with X & Y Axes and Range Brush Selection */}
      {rows.length > 0 && dataLen > 1 && (
        <div className='px-3 pb-3 border-b'>
          <div className='flex items-center justify-between text-xs text-gray-500 mb-1 flex-wrap gap-1'>
            <span className='font-semibold text-gray-700'>
              📊 年份長條分佈圖
            </span>
            {yearRange ? (
              <div className='flex items-center gap-2'>
                <span className='font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200'>
                  範圍：{yearRange[0]} ～ {yearRange[1]} 年 ({filteredRows.length} 篇)
                </span>
                <button
                  type='button'
                  onClick={() => setYearRange(null)}
                  className='text-xs text-gray-500 hover:text-red-600 underline cursor-pointer'
                >
                  ✕ 重設
                </button>
              </div>
            ) : (
              <span className='text-[11px] text-gray-400'>
                可在圖表中按住滑鼠直接拖曳拉選 X 軸年份範圍
              </span>
            )}
          </div>

          {/* SVG Coordinate Chart */}
          <div className='w-full overflow-hidden'>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className='w-full h-auto select-none'
              style={{ maxHeight: '185px', cursor: dragStartYear !== null ? 'col-resize' : 'crosshair' }}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
            >
              {/* Y-axis Title */}
              <text
                x={PADDING_LEFT - 6}
                y={14}
                textAnchor='end'
                fontSize='10'
                fontWeight='600'
                fill='var(--muted)'
              >
                篇數 (Y)
              </text>

              {/* Y-axis Ticks & Horizontal Gridlines */}
              {yTicks.map(val => {
                const yPos = BASELINE_Y - (val / (yearDistribution.maxCount || 1)) * PLOT_HEIGHT
                return (
                  <g key={val}>
                    <line
                      x1={PADDING_LEFT}
                      y1={yPos}
                      x2={PADDING_LEFT + PLOT_WIDTH}
                      y2={yPos}
                      stroke='var(--border)'
                      strokeDasharray={val === 0 ? 'none' : '3 3'}
                      strokeWidth={val === 0 ? '1.5' : '1'}
                      opacity={0.8}
                    />
                    <text
                      x={PADDING_LEFT - 8}
                      y={yPos + 3.5}
                      textAnchor='end'
                      fontSize='10'
                      fill='var(--muted)'
                    >
                      {val}
                    </text>
                  </g>
                )
              })}

              {/* Y-axis Line */}
              <line
                x1={PADDING_LEFT}
                y1={PADDING_TOP}
                x2={PADDING_LEFT}
                y2={BASELINE_Y}
                stroke='var(--border)'
                strokeWidth='1.5'
              />

              {/* X-axis Baseline */}
              <line
                x1={PADDING_LEFT}
                y1={BASELINE_Y}
                x2={PADDING_LEFT + PLOT_WIDTH}
                y2={BASELINE_Y}
                stroke='var(--border)'
                strokeWidth='1.5'
              />

              {/* X-axis Title */}
              <text
                x={SVG_WIDTH - PADDING_RIGHT}
                y={SVG_HEIGHT - 6}
                textAnchor='end'
                fontSize='10'
                fontWeight='600'
                fill='var(--muted)'
              >
                年份 (X)
              </text>

              {/* Bars and X-axis Labels */}
              {yearDistribution.data.map(({ year, count }, idx) => {
                const h = (count / (yearDistribution.maxCount || 1)) * PLOT_HEIGHT
                const barX = PADDING_LEFT + idx * slotWidth + (slotWidth - barWidth) / 2
                const barY = BASELINE_Y - h
                const inRange = !yearRange || (year >= yearRange[0] && year <= yearRange[1])
                const isEdge = idx === 0 || idx === dataLen - 1
                const showXLabel = dataLen <= 15 ? true : (year % 5 === 0 || isEdge)
                const labelX = PADDING_LEFT + idx * slotWidth + slotWidth / 2

                return (
                  <g key={year}>
                    {/* Vertical Bar */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={Math.max(1, h)}
                      rx='2'
                      fill={inRange ? 'var(--primary-600)' : '#cbd5e1'}
                      opacity={inRange ? (count > 0 ? 0.95 : 0.4) : 0.25}
                      style={{ transition: 'all 0.15s ease' }}
                    />

                    {/* Small Tick on X axis */}
                    <line
                      x1={labelX}
                      y1={BASELINE_Y}
                      x2={labelX}
                      y2={BASELINE_Y + 4}
                      stroke='var(--border)'
                      strokeWidth='1'
                    />

                    {/* X-axis Year Label */}
                    {showXLabel && (
                      <text
                        x={labelX}
                        y={BASELINE_Y + 16}
                        textAnchor='middle'
                        fontSize='9'
                        fill={inRange ? 'var(--fg)' : 'var(--muted)'}
                        fontWeight={inRange ? '600' : 'normal'}
                      >
                        {year}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Brush Range Overlay (Highlighting Selected X Region) */}
              {brushBox && (
                <rect
                  x={brushBox.x}
                  y={PADDING_TOP}
                  width={Math.max(2, brushBox.width)}
                  height={PLOT_HEIGHT}
                  fill='rgba(37, 99, 235, 0.15)'
                  stroke='#2563eb'
                  strokeWidth='1.5'
                  strokeDasharray='4 2'
                  rx='3'
                  pointerEvents='none'
                />
              )}
            </svg>
          </div>

          {/* Range Sliders for X-axis underneath */}
          <div className='flex items-center gap-2 mt-2 pt-2 border-t border-dashed'>
            <span className='text-xs font-semibold text-gray-500 whitespace-nowrap'>X 軸範圍：</span>
            <div className='flex items-center gap-1 text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200'>
              <span>{currentRange[0]}</span>
            </div>
            <input
              type='range'
              min={fullMinYear}
              max={fullMaxYear}
              value={currentRange[0]}
              onChange={(e) => {
                const val = Math.min(Number(e.target.value), currentRange[1])
                setYearRange([val, currentRange[1]])
              }}
              className='flex-1 h-1.5 accent-blue-600 cursor-pointer'
              title='調整 X 軸起始年份'
            />
            <span className='text-xs text-gray-400 font-medium'>～</span>
            <input
              type='range'
              min={fullMinYear}
              max={fullMaxYear}
              value={currentRange[1]}
              onChange={(e) => {
                const val = Math.max(Number(e.target.value), currentRange[0])
                setYearRange([currentRange[0], val])
              }}
              className='flex-1 h-1.5 accent-blue-600 cursor-pointer'
              title='調整 X 軸結束年份'
            />
            <div className='flex items-center gap-1 text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200'>
              <span>{currentRange[1]}</span>
            </div>
            {yearRange && (
              <button
                type='button'
                onClick={() => setYearRange(null)}
                className='text-xs px-2 py-0.5 rounded border bg-white hover:bg-gray-50 text-gray-600 cursor-pointer font-medium'
                title='重設為全部年份'
              >
                重設
              </button>
            )}
          </div>
        </div>
      )}

      {!query && (
        <div className='p-8 text-center text-sm text-gray-400'>
          請在上方「Query Builder」輸入查詢語句（例如 reward 或 [-2, 50, -6]），或點選左側詞彙開始探索。
        </div>
      )}

      {query && loading && (
        <div className='grid gap-3 p-3'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='h-10 animate-pulse rounded-lg bg-gray-100' />
          ))}
        </div>
      )}

      {query && err && (
        <div className='mx-3 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700'>
          {err}
        </div>
      )}

      {query && !loading && !err && (
        <div className='overflow-auto'>
          <table className='min-w-full text-sm'>
            <thead className='sticky top-0 bg-gray-50 text-left'>
              <tr>
                {[
                  { key: 'year', label: 'Year' },
                  { key: 'journal', label: 'Journal' },
                  { key: 'title', label: 'Title' },
                  { key: 'authors', label: 'Authors' }
                ].map(({ key, label }) => (
                  <th key={key} className='cursor-pointer px-3 py-2 font-semibold' onClick={() => changeSort(key)}>
                    <span className='inline-flex items-center gap-2'>
                      {label}
                      <span className='text-xs text-gray-500'>{sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </span>
                  </th>
                ))}
                <th className='px-3 py-2 font-semibold text-right'>Citation</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={5} className='px-3 py-4 text-gray-500'>No data</td></tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr key={i} className={classNames(i % 2 ? 'bg-white' : 'bg-gray-50')}>
                    <td className='whitespace-nowrap px-3 py-2 align-top font-medium'>{r.year ?? ''}</td>
                    <td className='px-3 py-2 align-top text-gray-600'>{r.journal || ''}</td>
                    <td className='max-w-[480px] px-3 py-2 align-top'>
                      <div className='font-medium' title={r.title}>{r.title || ''}</div>
                    </td>
                    <td className='max-w-[200px] px-3 py-2 align-top text-xs text-gray-500'>
                      <div className='truncate' title={r.authors}>{r.authors || ''}</div>
                    </td>
                    <td className='px-3 py-2 align-top text-right whitespace-nowrap'>
                      <button
                        type='button'
                        onClick={(e) => handleCopyCitation(r, e)}
                        className='px-2 py-0.5 text-xs rounded border cursor-pointer'
                        style={{
                          background: copiedId === (r.study_id || r.id) ? '#10b981' : '#f3f4f6',
                          color: copiedId === (r.study_id || r.id) ? '#fff' : '#374151',
                          borderColor: '#d1d5db'
                        }}
                        title='複製 APA 論文引用格式'
                      >
                        {copiedId === (r.study_id || r.id) ? '✓ 已複製' : '📋 引用'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {query && !loading && !err && (
        <div className='flex items-center justify-between border-t p-3 text-sm flex-wrap gap-2'>
          <div className='text-xs text-gray-600'>
            {sorted.length === 0 ? (
              '無符合條件的研究'
            ) : pageSize === 'all' ? (
              <span>已完整顯示全部 <b>{sorted.length}</b> 篇研究</span>
            ) : (
              <span>
                顯示第 <b>{(page - 1) * pageSize + 1}</b> ～ <b>{Math.min(page * pageSize, sorted.length)}</b> 篇（共 <b>{sorted.length}</b> 篇）
              </span>
            )}
          </div>

          <div className='flex items-center gap-2'>
            {/* Page size dropdown */}
            <div className='flex items-center gap-1 text-xs text-gray-500 mr-1'>
              <span>每頁：</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value)
                  setPageSize(val)
                  setPage(1)
                }}
                className='rounded border px-1.5 py-0.5 text-xs'
                style={{ width: 'auto' }}
              >
                <option value={20}>20 筆</option>
                <option value={50}>50 筆</option>
                <option value={100}>100 筆</option>
                <option value='all'>全部顯示</option>
              </select>
            </div>

            {pageSize !== 'all' && totalPages > 1 && (
              <div className='flex items-center gap-1'>
                <button disabled={page <= 1} onClick={() => setPage(1)} className='rounded-lg border px-2 py-1 text-xs disabled:opacity-40 cursor-pointer'>⏮</button>
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className='rounded-lg border px-2 py-1 text-xs disabled:opacity-40 cursor-pointer'>上一頁</button>
                <span className='text-xs text-gray-500 font-mono px-1'>頁 {page}/{totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className='rounded-lg border px-2 py-1 text-xs disabled:opacity-40 cursor-pointer'>下一頁</button>
                <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className='rounded-lg border px-2 py-1 text-xs disabled:opacity-40 cursor-pointer'>⏭</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
