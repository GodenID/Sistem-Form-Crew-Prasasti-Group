import { useMemo, useState } from 'react'
import { createEventId, getUniqueSlug, slugifyEventName } from '../data/eventStore.js'
import { useToast } from '../components/ToastProvider.jsx'

function Icon({ name }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    edit: <><path d="m14 5 5 5M4 20l3.5-.7L19 7.8a2 2 0 0 0-2.8-2.8L4.7 16.5 4 20Z" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    event: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function newEditorState() {
  return {
    name: '',
    eventDate: '',
    location: '',
    slug: '',
    formStatus: 'open',
  }
}

function formatEventDate(value) {
  if (!value) return 'Tanggal belum diatur'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function AdminPage({ events, submissions = [], onEventsChange, navigate, onLogout }) {
  const toast = useToast()
  const [editor, setEditor] = useState(newEditorState)
  const [editingId, setEditingId] = useState(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [errors, setErrors] = useState({})
  const openEventCount = useMemo(() => events.filter((event) => event.formStatus !== 'closed').length, [events])

  function resetEditor() {
    setEditor(newEditorState())
    setEditingId(null)
    setSlugEdited(false)
    setErrors({})
  }

  function updateName(value) {
    setEditor((current) => ({
      ...current,
      name: value,
      slug: slugEdited ? current.slug : slugifyEventName(value),
    }))
  }

  function validateEditor() {
    const nextErrors = {}
    if (editor.name.trim().length < 2) nextErrors.name = 'Nama event minimal 2 karakter.'
    if (!editor.eventDate) nextErrors.eventDate = 'Tanggal event wajib diisi.'
    if (editor.location.trim().length < 2) nextErrors.location = 'Lokasi event wajib diisi.'
    if (!slugifyEventName(editor.slug)) nextErrors.slug = 'Slug tautan wajib diisi.'
    setErrors(nextErrors)
    return { valid: !Object.keys(nextErrors).length }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const { valid } = validateEditor()
    if (!valid) {
      toast.error('Event belum dapat disimpan', 'Periksa kembali kolom wajib event.')
      return
    }

    const wasEditing = Boolean(editingId)
    const slug = getUniqueSlug(editor.slug || editor.name, events, editingId)
    const nextEvent = {
      id: editingId || createEventId(),
      name: editor.name.trim(),
      eventDate: editor.eventDate,
      location: editor.location.trim(),
      slug,
      formStatus: editor.formStatus === 'closed' ? 'closed' : 'open',
      positions: [],
      createdAt: editingId
        ? events.find((item) => item.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const nextEvents = editingId
      ? events.map((item) => item.id === editingId ? nextEvent : item)
      : [nextEvent, ...events]

    try {
      onEventsChange(nextEvents)
      toast.success(wasEditing ? 'Event berhasil diperbarui' : 'Event berhasil dibuat', wasEditing ? `Perubahan pada “${nextEvent.name}” sudah disimpan.` : `Tautan /${slug} siap digunakan.`)
      resetEditor()
    } catch {
      toast.error('Event gagal disimpan', 'Browser tidak dapat menyimpan perubahan. Periksa izin penyimpanan lalu coba lagi.')
    }
  }

  function editEvent(event) {
    setEditingId(event.id)
    setSlugEdited(true)
    setEditor({
      name: event.name,
      eventDate: event.eventDate || '',
      location: event.location || '',
      slug: event.slug,
      formStatus: event.formStatus === 'closed' ? 'closed' : 'open',
    })
    setErrors({})
    toast.info('Mode edit aktif', `Silakan perbarui detail event “${event.name}”.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleEventStatus(event) {
    const nextStatus = event.formStatus === 'closed' ? 'open' : 'closed'
    try {
      onEventsChange(events.map((item) => item.id === event.id
        ? { ...item, formStatus: nextStatus, updatedAt: new Date().toISOString() }
        : item))
      toast.success(nextStatus === 'open' ? 'Formulir dibuka' : 'Formulir ditutup', nextStatus === 'open' ? `“${event.name}” kembali menerima respons.` : `“${event.name}” tidak menerima input baru.`)
    } catch {
      toast.error('Status gagal diubah', 'Perubahan status formulir tidak dapat disimpan.')
    }
  }

  function deleteEvent(event) {
    const responseCount = submissions.filter((submission) => submission.eventId === event.id).length
    const confirmed = window.confirm(`Hapus event “${event.name}” beserta ${responseCount} data crew? Tindakan ini tidak dapat dibatalkan.`)
    if (!confirmed) return
    try {
      onEventsChange(events.filter((item) => item.id !== event.id))
      if (editingId === event.id) resetEditor()
      toast.success('Event berhasil dihapus', `“${event.name}” dan ${responseCount} data crew telah dihapus.`)
    } catch {
      toast.error('Event gagal dihapus', 'Data event masih dipertahankan karena perubahan tidak dapat disimpan.')
    }
  }

  async function copyLink(event) {
    const url = `${window.location.origin}/${event.slug}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Tautan berhasil disalin', url)
    } catch {
      const manualCopy = window.prompt('Clipboard tidak tersedia. Salin tautan event berikut:', url)
      if (manualCopy !== null) toast.info('Salin tautan secara manual', 'Tautan sudah ditampilkan pada dialog browser.')
      else toast.error('Tautan belum disalin', 'Clipboard browser tidak tersedia dan penyalinan manual dibatalkan.')
    }
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <button className="admin-brand" type="button" onClick={() => navigate('/')}>
          <span>PC</span>
          <span>Prasasti Crew<small>EVENT ADMINISTRATION</small></span>
        </button>
        <div className="admin-topbar-actions">
          <button className="admin-public-link" type="button" onClick={() => navigate('/')}>
            Lihat event aktif <Icon name="arrow" />
          </button>
          <button className="admin-logout" type="button" onClick={onLogout}>Keluar</button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-intro">
          <div>
            <p className="eyebrow">ADMIN PANEL</p>
            <h1>Siapkan data crew untuk proses finance.</h1>
            <p>Buat formulir khusus untuk event yang sudah selesai, lalu kumpulkan posisi kerja dan rekening crew dalam satu alur yang rapi.</p>
          </div>
          <div className="admin-stats" aria-label="Ringkasan event">
            <div><strong>{events.length}</strong><span>Event dibuat</span></div>
            <div><strong>{openEventCount}</strong><span>Form dibuka</span></div>
            <div><strong>{submissions.length}</strong><span>Data crew masuk</span></div>
          </div>
        </section>

        <div className="admin-security-note">
          <span>CLOUD SYNC</span>
          <p>Panel memakai password sesi pada tab ini. Data event dan rekening tersimpan terpusat di database D1 Cloudflare dan sinkron ke semua perangkat.</p>
        </div>

        <div className="admin-workspace">
          <section className="event-editor" aria-labelledby="event-editor-title">
            <div className="admin-section-heading">
              <span className="admin-section-index">01</span>
              <div>
                <h2 id="event-editor-title">{editingId ? 'Edit event' : 'Buat event baru'}</h2>
                <p>Nama event otomatis diubah menjadi alamat tautan.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className={`admin-field ${errors.name ? 'has-error' : ''}`}>
                <label htmlFor="eventName">Nama event <span>*</span></label>
                <input id="eventName" value={editor.name} onChange={(event) => updateName(event.target.value)} placeholder="Contoh: PT Goden" autoComplete="off" />
                {errors.name && <small>{errors.name}</small>}
              </div>

              <div className="admin-field-row">
                <div className={`admin-field ${errors.eventDate ? 'has-error' : ''}`}>
                  <label htmlFor="eventDate">Tanggal event <span>*</span></label>
                  <input id="eventDate" type="date" value={editor.eventDate} onChange={(event) => setEditor((current) => ({ ...current, eventDate: event.target.value }))} />
                  {errors.eventDate && <small>{errors.eventDate}</small>}
                </div>

                <div className={`admin-field ${errors.location ? 'has-error' : ''}`}>
                  <label htmlFor="eventLocation">Lokasi event <span>*</span></label>
                  <input id="eventLocation" value={editor.location} onChange={(event) => setEditor((current) => ({ ...current, location: event.target.value }))} placeholder="Contoh: JCC Senayan" autoComplete="off" />
                  {errors.location && <small>{errors.location}</small>}
                </div>
              </div>

              <div className={`admin-field ${errors.slug ? 'has-error' : ''}`}>
                <label htmlFor="eventSlug">Alamat formulir <span>*</span></label>
                <div className="slug-control">
                  <span>{window.location.host}/</span>
                  <input id="eventSlug" value={editor.slug} onChange={(event) => { setSlugEdited(true); setEditor((current) => ({ ...current, slug: slugifyEventName(event.target.value) })) }} placeholder="pt-goden" autoComplete="off" />
                </div>
                <small>{errors.slug || 'Huruf kecil, angka, dan tanda hubung. Slug duplikat otomatis diberi nomor.'}</small>
              </div>

              <fieldset className="form-status-control">
                <legend>Status formulir</legend>
                <div className="status-segmented">
                  <label className={editor.formStatus === 'open' ? 'is-selected' : ''}>
                    <input type="radio" name="formStatus" value="open" checked={editor.formStatus === 'open'} onChange={() => setEditor((current) => ({ ...current, formStatus: 'open' }))} />
                    <span><strong>Dibuka</strong><small>Crew dapat mengirim data</small></span>
                  </label>
                  <label className={editor.formStatus === 'closed' ? 'is-selected' : ''}>
                    <input type="radio" name="formStatus" value="closed" checked={editor.formStatus === 'closed'} onChange={() => setEditor((current) => ({ ...current, formStatus: 'closed' }))} />
                    <span><strong>Ditutup</strong><small>Input baru dinonaktifkan</small></span>
                  </label>
                </div>
              </fieldset>

              <div className="editor-actions">
                {editingId && <button className="secondary-button" type="button" onClick={resetEditor}>Batal edit</button>}
                <button className="submit-button" type="submit">{editingId ? 'Simpan perubahan' : 'Buat event'} <Icon name="arrow" /></button>
              </div>
            </form>
          </section>

          <section className="event-registry" aria-labelledby="event-list-title">
            <div className="admin-section-heading">
              <span className="admin-section-index">02</span>
              <div>
                <h2 id="event-list-title">Daftar event</h2>
                <p>Kelola tautan yang sudah dibuat.</p>
              </div>
            </div>

            {events.length ? (
              <div className="event-list">
                {events.map((event) => (
                  <article className="event-card" key={event.id}>
                    <div className="event-card-top">
                      <span className="event-icon"><Icon name="event" /></span>
                      <div>
                        <h3><button className="event-title-button" type="button" onClick={() => navigate(`/admin/event/${event.slug}`)}>{event.name}</button></h3>
                        <button type="button" onClick={() => navigate(`/${event.slug}`)}><Icon name="link" />/{event.slug}</button>
                        <button type="button" onClick={() => navigate(`/${event.slug}/respon`)}><Icon name="link" />/{event.slug}/respon</button>
                      </div>
                      <div className="event-card-status">
                        <span className={`status-badge ${event.formStatus === 'closed' ? 'is-closed' : 'is-open'}`}>{event.formStatus === 'closed' ? 'Ditutup' : 'Dibuka'}</span>
                        <span className="event-response-count">{submissions.filter((submission) => submission.eventId === event.id).length} crew</span>
                      </div>
                    </div>
                    <div className="event-card-meta">
                      <span>{formatEventDate(event.eventDate)}</span>
                      <span>{event.location || 'Lokasi belum diatur'}</span>
                    </div>
                    <div className="event-card-footer">
                      <small>{submissions.filter((submission) => submission.eventId === event.id).length} data crew</small>
                      <div>
                        <button className="status-toggle-action" type="button" onClick={() => toggleEventStatus(event)} aria-label={`${event.formStatus === 'closed' ? 'Buka' : 'Tutup'} formulir ${event.name}`}>{event.formStatus === 'closed' ? 'Buka form' : 'Tutup form'}</button>
                        <button type="button" onClick={() => copyLink(event)} aria-label={`Salin tautan ${event.name}`}><Icon name="copy" /></button>
                        <button type="button" onClick={() => editEvent(event)} aria-label={`Edit ${event.name}`}><Icon name="edit" /></button>
                        <button className="danger-action" type="button" onClick={() => deleteEvent(event)} aria-label={`Hapus ${event.name}`}><Icon name="trash" /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="event-empty">
                <span><Icon name="event" /></span>
                <h3>Belum ada event</h3>
                <p>Isi editor di samping. Event pertama kamu akan muncul di sini bersama tautannya.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

export default AdminPage
