// Locations.jsx
import { useEffect, useMemo, useState } from 'react'
import { normalizeQueryForApi } from '../utils/queryUtils'
import { apiUrl } from '../utils/apiConfig'

function cls (...xs) { return xs.filter(Boolean).join(' ') }

export function Locations ({ query, onSelectCoord }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [r, setR] = useState(6.0)
  const [limit, setLimit] = useState(200)
  const [offset, setOffset] = useState(0)

  const [sortKey, setSortKey] = useState('study_id')
  const [sortDir, setSortDir] = useState('asc')
  const [pageSize, setPageSize] = useState(30)
  const [page, setPage] = useState(1)
  const [activeCoord, setActiveCoord] = useState(null)

  useEffect(() => { setPage(1); setOffset(0) }, [query])

  useEffect(() => {
    if (!query) return
    let alive = true
    const ac = new AbortController()
    ;(async () => {
      setLoading(true); setErr('')
      try {
        const apiQuery = normalizeQueryForApi(query)
        const endpoint = apiUrl(`/query/${encodeURIComponent(apiQuery)}/locations`)
        const u = new URL(endpoint, window.location.origin)
        u.searchParams.set('r', String(r))
        if (limit != null) u.searchParams.set('limit', String(limit))
        if (offset) u.searchParams.set('offset', String(offset))
        const fetchUrl = endpoint.startsWith('http') ? u.toString() : (u.pathname + u.search)
        const res = await fetch(fetchUrl, { signal: ac.signal })
        const data = await res.json().catch(()=>({}))
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
        if (!alive) return
        setRows(Array.isArray(data?.results) ? data.results : [])
      } catch (e) {
        if (!alive) return
        setErr(e?.message || String(e))
        setRows([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false; ac.abort() }
  }, [query, r, limit, offset])

  const sorted = useMemo(() => {
    const arr = [...rows]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a,b) => {
      const A = a?.[sortKey], B = b?.[sortKey]
      if (sortKey === 'study_id' || sortKey === 'x' || sortKey === 'y' || sortKey === 'z') {
        return ((Number(A)||0) - (Number(B)||0)) * dir
      }
      return String(A||'').localeCompare(String(B||'')) * dir
    })
    return arr
  }, [rows, sortKey, sortDir])

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = pageSize === 'all' ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize)

  const changeSort = (k) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  const handleExportCSV = () => {
    if (!rows.length) return
    const headers = ['Study_ID', 'X', 'Y', 'Z']
    const csvLines = [
      headers.join(','),
      ...rows.map(r => [r.study_id, r.x, r.y, r.z].join(','))
    ]
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `locations_${query.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleRowClick = (r) => {
    const coord = { x: Number(r.x), y: Number(r.y), z: Number(r.z) }
    setActiveCoord(coord)
    onSelectCoord?.(coord)
  }

  return (
    <div className='flex flex-col rounded-2xl border'>
      <div className='flex items-center justify-between p-3 flex-wrap gap-2'>
        <div className='flex items-center gap-2'>
          <div className='card__title'>Locations</div>
          <span className='text-xs text-gray-500 font-medium'>
            ({rows.length} 個活化點)
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-xs text-gray-400 hidden sm:inline'>💡 點擊任一列可跳轉切片</span>
          {rows.length > 0 && (
            <button
              type='button'
              onClick={handleExportCSV}
              className='inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg'
              style={{ background: 'var(--primary-600)', color: '#fff', border: 'none' }}
              title='匯出座標為 CSV 檔案'
            >
              📥 匯出 CSV
            </button>
          )}
        </div>
      </div>

      <div className='flex flex-wrap items-end gap-3 px-3 pb-2 text-sm'>
        <label className='flex flex-col text-xs font-medium'>r (mm)
          <input type='number' step='0.5' value={r} onChange={e=>setR(Number(e.target.value)||6)} className='w-20 rounded-lg border px-2 py-1 mt-0.5'/>
        </label>
        <label className='flex flex-col text-xs font-medium'>limit
          <input type='number' step='10' value={limit} onChange={e=>setLimit(Math.max(0, Number(e.target.value)||0))} className='w-20 rounded-lg border px-2 py-1 mt-0.5'/>
        </label>
        <label className='flex flex-col text-xs font-medium'>offset
          <input type='number' step='10' value={offset} onChange={e=>setOffset(Math.max(0, Number(e.target.value)||0))} className='w-20 rounded-lg border px-2 py-1 mt-0.5'/>
        </label>
      </div>

      {!query && <div className='px-3 pb-4 text-sm text-gray-500'>尚未提供查詢字串。</div>}
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
                  { key: 'study_id', label: 'Study ID' },
                  { key: 'x', label: 'X (mm)' },
                  { key: 'y', label: 'Y (mm)' },
                  { key: 'z', label: 'Z (mm)' }
                ].map(({ key, label }) => (
                  <th key={key} className='cursor-pointer px-3 py-2 font-semibold' onClick={() => changeSort(key)}>
                    <span className='inline-flex items-center gap-2'>
                      {label}
                      <span className='text-xs text-gray-500'>{sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </span>
                  </th>
                ))}
                <th className='px-3 py-2 font-semibold text-right'>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={5} className='px-3 py-4 text-gray-500'>無資料</td></tr>
              ) : (
                pageRows.map((r, i) => {
                  const isCurrent = activeCoord && activeCoord.x === Number(r.x) && activeCoord.y === Number(r.y) && activeCoord.z === Number(r.z)
                  return (
                    <tr
                      key={i}
                      onClick={() => handleRowClick(r)}
                      className={cls(
                        i % 2 ? 'bg-white' : 'bg-gray-50',
                        'cursor-pointer transition-colors',
                        isCurrent ? 'bg-blue-100 font-semibold' : 'hover:bg-blue-50'
                      )}
                      title="點擊跳轉切片視角至此座標"
                    >
                      <td className='px-3 py-2 align-top'>{r.study_id}</td>
                      <td className='px-3 py-2 align-top font-mono text-xs'>{r.x}</td>
                      <td className='px-3 py-2 align-top font-mono text-xs'>{r.y}</td>
                      <td className='px-3 py-2 align-top font-mono text-xs'>{r.z}</td>
                      <td className='px-3 py-2 align-top text-right text-xs text-blue-600'>
                        {isCurrent ? '🎯 目前切片' : '跳轉 ➔'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {query && !loading && !err && (
        <div className='flex items-center justify-between border-t p-3 text-sm flex-wrap gap-2'>
          <div className='text-xs text-gray-600'>
            {sorted.length === 0 ? (
              '無符合條件的活化座標'
            ) : pageSize === 'all' ? (
              <span>已完整顯示全部 <b>{sorted.length}</b> 個座標</span>
            ) : (
              <span>
                顯示第 <b>{(page - 1) * pageSize + 1}</b> ～ <b>{Math.min(page * pageSize, sorted.length)}</b> 個（共 <b>{sorted.length}</b> 個活化點）
              </span>
            )}
          </div>

          <div className='flex items-center gap-2'>
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
                <option value={30}>30 筆</option>
                <option value={60}>60 筆</option>
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
