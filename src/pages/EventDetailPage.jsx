import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../components/ToastProvider.jsx'
import { getSubmissionPosition, getSubmissionPositions } from '../data/submissionStore.js'

function Icon({ name }) {
  const paths = {
    back: <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
    external: <><path d="M14 5h5v5M19 5l-8 8" /><path d="M17 13v6H5V7h6" /></>,
    download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M17 11a4 4 0 0 1 4 4v2" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
}

function formatEventDate(value) {
  if (!value) return 'Tanggal belum diatur'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function formatRupiah(value) {
  if (!value) return ''
  return new Intl.NumberFormat('id-ID').format(Number(value))
}

function parseRupiah(value) {
  return Number(value.replace(/\D/g, '')) || 0
}

function getPaymentStatus(submission) {
  return submission.paymentStatus === 'paid' ? 'paid' : 'pending'
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(', ') : String(value ?? '')
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

function SelectionControl({ checked, indeterminate = false, onChange, label, inputRef }) {
  return (
    <label className="selection-control check-control">
      <input ref={inputRef} type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
      <span className={`checkbox-mark ${indeterminate ? 'is-indeterminate' : ''}`} aria-hidden="true">{indeterminate ? '−' : checked && <CheckIcon />}</span>
    </label>
  )
}

function EventDetailPage({ event, submissions, onSubmissionsChange, navigate, onLogout }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [sortValue, setSortValue] = useState('updatedAt:desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedIds, setSelectedIds] = useState([])
  const selectAllRef = useRef(null)
  const normalizedQuery = query.trim().toLowerCase()
  const [sortKey, sortDirection] = sortValue.split(':')

  const filteredSubmissions = useMemo(() => submissions.filter((submission) => {
    const positionText = getSubmissionPosition(submission)
    const searchable = [
      submission.fullName, submission.whatsapp, submission.ktp || '',
      submission.bank, submission.accountNumber, submission.accountName,
      getPaymentStatus(submission) === 'paid' ? 'dibayar' : 'belum dibayar',
      positionText,
    ].join(' ').toLowerCase()
    return !normalizedQuery || searchable.includes(normalizedQuery)
  }), [submissions, normalizedQuery])

  const sortedSubmissions = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...filteredSubmissions].sort((a, b) => {
      let comparison = 0
      if (sortKey === 'amount') comparison = (Number(a.amount) || 0) - (Number(b.amount) || 0)
      else if (sortKey === 'fullName') comparison = String(a.fullName || '').localeCompare(String(b.fullName || ''), 'id-ID')
      else if (sortKey === 'paymentStatus') comparison = getPaymentStatus(a).localeCompare(getPaymentStatus(b), 'id-ID')
      else comparison = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime()
      if (comparison === 0) return String(a.id).localeCompare(String(b.id))
      return comparison * direction
    })
  }, [filteredSubmissions, sortKey, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedSubmissions.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const paginatedSubmissions = sortedSubmissions.slice(pageStart, pageStart + pageSize)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedSubmissions = submissions.filter((submission) => selectedSet.has(submission.id))
  const allPageSelected = paginatedSubmissions.length > 0 && paginatedSubmissions.every((submission) => selectedSet.has(submission.id))
  const somePageSelected = paginatedSubmissions.some((submission) => selectedSet.has(submission.id))

  useEffect(() => {
    setPage(1)
    setSelectedIds([])
  }, [normalizedQuery])

  useEffect(() => {
    setPage(1)
  }, [pageSize, sortValue])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    const validIds = new Set(submissions.map((submission) => submission.id))
    setSelectedIds((current) => current.filter((id) => validIds.has(id)))
  }, [submissions])

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = somePageSelected && !allPageSelected
  }, [somePageSelected, allPageSelected])

  const totalAmount = submissions.reduce((total, submission) => total + (Number(submission.amount) || 0), 0)
  const paidCount = submissions.filter((submission) => getPaymentStatus(submission) === 'paid').length
  const lastSubmission = submissions.reduce((latest, submission) => {
    if (!latest || new Date(submission.updatedAt) > new Date(latest.updatedAt)) return submission
    return latest
  }, null)

  function updateAmount(submissionId, value) {
    const amount = parseRupiah(value)
    try {
      onSubmissionsChange(submissions.map((submission) => submission.id === submissionId
        ? { ...submission, amount, financeUpdatedAt: new Date().toISOString() }
        : submission))
    } catch {
      toast.error('Nominal gagal disimpan', 'Browser tidak dapat menyimpan perubahan pembayaran.')
    }
  }

  function notifyAmountSaved(submission) {
    toast.success('Nominal pembayaran disimpan', `${submission.fullName} · Rp${formatRupiah(submission.amount) || '0'}`)
  }

  function toggleSelection(submissionId) {
    setSelectedIds((current) => current.includes(submissionId)
      ? current.filter((id) => id !== submissionId)
      : [...current, submissionId])
  }

  function toggleCurrentPage() {
    const pageIds = paginatedSubmissions.map((submission) => submission.id)
    setSelectedIds((current) => {
      if (allPageSelected) return current.filter((id) => !pageIds.includes(id))
      return [...new Set([...current, ...pageIds])]
    })
  }

  function updatePaymentStatus(paymentStatus) {
    if (!selectedIds.length) {
      toast.error('Tidak ada data terpilih', 'Pilih minimal satu crew sebelum menjalankan aksi pembayaran.')
      return
    }
    if (paymentStatus === 'paid' && selectedSubmissions.some((submission) => !Number(submission.amount))) {
      const confirmed = window.confirm('Sebagian data terpilih belum memiliki nominal. Tetap tandai sebagai dibayar?')
      if (!confirmed) return
    }
    const now = new Date().toISOString()
    try {
      onSubmissionsChange(submissions.map((submission) => selectedSet.has(submission.id)
        ? { ...submission, paymentStatus, paymentUpdatedAt: now }
        : submission))
      toast.success(paymentStatus === 'paid' ? 'Status pembayaran diperbarui' : 'Status dikembalikan', `${selectedIds.length} data ditandai ${paymentStatus === 'paid' ? 'sudah dibayar' : 'belum dibayar'}.`)
      setSelectedIds([])
    } catch {
      toast.error('Status gagal diperbarui', 'Perubahan pembayaran tidak dapat disimpan.')
    }
  }

  function exportCsv() {
    try {
      const headers = ['Nama Lengkap', 'Posisi', 'WhatsApp', 'NIK / KTP', 'Bank / Layanan', 'Nomor Rekening', 'Nama Pemilik Rekening', 'Nominal Pembayaran', 'Status Pembayaran', 'Tanggal Input']
      const rows = sortedSubmissions.map((submission) => [
        submission.fullName, getSubmissionPosition(submission), `+62 ${submission.whatsapp}`, submission.ktp || '',
        submission.bank, submission.accountNumber, submission.accountName,
        submission.amount || 0, getPaymentStatus(submission) === 'paid' ? 'Dibayar' : 'Belum dibayar',
        formatDateTime(submission.submittedAt),
      ])
      const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `data-crew-${event.slug}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('CSV berhasil dibuat', `${sortedSubmissions.length} data crew diekspor sesuai filter aktif.`)
    } catch {
      toast.error('CSV gagal dibuat', 'Browser tidak dapat menyiapkan file ekspor. Coba kembali.')
    }
  }

  function removeSubmission(submission) {
    const confirmed = window.confirm(`Hapus data ${submission.fullName} dari event ${event.name}?`)
    if (!confirmed) return
    try {
      onSubmissionsChange(submissions.filter((item) => item.id !== submission.id))
      setSelectedIds((current) => current.filter((id) => id !== submission.id))
      toast.success('Data crew berhasil dihapus', `${submission.fullName} sudah dihapus dari ${event.name}.`)
    } catch {
      toast.error('Data crew gagal dihapus', 'Data masih dipertahankan karena perubahan tidak dapat disimpan.')
    }
  }

  return (
    <div className="detail-shell">
      <header className="detail-topbar">
        <button type="button" onClick={() => navigate('/admin')}><Icon name="back" /> Kembali ke event</button>
        <div><span>PRASASTI CREW · FINANCE DATA</span><button type="button" onClick={onLogout}>Keluar</button></div>
      </header>

      <main className="detail-main">
        <section className="detail-hero">
          <div>
            <p className="eyebrow">DETAIL EVENT</p>
            <h1>{event.name}</h1>
            <div className="detail-event-meta">
              <span>{formatEventDate(event.eventDate)}</span><span>{event.location || 'Lokasi belum diatur'}</span><span>/{event.slug}</span>
              <span className={`status-badge ${event.formStatus === 'closed' ? 'is-closed' : 'is-open'}`}>{event.formStatus === 'closed' ? 'Form ditutup' : 'Form dibuka'}</span>
            </div>
          </div>
          <div className="detail-hero-actions">
            <button className="secondary-button" type="button" onClick={() => navigate(`/${event.slug}`)}>Buka form <Icon name="external" /></button>
            <button className="submit-button" type="button" onClick={exportCsv} disabled={!sortedSubmissions.length}>Export CSV <Icon name="download" /></button>
          </div>
        </section>

        <section className="detail-stats" aria-label="Ringkasan data crew">
          <div><span>Total crew</span><strong>{submissions.length}</strong><small>respons tercatat</small></div>
          <div><span>Total pembayaran</span><strong className="stat-money">Rp{formatRupiah(totalAmount) || '0'}</strong><small>nominal yang sudah diisi finance</small></div>
          <div><span>Status dibayar</span><strong>{paidCount}</strong><small>{submissions.length - paidCount} belum dibayar</small></div>
          <div><span>Data terbaru</span><strong className="stat-date">{lastSubmission ? formatDateTime(lastSubmission.updatedAt) : 'Belum ada'}</strong><small>{lastSubmission?.fullName || `${submissions.length} data crew`}</small></div>
        </section>

        <section className="crew-ledger" aria-labelledby="crew-ledger-title">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">FINANCE LEDGER</p>
              <h2 id="crew-ledger-title">Data crew dan rekening</h2>
              <p>{sortedSubmissions.length} dari {submissions.length} data · halaman {safePage} dari {totalPages}.</p>
            </div>
            <div className="ledger-filters">
              <label className="ledger-search"><span className="sr-only">Cari data crew</span><Icon name="search" /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, posisi, WA, bank, rekening..." /></label>
              <select value={sortValue} onChange={(e) => setSortValue(e.target.value)} aria-label="Urutkan data">
                <option value="updatedAt:desc">Terbaru</option><option value="updatedAt:asc">Terlama</option>
                <option value="fullName:asc">Nama A–Z</option><option value="fullName:desc">Nama Z–A</option>
                <option value="amount:desc">Nominal terbesar</option><option value="amount:asc">Nominal terkecil</option>
                <option value="paymentStatus:asc">Status pembayaran</option>
              </select>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="bulk-toolbar" role="region" aria-label="Aksi data terpilih">
              <strong>{selectedIds.length} data dipilih</strong>
              <div><button type="button" onClick={() => updatePaymentStatus('paid')}>Tandai dibayar</button><button type="button" onClick={() => updatePaymentStatus('pending')}>Tandai belum dibayar</button><button type="button" onClick={() => setSelectedIds([])}>Batal pilih</button></div>
            </div>
          )}

          {sortedSubmissions.length ? (
            <>
              <div className="crew-table-wrap">
                <table className="crew-table">
                  <thead><tr>
                    <th className="selection-cell"><SelectionControl inputRef={selectAllRef} checked={allPageSelected} indeterminate={somePageSelected && !allPageSelected} onChange={toggleCurrentPage} label="Pilih semua data pada halaman ini" /></th>
                    <th>No.</th><th>Crew</th><th>Posisi</th><th>Kontak</th><th>NIK / KTP</th><th>Bank / Layanan</th><th>Rekening</th><th>Nominal</th><th>Status</th><th>Waktu input</th><th><span className="sr-only">Aksi</span></th>
                  </tr></thead>
                  <tbody>{paginatedSubmissions.map((submission, index) => {
                    const selected = selectedSet.has(submission.id)
                    const paymentStatus = getPaymentStatus(submission)
                    return (
                      <tr className={selected ? 'is-selected' : ''} key={submission.id}>
                        <td className="selection-cell"><SelectionControl checked={selected} onChange={() => toggleSelection(submission.id)} label={`Pilih data ${submission.fullName}`} /></td>
                        <td>{String(pageStart + index + 1).padStart(2, '0')}</td>
                        <td><strong>{submission.fullName}</strong><small>{submission.accountName}</small></td>
                        <td><div className="table-position-list">{getSubmissionPositions(submission).map((position) => <span key={position}>{position}</span>)}</div></td>
                        <td><strong>+62 {submission.whatsapp}</strong></td>
                        <td>{submission.ktp || '—'}</td>
                        <td>{submission.bank}</td>
                        <td><strong>{submission.accountNumber}</strong><small>a.n. {submission.accountName}</small></td>
                        <td><label className="amount-input"><span>Rp</span><input type="text" inputMode="numeric" value={formatRupiah(submission.amount)} onChange={(e) => updateAmount(submission.id, e.target.value)} onBlur={() => notifyAmountSaved(submission)} placeholder="0" aria-label={`Nominal pembayaran ${submission.fullName}`} /></label></td>
                        <td><span className={`payment-badge is-${paymentStatus}`}>{paymentStatus === 'paid' ? 'Dibayar' : 'Belum dibayar'}</span></td>
                        <td>{formatDateTime(submission.updatedAt)}</td>
                        <td><button className="table-delete" type="button" onClick={() => removeSubmission(submission)} aria-label={`Hapus data ${submission.fullName}`}><Icon name="trash" /></button></td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>

              <div className="crew-mobile-list">
                {paginatedSubmissions.map((submission, index) => {
                  const selected = selectedSet.has(submission.id)
                  const paymentStatus = getPaymentStatus(submission)
                  return (
                    <article className={`crew-mobile-card ${selected ? 'is-selected' : ''}`} key={submission.id}>
                      <div className="crew-mobile-head">
                        <SelectionControl checked={selected} onChange={() => toggleSelection(submission.id)} label={`Pilih data ${submission.fullName}`} />
                        <span>{String(pageStart + index + 1).padStart(2, '0')}</span>
                        <div><h3>{submission.fullName}</h3><small>{getSubmissionPosition(submission) || '—'}</small></div>
                        <button type="button" onClick={() => removeSubmission(submission)} aria-label={`Hapus data ${submission.fullName}`}><Icon name="trash" /></button>
                      </div>
                      <dl>
                        <div><dt>WhatsApp</dt><dd>+62 {submission.whatsapp}</dd></div><div><dt>NIK / KTP</dt><dd>{submission.ktp || '—'}</dd></div><div><dt>Bank</dt><dd>{submission.bank}</dd></div>
                        <div><dt>Nomor rekening</dt><dd>{submission.accountNumber}</dd></div><div><dt>Pemilik rekening</dt><dd>{submission.accountName}</dd></div>
                        <div><dt>Status</dt><dd><span className={`payment-badge is-${paymentStatus}`}>{paymentStatus === 'paid' ? 'Dibayar' : 'Belum dibayar'}</span></dd></div>
                        <div className="mobile-amount-row"><dt>Nominal pembayaran</dt><dd><label className="amount-input"><span>Rp</span><input type="text" inputMode="numeric" value={formatRupiah(submission.amount)} onChange={(e) => updateAmount(submission.id, e.target.value)} onBlur={() => notifyAmountSaved(submission)} placeholder="0" aria-label={`Nominal pembayaran ${submission.fullName}`} /></label></dd></div>
                      </dl><p>Diinput {formatDateTime(submission.updatedAt)}</p>
                    </article>
                  )
                })}
              </div>

              <nav className="ledger-pagination" aria-label="Navigasi halaman data crew">
                <label>Baris per halaman <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
                <span>{pageStart + 1}–{Math.min(pageStart + pageSize, sortedSubmissions.length)} dari {sortedSubmissions.length}</span>
                <div><button type="button" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button><button type="button" disabled={safePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Berikutnya</button></div>
              </nav>
            </>
          ) : (
            <div className="ledger-empty"><span><Icon name="users" /></span><h3>{submissions.length ? 'Data tidak ditemukan' : 'Belum ada data crew'}</h3><p>{submissions.length ? 'Coba ubah kata kunci pencarian.' : 'Bagikan tautan form event. Respons yang sudah dikonfirmasi akan muncul di sini.'}</p></div>
          )}
        </section>
      </main>
    </div>
  )
}

export default EventDetailPage
