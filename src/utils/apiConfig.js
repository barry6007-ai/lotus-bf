// src/utils/apiConfig.js
// Centralized API configuration for LoTUS-BF

const STORAGE_KEY = 'lotus_api_base'
export const DEFAULT_REMOTE_API = 'http://hpc.psy.ntu.edu.tw:5000'

export function getApiBaseUrl () {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null && saved !== undefined && saved.trim() !== '') {
      return saved.trim().replace(/\/+$/, '')
    }
  } catch {}

  // In development mode, empty string routes through Vite proxy
  if (import.meta.env.DEV) {
    return ''
  }

  // If running on Render or full-stack host where frontend and backend share domain
  if (typeof window !== 'undefined' && (window.location.hostname.includes('render.com') || window.location.port === '10000' || window.location.port === '5000')) {
    return ''
  }

  // On GitHub Pages or standalone static hosting, default to course backend
  return DEFAULT_REMOTE_API
}

export function setApiBaseUrl (url) {
  try {
    if (!url || url.trim() === '') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ''))
    }
    window.dispatchEvent(new CustomEvent('lotus:api-changed', { detail: getApiBaseUrl() }))
  } catch {}
}

export function apiUrl (path) {
  const base = getApiBaseUrl()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  if (!base) return cleanPath
  return `${base}${cleanPath}`
}
