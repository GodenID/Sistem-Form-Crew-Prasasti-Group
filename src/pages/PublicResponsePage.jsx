import { useMemo, useState } from 'react'
import { getSubmissionPosition } from '../data/submissionStore.js'

function BrandMark() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <path d="M8 36V13.5A5.5 5.5 0 0 1 13.5 8H25c6.08 0 11 4.92 11 11s-4.92 11-11 11h-7" />
      <path d="M18 16h7a3 3 0 0 1 0 6h-7v14" />
      <path d="M8 36h10" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 4.5 6v5.3c0 4.6 3.1 8.3 7.5 9.7 4.4-1.4 7.5-5.1 7.5-9.7V6L12 3Z" />
      <path d="m8.7 12 2.1 2.1 4.7-4.8" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function formatEventDate(value) {
  if (!value) return 'Tanggal belum diatur'
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function maskKtp(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return '—'
  if (digits.length <= 6) return `${digits.slice(0, 2)}•••`
  return `${digits.slice(0, 4)}••••••••••${digits.slice(-2)}`
}

function PublicResponsePage({ event, submissions = [], navigate }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const normalizedQuery = query.trim().toLowerCase()

  const ordered = useMemo(() => [...submissions].sort((a, b) =>
    new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime(),
  ), [submissions])

  const filtered = useMemo(() => {
    if (!normalizedQuery) return ordered
    return ordered.filter((submission) =>
      [
        submission.fullName,
        getSubmissionPosition(submission),
        submission.whatsapp,
        submission.bank,
        submission.accountNumber,
        submission.accountName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [ordered, normalizedQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const paginated = filtered.slice(pageStart, pageStart + pageSize)

  const goForm = () => navigate(`/${event.slug}`)
  const goHome = () => navigate('/')

  return (
    <div className="page-shell">
      <div className="top-rule" />
      <aside className="intro-panel">
        <div className="engraving-pattern" aria-hidden="true"><span /><span /><span /></div>
        <a className="brand" href="/">
          <span className="brand-mark"><BrandMark /></span>
          <span>Prasasti Crew<small>CREW ADMINISTRATION</small></span>
        </a>
        <div className="intro-copy">
          <p className="eyebrow">DAFTAR RESPON CREW</p>
          <h1>{event.name}</h1>
          <div className="public-event-meta">
            <span><ClockIcon /> {formatEventDate(event.eventDate)}</span>
            <span><LocationIcon /> {event.location || 'Lokasi belum diatur'}</span>
          </div>
          <p className="intro-text">Semua data crew yang sudah masuk di event ini ditampilkan di halaman ini, urut dari input pertama. {submissions.length ? `${submissions.length} data tercatat.` : 'Belum ada data yang masuk.'}</p>
        </div>
        <div className="privacy-note"><ShieldIcon /><p><strong>Data terbuka lewat tautan.</strong> Halaman ini menampilkan data crew termasuk rekening. Bagikan tautannya hanya ke grup crew internal.</p></div>
      </aside>

      <main className="form-column">
        <div className="form-heading">
          <p className="mobile-eyebrow">DAFTAR RESPON</p>
          <div className="event-context">
            <span>EVENT</span>
            <div><strong>{event.name}</strong><small>{formatEventDate(event.eventDate)} · {event.location || 'Lokasi belum diatur'}</small></div>
          </div>
          <div className="heading-row">
            <div><h2>{submissions.length} data sudah masuk</h2><p>Nomor urut mengikuti urutan input. Gunakan pencarian untuk menemukan nama tertentu.</p></div>
          </div>
          {submissions.length > 0 && (
            <div className="respon-search">
              <label className="ledger-search"><span className="sr-only">Cari data crew</span><SearchIcon /><input type="search" value={query} onChange={(changeEvent) => { setQuery(changeEvent.target.value); setPage(1) }} placeholder="Cari nama, posisi, bank..." aria-label="Cari data crew" autoComplete="off" /></label>
            </div>
          )}
        </div>

        {Boolean(paginated.length) && (
          <div className="respon-table-wrap">
            <table className="crew-table">
              <thead><tr>
                <th>No.</th><th>Nama Crew</th><th>Posisi</th><th>WhatsApp</th><th>NIK / KTP</th><th>Bank / Layanan</th><th>Rekening</th><th>Waktu Input</th>
              </tr></thead>
              <tbody>{paginated.map((submission, index) => (
                <tr key={submission.id}>
                  <td data-label="No.">{String(pageStart + index + 1).padStart(2, '0')}</td>
                  <td data-label="Nama Crew"><strong>{submission.fullName}</strong></td>
                  <td data-label="Posisi">{getSubmissionPosition(submission) || '—'}</td>
                  <td data-label="WhatsApp">+62 {submission.whatsapp}</td>
                  <td data-label="NIK / KTP">{maskKtp(submission.ktp)}</td>
                  <td data-label="Bank / Layanan">{submission.bank}</td>
                  <td data-label="Rekening"><strong>{submission.accountNumber}</strong><small>a.n. {submission.accountName}</small></td>
                  <td data-label="Waktu Input">{formatDateTime(submission.submittedAt)}</td>
                </tr>
              ))}              </tbody>
            </table>
          </div>
        )}

        {filtered.length > pageSize && (
          <nav className="ledger-pagination respon-pagination" aria-label="Navigasi halaman daftar respon">
            <label>Baris per halaman <select value={pageSize} onChange={(changeEvent) => { setPageSize(Number(changeEvent.target.value)); setPage(1) }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
            <span>{pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} dari {filtered.length}</span>
            <div><button type="button" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button><button type="button" disabled={safePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Berikutnya</button></div>
          </nav>
        )}

        {submissions.length > 0 && !filtered.length && (
          <div className="landing-empty">
            <strong>Tidak ada yang cocok.</strong>
            <p>Coba kata kunci lain atau kosongkan pencarian untuk melihat semua data.</p>
          </div>
        )}

        {!submissions.length && (
          <div className="landing-empty">
            <strong>Belum ada data yang masuk.</strong>
            <p>Jadilah yang pertama mengisi formulir event ini.</p>
            <div className="respon-actions">
              <button className="submit-button" type="button" onClick={goForm}>Isi formulir event</button>
            </div>
          </div>
        )}

        <p className="modal-footnote"><ShieldIcon /> Jika ada data yang keliru, hubungi admin event untuk koreksi. Nominal diisi oleh tim finance setelah verifikasi.</p>

        <div className="respon-actions respon-footer">
          <button className="secondary-button" type="button" onClick={goForm}>Kembali ke formulir</button>
          <button className="secondary-button" type="button" onClick={goHome}>Lihat event lain</button>
        </div>
        <footer><span>© 2026 Prasasti Crew</span><span>Butuh bantuan? <a href="https://wa.me/628998926985" target="_blank" rel="noreferrer">Hubungi Goden</a></span></footer>
      </main>
    </div>
  )
}

export default PublicResponsePage
