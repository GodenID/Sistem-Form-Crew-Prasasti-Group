import { useEffect, useRef, useState } from 'react'
import AdminPage from './pages/AdminPage.jsx'
import EventDetailPage from './pages/EventDetailPage.jsx'
import PublicFormPage from './pages/PublicFormPage.jsx'
import PublicResponsePage from './pages/PublicResponsePage.jsx'
import { useToast } from './components/ToastProvider.jsx'
import { getEvents, saveEvents } from './data/eventStore.js'
import { findDuplicateSubmission, getSubmissions, saveSubmissions, upsertSubmission } from './data/submissionStore.js'
import { ApiError, backend, clearAdminSession, hasAdminSession, probeApi, setAdminToken } from './data/apiClient.js'

const LOCAL_ADMIN_PASSWORD = 'lebahganteng'
const SUBMISSIONS_SYNC_DELAY = 800

function getCurrentPath() {
  try {
    return decodeURIComponent(window.location.pathname.replace(/\/+$/, '') || '/')
  } catch {
    return '/'
  }
}

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function formatEventDate(value) {
  if (!value) return 'Tanggal belum diatur'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function diffById(prev, next) {
  const prevMap = new Map(prev.map((item) => [item.id, item]))
  const nextMap = new Map(next.map((item) => [item.id, item]))
  return {
    added: next.filter((item) => !prevMap.has(item.id)),
    removed: prev.filter((item) => !nextMap.has(item.id)),
    updated: next.filter((item) => {
      const before = prevMap.get(item.id)
      return before && JSON.stringify(before) !== JSON.stringify(item)
    }),
  }
}

function AdminGate({ onVerify, onUnlock }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const ok = await onVerify(password)
      if (!ok) {
        setError('Password admin tidak sesuai.')
        toast.error('Akses ditolak', 'Password admin tidak sesuai. Periksa kembali lalu coba lagi.')
        return
      }
      toast.success('Akses admin dibuka', 'Sesi admin aktif untuk tab browser ini.')
      onUnlock()
    } catch {
      setError('Tidak dapat memverifikasi password. Periksa koneksi lalu coba lagi.')
      toast.error('Verifikasi gagal', 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-gate-shell">
      <section className="admin-gate-card" aria-labelledby="admin-gate-title">
        <div className="route-mark">PC</div>
        <p className="eyebrow">AREA TERBATAS</p>
        <h1 id="admin-gate-title">Masuk ke panel admin.</h1>
        <p>Masukkan password untuk mengelola event dan data pembayaran pada tab ini.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="adminPassword">Password admin</label>
          <input
            id="adminPassword"
            type="password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError('') }}
            autoComplete="current-password"
            autoFocus
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'admin-password-error' : undefined}
          />
          {error && <small id="admin-password-error" role="alert">{error}</small>}
          <button className="submit-button" type="submit" disabled={busy}>{busy ? 'Memeriksa...' : 'Buka panel admin'}</button>
        </form>
        <button className="admin-gate-back" type="button" onClick={() => navigate('/')}>Kembali ke daftar event</button>
        <p className="admin-gate-note">Password diverifikasi ke server dan sesi hanya berlaku pada tab ini. Jaga kerahasiaan password admin.</p>
      </section>
    </main>
  )
}

function BootSplash() {
  return (
    <main className="route-message">
      <div className="route-mark">PC</div>
      <p className="eyebrow">MEMUAT</p>
      <h1>Menyiapkan data event...</h1>
    </main>
  )
}

function EventLanding({ events }) {
  return (
    <main className="event-landing">
      <header className="landing-header">
        <div className="route-mark">PC</div>
        <button type="button" onClick={() => navigate('/admin')}>Admin panel</button>
      </header>
      <section className="landing-intro">
        <p className="eyebrow">PRASASTI CREW</p>
        <h1>Pilih formulir event yang sedang dibuka.</h1>
        <p>Hanya event yang masih menerima respons yang ditampilkan di halaman ini.</p>
      </section>
      {events.length ? (
        <div className="landing-event-list">
          {events.map((event) => (
            <article className="landing-event-card" key={event.id}>
              <div>
                <span className="status-badge is-open">Form dibuka</span>
                <h2>{event.name}</h2>
                <p>{formatEventDate(event.eventDate)} · {event.location || 'Lokasi belum diatur'}</p>
              </div>
              <button className="submit-button" type="button" onClick={() => navigate(`/${event.slug}`)}>Isi formulir</button>
            </article>
          ))}
        </div>
      ) : (
        <div className="landing-empty">
          <strong>Belum ada formulir yang dibuka.</strong>
          <p>Hubungi admin event atau periksa kembali halaman ini nanti.</p>
        </div>
      )}
    </main>
  )
}

function ClosedEvent({ event }) {
  return (
    <main className="route-message">
      <div className="route-mark">PC</div>
      <p className="eyebrow">FORMULIR DITUTUP</p>
      <h1>{event.name} sudah tidak menerima input.</h1>
      <p>Admin event telah menutup formulir ini. Data baru tidak dapat dikirim sampai formulir dibuka kembali.</p>
      <div className="route-event-meta">{formatEventDate(event.eventDate)} · {event.location || 'Lokasi belum diatur'}</div>
      <div className="route-actions"><button className="secondary-button" type="button" onClick={() => navigate('/')}>Lihat event lain</button></div>
    </main>
  )
}

function EventNotFound({ slug }) {
  const toast = useToast()
  const requestedPath = window.location.pathname
  const traceId = `ERR-${String(slug || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'UNKNOWN'}`

  async function copyErrorDetails() {
    const details = `Prasasti Crew 404\nPath: ${requestedPath}\nTrace: ${traceId}\nHost: ${window.location.host}`
    try {
      await navigator.clipboard.writeText(details)
      toast.success('Detail error disalin', 'Path dan trace ID siap dikirim ke Goden.')
    } catch {
      window.prompt('Salin detail error berikut:', details)
      toast.info('Salin detail secara manual', 'Detail error ditampilkan pada dialog browser.')
    }
  }

  return (
    <main className="not-found-shell">
      <div className="not-found-grid" aria-hidden="true" />
      <header className="not-found-topbar">
        <button type="button" onClick={() => navigate('/')} aria-label="Kembali ke halaman utama Prasasti Crew">
          <span>PC</span>
          <strong>PRASASTI CREW</strong>
        </button>
        <div><span className="not-found-live-dot" /> SYSTEM TRACE</div>
        <code>{traceId}</code>
      </header>

      <section className="not-found-layout" aria-labelledby="not-found-title">
        <div className="not-found-hero">
          <div className="not-found-number" aria-label="Error 404">
            <span>4</span><span className="not-found-zero">0<i aria-hidden="true" /></span><span>4</span>
          </div>
          <p className="not-found-kicker"><span /> LEDGER LOOKUP FAILED</p>
          <h1 id="not-found-title">Record ini tidak pernah tercatat.</h1>
          <p className="not-found-lead">Sistem sudah menelusuri registri event, tetapi tidak menemukan tujuan yang cocok untuk path ini.</p>
          <div className="not-found-path"><span>REQUESTED PATH</span><code>{requestedPath}</code></div>
          <div className="not-found-actions">
            <button className="not-found-primary" type="button" onClick={() => navigate('/')}>
              <span>Kembali ke event aktif</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
            <button className="not-found-secondary" type="button" onClick={() => navigate('/admin')}>Buka admin panel</button>
          </div>
        </div>

        <aside className="route-trace" aria-label="Hasil penelusuran route">
          <div className="route-trace-head">
            <div><span>ROUTE TRACE</span><strong>Lookup sequence</strong></div>
            <span className="trace-status">NO MATCH</span>
          </div>
          <ol className="trace-steps">
            <li className="is-complete"><span>01</span><div><strong>Request diterima</strong><code>{requestedPath}</code></div><i>OK</i></li>
            <li className="is-complete"><span>02</span><div><strong>Registri event diperiksa</strong><small>Local event index</small></div><i>OK</i></li>
            <li className="is-failed"><span>03</span><div><strong>Slug tidak ditemukan</strong><code>{slug || 'unknown'}</code></div><i>404</i></li>
            <li><span>04</span><div><strong>Recovery tersedia</strong><small>Kembali atau buka admin</small></div><i>READY</i></li>
          </ol>
          <dl className="trace-meta">
            <div><dt>Host</dt><dd>{window.location.host}</dd></div>
            <div><dt>Protocol</dt><dd>{window.location.protocol.replace(':', '').toUpperCase()}</dd></div>
            <div><dt>Result</dt><dd>EVENT_NOT_FOUND</dd></div>
          </dl>
          <button className="trace-copy" type="button" onClick={copyErrorDetails}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
            Salin detail error
          </button>
        </aside>
      </section>

      <footer className="not-found-footer">
        <span>HTTP 404 · RESOURCE ABSENT</span>
        <span>Registry recovery interface / v2</span>
      </footer>
    </main>
  )
}

function App() {
  const toast = useToast()
  const [path, setPath] = useState(getCurrentPath)
  const [backendMode, setBackendMode] = useState(null)
  const [booted, setBooted] = useState(false)
  const [bootFailed, setBootFailed] = useState(false)
  const [events, setEvents] = useState(getEvents)
  const [submissions, setSubmissions] = useState(getSubmissions)
  const [submissionsScope, setSubmissionsScope] = useState('none')
  const [adminUnlocked, setAdminUnlocked] = useState(hasAdminSession)

  const backendRef = useRef(null)
  const eventsRef = useRef(events)
  const submissionsRef = useRef(submissions)
  const scopeRef = useRef(submissionsScope)
  const lastSyncedSubmissions = useRef(null)
  const submissionsSyncTimer = useRef(null)
  backendRef.current = backendMode
  eventsRef.current = events
  submissionsRef.current = submissions
  scopeRef.current = submissionsScope

  function handleApiError(error, action) {
    if (error instanceof ApiError && error.status === 401) {
      clearAdminSession()
      setAdminUnlocked(false)
      setSubmissions([])
      setSubmissionsScope('none')
      lastSyncedSubmissions.current = null
      toast.error('Sesi admin berakhir', 'Masuk ulang sebagai admin untuk melanjutkan.')
      navigate('/admin')
      return false
    }
    toast.error(`Gagal ${action}`, error instanceof ApiError ? error.message : 'Periksa koneksi lalu coba lagi.')
    return true
  }

  async function refreshEvents() {
    try {
      const remote = await backend.events.list()
      setEvents(remote)
      return remote
    } catch (error) {
      handleApiError(error, 'memuat event')
      return null
    }
  }

  async function loadAllSubmissions() {
    try {
      const remote = await backend.submissions.listAll()
      setSubmissions(remote)
      setSubmissionsScope('all')
      lastSyncedSubmissions.current = remote
    } catch (error) {
      handleApiError(error, 'memuat data crew')
    }
  }

  async function loadEventSubmissions(eventId) {
    const want = `event:${eventId}`
    try {
      const remote = await backend.submissions.listByEvent(eventId)
      if (scopeRef.current !== 'all') {
        setSubmissions(remote)
        setSubmissionsScope(want)
      }
    } catch (error) {
      handleApiError(error, 'memuat data crew')
    }
  }

  async function flushSubmissionsSync() {
    if (submissionsSyncTimer.current) {
      window.clearTimeout(submissionsSyncTimer.current)
      submissionsSyncTimer.current = null
    }
    if (backendRef.current !== 'api') return
    if (scopeRef.current !== 'all') return
    const prev = lastSyncedSubmissions.current || []
    const next = submissionsRef.current
    const { updated, removed } = diffById(prev, next)
    if (!updated.length && !removed.length) {
      lastSyncedSubmissions.current = next
      return
    }
    try {
      for (const item of updated) await backend.submissions.update(item)
      for (const item of removed) await backend.submissions.remove(item.id)
      lastSyncedSubmissions.current = submissionsRef.current
    } catch (error) {
      if (!handleApiError(error, 'menyimpan perubahan')) return
      await loadAllSubmissions()
    }
  }

  function scheduleSubmissionsSync() {
    if (submissionsSyncTimer.current) window.clearTimeout(submissionsSyncTimer.current)
    submissionsSyncTimer.current = window.setTimeout(() => { flushSubmissionsSync() }, SUBMISSIONS_SYNC_DELAY)
  }

  // Boot: deteksi backend, muat event, siapkan scope submissions.
  useEffect(() => {
    let cancelled = false
    async function boot() {
      let mode = 'local'
      try {
        await probeApi()
        mode = 'api'
      } catch {
        mode = 'local'
      }
      if (cancelled) return
      setBackendMode(mode)
      if (mode === 'local') {
        setEvents(getEvents())
        const localSubmissions = getSubmissions()
        setSubmissions(localSubmissions)
        setSubmissionsScope('all')
        lastSyncedSubmissions.current = localSubmissions
        setBooted(true)
      } else {
        const remote = await refreshEvents()
        if (cancelled) return
        if (!remote) setBootFailed(true)
        setBooted(true)
      }
    }
    boot()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Jaga scope submissions mengikuti route (mode API).
  useEffect(() => {
    if (backendMode !== 'api') return undefined
    const segments = path.slice(1).split('/')
    const isAdminPath = path === '/admin' || path.startsWith('/admin/')
    if (isAdminPath) {
      if (adminUnlocked && scopeRef.current !== 'all') loadAllSubmissions()
      return undefined
    }
    if (segments.length >= 2 && segments[1] === 'respon' && eventsRef.current.length) {
      const event = eventsRef.current.find((item) => item.slug === segments[0])
      if (event && scopeRef.current !== 'all' && scopeRef.current !== `event:${event.id}`) {
        loadEventSubmissions(event.id)
      }
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, backendMode, adminUnlocked, events])

  // Sinkronisasi listener antar-tab hanya untuk mode lokal.
  useEffect(() => {
    const handleNavigation = () => setPath(getCurrentPath())
    const handleStorage = () => {
      if (backendRef.current !== 'local') return
      setEvents(getEvents())
      setSubmissions(getSubmissions())
    }
    window.addEventListener('popstate', handleNavigation)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('popstate', handleNavigation)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // Flush perubahan submissions yang tertunda saat pindah route / unmount.
  useEffect(() => () => { flushSubmissionsSync() }, [path])
  useEffect(() => () => {
    if (submissionsSyncTimer.current) window.clearTimeout(submissionsSyncTimer.current)
  }, [])

  function updateSubmissions(nextSubmissions) {
    if (backendRef.current === 'local') {
      saveSubmissions(nextSubmissions)
      setSubmissions(nextSubmissions)
      return
    }
    setSubmissions(nextSubmissions)
    scheduleSubmissionsSync()
  }

  async function updateEvents(nextEvents) {
    if (backendRef.current === 'local') {
      const activeEventIds = new Set(nextEvents.map((event) => event.id))
      const nextSubmissions = submissions.filter((submission) => activeEventIds.has(submission.eventId))
      if (nextSubmissions.length !== submissions.length) updateSubmissions(nextSubmissions)
      saveEvents(nextEvents)
      setEvents(nextEvents)
      return
    }
    const prev = eventsRef.current
    const activeEventIds = new Set(nextEvents.map((event) => event.id))
    const nextSubmissions = submissionsRef.current.filter((submission) => activeEventIds.has(submission.eventId))
    setEvents(nextEvents)
    if (nextSubmissions.length !== submissionsRef.current.length) {
      setSubmissions(nextSubmissions)
      lastSyncedSubmissions.current = nextSubmissions
    }
    const { added, removed, updated } = diffById(prev, nextEvents)
    try {
      for (const event of added) await backend.events.create(event)
      for (const event of updated) await backend.events.update(event)
      for (const event of removed) await backend.events.remove(event.id)
      await refreshEvents()
    } catch (error) {
      if (!handleApiError(error, 'menyimpan event')) return
      await refreshEvents()
      if (scopeRef.current === 'all') await loadAllSubmissions()
    }
  }

  async function saveCrewResponse(event, form, submissionId) {
    if (backendRef.current === 'local') {
      try {
        const latestEvent = getEvents().find((item) => item.id === event.id)
        if (!latestEvent || latestEvent.formStatus === 'closed') {
          return { ok: false, message: 'Formulir event sudah ditutup oleh admin. Data tidak dikirim.' }
        }
        const latestSubmissions = getSubmissions()
        const duplicate = findDuplicateSubmission(latestSubmissions, event.id, form, submissionId)
        if (duplicate) {
          return {
            ok: false,
            message: 'Nama lengkap dan nomor rekening tersebut sudah tercatat pada event ini. Satu crew hanya dapat mengirim satu data untuk kombinasi tersebut.',
          }
        }
        const result = upsertSubmission(latestSubmissions, latestEvent, form, submissionId)
        updateSubmissions(result.submissions)
        return { ok: true, id: result.submission.id }
      } catch {
        return { ok: false, message: 'Data gagal disimpan di browser ini. Periksa izin penyimpanan lalu coba kembali.' }
      }
    }
    try {
      const created = await backend.submissions.create(event.id, form, submissionId)
      const scope = scopeRef.current
      if (scope === 'all' || scope === `event:${event.id}`) {
        setSubmissions((current) => {
          const next = current.some((item) => item.id === created.id)
            ? current.map((item) => (item.id === created.id ? created : item))
            : [created, ...current]
          if (scope === 'all') lastSyncedSubmissions.current = next
          return next
        })
      }
      return { ok: true, id: created.id }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) handleApiError(error, 'mengirim data')
      return { ok: false, message: error instanceof ApiError ? error.message : 'Terjadi gangguan saat menyimpan data. Coba kembali beberapa saat lagi.' }
    }
  }

  async function verifyAdminPassword(password) {
    if (backendRef.current === 'api') {
      try {
        await backend.admin.verify(password)
        setAdminToken(password)
        return true
      } catch {
        return false
      }
    }
    if (password !== LOCAL_ADMIN_PASSWORD) return false
    setAdminToken(password)
    return true
  }

  async function logoutAdmin() {
    await flushSubmissionsSync()
    clearAdminSession()
    setAdminUnlocked(false)
    setSubmissions([])
    setSubmissionsScope('none')
    lastSyncedSubmissions.current = null
    toast.info('Sesi admin ditutup', 'Panel kembali dikunci pada tab ini.')
    navigate('/')
  }

  if (!booted) return <BootSplash />

  if (bootFailed) {
    return (
      <main className="route-message">
        <div className="route-mark">PC</div>
        <p className="eyebrow">GANGGUAN</p>
        <h1>Tidak dapat memuat data.</h1>
        <p>Server tidak merespons. Periksa koneksi lalu muat ulang halaman ini.</p>
        <div className="route-actions"><button className="submit-button" type="button" onClick={() => window.location.reload()}>Muat ulang</button></div>
      </main>
    )
  }

  const isAdminPath = path === '/admin' || path.startsWith('/admin/')
  if (isAdminPath && !adminUnlocked) {
    return <AdminGate onVerify={verifyAdminPassword} onUnlock={() => setAdminUnlocked(true)} />
  }
  if (isAdminPath && backendMode === 'api' && submissionsScope !== 'all') return <BootSplash />

  if (path.startsWith('/admin/event/')) {
    const eventSlug = path.slice('/admin/event/'.length).split('/')[0]
    const detailEvent = events.find((event) => event.slug === eventSlug)
    if (!detailEvent) return <EventNotFound slug={eventSlug} />
    return (
      <EventDetailPage
        event={detailEvent}
        submissions={submissions.filter((submission) => submission.eventId === detailEvent.id)}
        onSubmissionsChange={(eventSubmissions) => {
          const otherSubmissions = submissions.filter((submission) => submission.eventId !== detailEvent.id)
          updateSubmissions([...eventSubmissions, ...otherSubmissions])
        }}
        navigate={navigate}
        onLogout={logoutAdmin}
      />
    )
  }

  if (path === '/admin') {
    return <AdminPage events={events} submissions={submissions} onEventsChange={updateEvents} navigate={navigate} onLogout={logoutAdmin} />
  }

  if (path === '/') {
    return <EventLanding events={events.filter((event) => event.formStatus !== 'closed')} />
  }

  const segments = path.slice(1).split('/')
  const slug = segments[0]
  const event = events.find((item) => item.slug === slug)

  if (!event) return <EventNotFound slug={slug} />
  if (segments[1] === 'respon') {
    if (backendMode === 'api' && submissionsScope !== 'all' && submissionsScope !== `event:${event.id}`) {
      return <BootSplash />
    }
    return (
      <PublicResponsePage
        key={`${event.slug}/respon`}
        event={event}
        submissions={submissions.filter((submission) => submission.eventId === event.id)}
        navigate={navigate}
      />
    )
  }
  if (event.formStatus === 'closed') return <ClosedEvent event={event} />
  return <PublicFormPage key={event.slug} event={event} onSubmitData={(form, submissionId) => saveCrewResponse(event, form, submissionId)} navigate={navigate} />
}

export default App
