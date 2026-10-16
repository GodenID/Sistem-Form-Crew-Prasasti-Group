// Klien HTTP untuk Worker API (/api/*) yang didukung D1.
// Dipakai saat aplikasi disajikan oleh Worker; otomatis fallback ke
// localStorage bila API tidak terjangkau (mis. `npm run dev` tanpa Worker).

const ADMIN_TOKEN_KEY = 'prasasti-admin-token'
const LEGACY_SESSION_KEY = 'prasasti-admin-unlocked'

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function readStoredToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

// Sesi lama hanya menyimpan flag '1' tanpa password: paksa login ulang sekali.
function dropLegacySession() {
  try {
    if (sessionStorage.getItem(LEGACY_SESSION_KEY) === '1') {
      sessionStorage.removeItem(LEGACY_SESSION_KEY)
    }
  } catch {
    // Abaikan bila storage tidak tersedia.
  }
}

export function getAdminToken() {
  dropLegacySession()
  return readStoredToken()
}

export function hasAdminSession() {
  return Boolean(getAdminToken())
}

export function setAdminToken(token) {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token || '')
  } catch {
    // State React tetap berjalan walau storage dibatasi browser.
  }
}

export function clearAdminSession() {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY)
    sessionStorage.removeItem(LEGACY_SESSION_KEY)
  } catch {
    // Abaikan bila storage tidak tersedia.
  }
}

export async function api(path, { method = 'GET', body, auth = false, bearer = '', timeoutMs = 15000 } = {}) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'content-type': 'application/json' }
    const token = bearer || (auth ? getAdminToken() : '')
    if (token) headers.authorization = `Bearer ${token}`
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }
    if (!response.ok) {
      throw new ApiError((data && data.message) || `Permintaan gagal (HTTP ${response.status}).`, response.status)
    }
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error && error.name === 'AbortError') {
      throw new ApiError('Server tidak merespons. Periksa koneksi lalu coba lagi.', 0)
    }
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.', 0)
  } finally {
    window.clearTimeout(timer)
  }
}

export async function probeApi() {
  await api('/api/health', { timeoutMs: 6000 })
  return true
}

export const backend = {
  events: {
    list: () => api('/api/events'),
    create: (event) => api('/api/events', { method: 'POST', body: event, auth: true }),
    update: (event) => api(`/api/events/${encodeURIComponent(event.id)}`, { method: 'PUT', body: event, auth: true }),
    remove: (id) => api(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
  },
  submissions: {
    listAll: () => api('/api/submissions', { auth: true }),
    listByEvent: (eventId) => api(`/api/events/${encodeURIComponent(eventId)}/submissions`),
    create: (eventId, form, submissionId) => api(`/api/events/${encodeURIComponent(eventId)}/submissions`, {
      method: 'POST',
      body: { ...form, submissionId: submissionId || null },
    }),
    update: (submission) => api(`/api/submissions/${encodeURIComponent(submission.id)}`, { method: 'PUT', body: submission, auth: true }),
    remove: (id) => api(`/api/submissions/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
  },
  crew: {
    search: (query, limit = 10) => api(`/api/crew?q=${encodeURIComponent(query || '')}&limit=${encodeURIComponent(String(limit || 10))}`),
  },
  admin: {
    verify: (password) => api('/api/admin/ping', { bearer: password || '' }),
  },
}
