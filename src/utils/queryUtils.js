// src/utils/queryUtils.js

/**
 * Normalizes query string for backend API.
 * The LoTUS-BF backend has a parser rule where bare words are auto-grouped into phrases.
 * For boolean 'OR' operations on bare words (e.g. `according OR presented`), the backend requires
 * quotes (e.g. `"according" OR "presented"`) to evaluate as a union rather than an implicit phrase/AND.
 */
export function normalizeQueryForApi(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') return ''
  const trimmed = rawQuery.trim()
  if (!trimmed) return ''
  if (!/\bOR\b/i.test(trimmed)) return trimmed

  const tokens = trimmed.split(/(\s+(?:AND|OR|NOT)\s+|\(|\)|\[[^\]]*\]|\"[^\"]*\")/i)
  const normalized = tokens.map((t) => {
    const s = t.trim()
    if (!s) return t
    const upper = s.toUpperCase()
    if (
      upper === 'AND' ||
      upper === 'OR' ||
      upper === 'NOT' ||
      s === '(' ||
      s === ')' ||
      s.startsWith('[') ||
      s.startsWith('"')
    ) {
      return t
    }
    return t.replace(s, `"${s}"`)
  })

  return normalized.join('')
}

