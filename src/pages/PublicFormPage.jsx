import { useEffect, useMemo, useRef, useState } from 'react'
import { PAYMENT_OPTIONS } from '../bankOptions.js'
import { useToast } from '../components/ToastProvider.jsx'
import TurnstileWidget from '../components/TurnstileWidget.jsx'
import { backend } from '../data/apiClient.js'
import { getSubmissions, searchCrewProfiles } from '../data/submissionStore.js'

const BASE_REQUIRED_FIELDS = ['fullName', 'whatsapp', 'ktp', 'bank', 'accountNumber', 'accountName', 'consent']
const EMPTY_FORM = {
  position: '',
  fullName: '',
  whatsapp: '',
  ktp: '',
  bank: '',
  accountNumber: '',
  accountName: '',
  consent: false,
}

function BrandMark() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <path d="M8 36V13.5A5.5 5.5 0 0 1 13.5 8H25c6.08 0 11 4.92 11 11s-4.92 11-11 11h-7" />
      <path d="M18 16h7a3 3 0 0 1 0 6h-7v14" />
      <path d="M8 36h10" />
    </svg>
  )
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
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

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4h12l2 2v14H5V4Z" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" />
    </svg>
  )
}

function formatWhatsapp(value) {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('62')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  digits = digits.slice(0, 13)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 11) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)} ${digits.slice(11)}`
}

function formatAccount(value) {
  return value.replace(/\D/g, '').slice(0, 24).replace(/(.{4})/g, '$1 ').trim()
}

function formatKtp(value) {
  return value.replace(/\D/g, '').slice(0, 16)
}

function formatEventDate(value) {
  if (!value) return 'Tanggal belum diatur'
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function getErrors(form) {
  const errors = {}
  if (!form.position || form.position.trim().length < 2) errors.position = 'Masukkan posisi / peran saat event.'
  if (form.fullName.trim().split(/\s+/).length < 2) errors.fullName = 'Masukkan nama lengkap, minimal dua kata.'
  const whatsappDigits = form.whatsapp.replace(/\D/g, '')
  if (whatsappDigits.length < 9 || whatsappDigits.length > 13) errors.whatsapp = 'Masukkan 9–13 digit nomor WhatsApp.'
  if (form.ktp.replace(/\D/g, '').length !== 16) errors.ktp = 'Nomor KTP harus 16 digit.'
  if (!PAYMENT_OPTIONS.some((option) => option.name.toLowerCase() === form.bank.toLowerCase())) errors.bank = 'Pilih bank atau layanan dari daftar.'
  if (form.accountNumber.replace(/\D/g, '').length < 6) errors.accountNumber = 'Nomor rekening minimal 6 digit.'
  if (form.accountName.trim().split(/\s+/).length < 2) errors.accountName = 'Masukkan nama pemilik sesuai rekening.'
  if (!form.consent) errors.consent = 'Persetujuan diperlukan sebelum mengirim.'
  return errors
}

function loadDraft(storageKey) {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return EMPTY_FORM
    const parsed = JSON.parse(saved)
    const position = typeof parsed.position === 'string' && parsed.position.trim()
      ? parsed.position
      : Array.isArray(parsed.positions)
        ? parsed.positions.join(', ')
        : typeof parsed.position === 'string'
          ? parsed.position
          : ''
    const sanitizedDraft = {
      ...EMPTY_FORM,
      position,
      fullName: parsed.fullName || '',
      whatsapp: parsed.whatsapp || '',
      bank: parsed.bank || '',
      accountName: parsed.accountName || '',
      accountNumber: '',
      consent: false,
    }
    localStorage.setItem(storageKey, JSON.stringify(sanitizedDraft))
    return sanitizedDraft
  } catch {
    return EMPTY_FORM
  }
}

function FieldFeedback({ name, touched, errors, hint }) {
  if (touched[name] && errors[name]) return <small className="field-message error-message">{errors[name]}</small>
  return hint ? <small className="field-message field-hint">{hint}</small> : null
}

function FieldCheck({ show }) {
  return show ? <span className="field-check"><CheckIcon /></span> : null
}

function SearchableBank({ value, onChange, onBlur, invalid, valid }) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const normalizedQuery = value.trim().toLowerCase()
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return PAYMENT_OPTIONS
    return PAYMENT_OPTIONS.filter((option) => `${option.name} ${option.group}`.toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery])

  function choose(option) {
    onChange(option.name)
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') setOpen(false)
    if (event.key === 'Enter' && open && filteredOptions.length) {
      event.preventDefault()
      choose(filteredOptions[0])
    }
  }

  return (
    <div className="bank-combobox">
      <div className="control-wrap">
        <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input
          ref={inputRef}
          id="bank"
          name="bank"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="bank-options"
          aria-expanded={open}
          aria-invalid={invalid}
          autoComplete="off"
          placeholder="Cari nama bank atau e-wallet"
          value={value}
          onChange={(event) => { onChange(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { window.setTimeout(() => setOpen(false), 120); onBlur() }}
          onKeyDown={handleKeyDown}
        />
        <FieldCheck show={valid} />
        <svg className={`chevron-icon ${open ? 'is-open' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </div>

      {open && (
        <div className="bank-options" id="bank-options" role="listbox">
          <div className="bank-results-meta"><span>{filteredOptions.length} pilihan ditemukan</span><small>Tekan Enter untuk memilih teratas</small></div>
          <div className="bank-options-scroll">
            {filteredOptions.length ? filteredOptions.map((option) => (
              <button
                className={value === option.name ? 'is-selected' : ''}
                type="button"
                role="option"
                aria-selected={value === option.name}
                key={`${option.group}-${option.name}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span>{option.name}</span><small>{option.group}</small>
              </button>
            )) : (
              <div className="bank-empty">
                <strong>Nama tidak ditemukan</strong><span>Coba kata kunci lain atau pilih “lainnya”.</span>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose({ name: 'Bank / layanan pembayaran lainnya' })}>Gunakan pilihan lainnya</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function getCrewInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '•'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function CrewLookup({ onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      setActiveIndex(0)
      return undefined
    }
    setLoading(true)
    const timer = window.setTimeout(async () => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      try {
        const remote = await backend.crew.search(trimmed, 8)
        if (requestIdRef.current !== requestId) return
        setResults(Array.isArray(remote) ? remote : [])
        setActiveIndex(0)
        setOpen(true)
      } catch {
        if (requestIdRef.current !== requestId) return
        try {
          setResults(searchCrewProfiles(getSubmissions(), trimmed, 8))
        } catch {
          setResults([])
        }
        setActiveIndex(0)
        setOpen(true)
      } finally {
        if (requestIdRef.current === requestId) setLoading(false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  function pick(profile) {
    if (!profile) return
    onPick?.(profile)
    setQuery(profile?.fullName || '')
    setOpen(false)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || !results.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      pick(results[activeIndex] || results[0])
    }
  }

  const showPanel = open && query.trim().length >= 2

  return (
    <div className="crew-lookup">
      <label className="crew-lookup-label" htmlFor="crewLookup">Cari nama</label>
      <div className={`crew-lookup-field ${showPanel ? 'is-open' : ''}`}>
        <svg className="crew-lookup-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input
          ref={inputRef}
          id="crewLookup"
          name="crewLookup"
          type="search"
          autoComplete="off"
          placeholder="Ketik nama kamu…"
          value={query}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="crew-lookup-options"
          aria-expanded={showPanel}
          aria-activedescendant={showPanel && results[activeIndex] ? `crew-option-${activeIndex}` : undefined}
          onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
          onFocus={() => { if (results.length) setOpen(true) }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
        />
        {loading ? (
          <span className="crew-lookup-spinner" aria-hidden="true" />
        ) : query ? (
          <button
            className="crew-lookup-clear"
            type="button"
            aria-label="Bersihkan pencarian nama"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { setQuery(''); setResults([]); setOpen(false); setActiveIndex(0); inputRef.current?.focus() }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        ) : null}
      </div>
      {query.trim().length < 2 ? (
        <p className="crew-lookup-hint">Ketik minimal 2 huruf. Data dari event lain akan mengisi form otomatis.</p>
      ) : null}
      {showPanel && (
        <div className="crew-lookup-panel" id="crew-lookup-options" role="listbox" aria-label="Hasil pencarian crew">
          <div className="crew-lookup-meta">
            <span>{loading ? 'Mencari…' : results.length ? `${results.length} hasil` : 'Tidak ada hasil'}</span>
            {results.length > 0 && <span className="crew-lookup-meta-action">Pilih untuk isi otomatis</span>}
          </div>
          {!loading && results.length === 0 ? (
            <div className="crew-lookup-empty">
              <strong>Nama tidak ditemukan</strong>
              <span>Lanjut isi manual di bawah — datamu akan tersimpan untuk event berikutnya.</span>
            </div>
          ) : (
            <ul className="crew-lookup-list">
              {results.map((profile, index) => {
                const sub = [profile.bank, profile.lastEventName].filter(Boolean).join(' · ')
                return (
                  <li key={`${profile.fullName}-${profile.accountNumber || profile.whatsapp || index}`}>
                    <button
                      id={`crew-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`crew-lookup-item ${index === activeIndex ? 'is-active' : ''}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pick(profile)}
                    >
                      <span className="crew-lookup-avatar" aria-hidden="true">{getCrewInitials(profile.fullName)}</span>
                      <span className="crew-lookup-main">
                        <strong>{profile.fullName}</strong>
                        <small>{sub || 'Data crew tersimpan'}</small>
                      </span>
                      <span className="crew-lookup-wa">+62 {profile.whatsapp || '—'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function DuplicateModal({ message, onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <div className="status-modal-backdrop" role="presentation">
      <section
        className="status-modal duplicate-modal"
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="duplicate-modal-title"
        aria-describedby="duplicate-modal-description"
        tabIndex="-1"
      >
        <div className="modal-handle" aria-hidden="true" />
        <button className="modal-close" type="button" onClick={onClose} aria-label="Tutup peringatan">×</button>
        <div className="modal-status-icon is-warning" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 8v5M12 17h.01" /><path d="M10.3 4.4 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0Z" /></svg>
        </div>
        <p className="modal-kicker">DATA DUPLIKAT</p>
        <h2 id="duplicate-modal-title">Data sudah pernah dikirim.</h2>
        <p className="modal-description" id="duplicate-modal-description">{message}</p>
        <div className="duplicate-check-list">
          <span>Nama lengkap</span>
          <span>Nomor rekening</span>
          <strong>Sudah tercatat pada event ini</strong>
        </div>
        <button className="submit-button modal-primary-action" type="button" onClick={onClose}>Periksa kembali data</button>
        <p className="modal-footnote"><ShieldIcon /> Jika merasa ini keliru, hubungi admin event untuk memeriksa data sebelumnya.</p>
      </section>
    </div>
  )
}

function Confirmation({ form, event, onEdit, onReset, onViewResponse }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <div className="status-modal-backdrop" role="presentation">
      <section
        className="status-modal success-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
        tabIndex="-1"
      >
        <div className="modal-handle" aria-hidden="true" />
        <button className="modal-close" type="button" onClick={onEdit} aria-label="Tutup dan kembali ke formulir">×</button>
        <div className="modal-status-icon is-success"><CheckIcon /></div>
        <p className="modal-kicker">DATA TERCATAT</p>
        <h2 id="confirmation-title">Data berhasil dikirim.</h2>
        <p className="modal-description" id="confirmation-description">Data crew dan rekening sudah masuk ke event ini dan siap diperiksa oleh tim finance.</p>

        <div className="success-receipt">
          <div className="receipt-event">
            <span>EVENT</span>
            <strong>{event?.name || 'Prasasti Crew'}</strong>
            {event && <small>{formatEventDate(event.eventDate)} · {event.location || 'Lokasi belum diatur'}</small>}
          </div>
          <dl className="receipt-grid">
            <div><dt>Nama crew</dt><dd>{form.fullName}</dd></div>
            <div><dt>Posisi</dt><dd>{(form.position || '').trim() || (Array.isArray(form.positions) ? form.positions.join(', ') : '') || '—'}</dd></div>
            <div><dt>WhatsApp</dt><dd>+62 {form.whatsapp}</dd></div>
            <div><dt>Nomor KTP / NIK</dt><dd>{form.ktp}</dd></div>
            <div><dt>Bank / layanan</dt><dd>{form.bank}</dd></div>
            <div><dt>Nomor rekening</dt><dd>{form.accountNumber}</dd></div>
            <div className="receipt-full"><dt>Nama pemilik rekening</dt><dd>{form.accountName}</dd></div>
          </dl>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onEdit}>Periksa kembali</button>
          <button className="secondary-button" type="button" onClick={onViewResponse}>Lihat daftar respon</button>
          <button className="submit-button" type="button" onClick={onReset}>Selesai</button>
        </div>
        <p className="modal-footnote"><ShieldIcon /> Simpan bukti ini sampai tim finance selesai memproses data.</p>
      </section>
    </div>
  )
}

function PublicFormPage({ event, onSubmitData, navigate }) {
  const toast = useToast()
  const storageKey = `prasasti-crew-form-draft:${event?.slug || 'general'}`
  const requiredFields = ['position', ...BASE_REQUIRED_FIELDS]
  const [form, setForm] = useState(() => loadDraft(storageKey))
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [submissionId, setSubmissionId] = useState(null)
  const [submissionError, setSubmissionError] = useState('')
  const [sending, setSending] = useState(false)
  const [siteKey, setSiteKey] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [widgetError, setWidgetError] = useState('')
  const [widgetReset, setWidgetReset] = useState(0)
  const turnstileRef = useRef(null)
  const [draftSaved, setDraftSaved] = useState(true)
  const [draftError, setDraftError] = useState(false)
  const draftErrorNotifiedRef = useRef(false)
  const formRef = useRef(null)
  const errors = getErrors(form)
  const completedFields = requiredFields.filter((name) => !errors[name]).length
  const progress = Math.round((completedFields / requiredFields.length) * 100)
  const personalComplete = !errors.position && !errors.fullName && !errors.whatsapp && !errors.ktp
  const paymentComplete = !errors.bank && !errors.accountNumber && !errors.accountName

  useEffect(() => {
    let cancelled = false
    async function loadSiteKey() {
      try {
        const response = await fetch('/api/turnstile/config')
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled && data && data.siteKey) setSiteKey(data.siteKey)
      } catch {
        // Tanpa API (mode lokal) widget disembunyikan dan form jalan seperti biasa.
      }
    }
    loadSiteKey()
    return () => { cancelled = true }
  }, [])

  function refreshTurnstile() {
    setTurnstileToken('')
    setWidgetReset((count) => count + 1)
  }

  useEffect(() => {
    setDraftSaved(false)
    setDraftError(false)
    const timer = window.setTimeout(() => {
      const sanitizedDraft = {
        position: form.position,
        fullName: form.fullName,
        whatsapp: form.whatsapp,
        bank: form.bank,
        accountName: form.accountName,
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(sanitizedDraft))
        setDraftSaved(true)
        draftErrorNotifiedRef.current = false
      } catch {
        setDraftError(true)
        if (!draftErrorNotifiedRef.current) {
          toast.error('Draft gagal disimpan', 'Browser menolak penyimpanan lokal. Data yang belum dikirim dapat hilang saat halaman ditutup.')
          draftErrorNotifiedRef.current = true
        }
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [form, storageKey, toast])

  useEffect(() => {
    if (!submitted && !submissionError) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleEscape = (eventObject) => {
      if (eventObject.key !== 'Escape') return
      if (submissionError) setSubmissionError('')
      else setSubmitted(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [submitted, submissionError])

  const [crewNotice, setCrewNotice] = useState(null)

  function updateField(name, value) {
    setSubmissionError('')
    setForm((current) => ({ ...current, [name]: value }))
  }

  function handleCrewPick(profile) {
    if (!profile) return
    setSubmissionError('')
    setForm((current) => ({
      ...current,
      fullName: profile.fullName || current.fullName,
      whatsapp: profile.whatsapp ? formatWhatsapp(profile.whatsapp) : current.whatsapp,
      ktp: profile.ktp ? formatKtp(profile.ktp) : current.ktp,
      bank: profile.bank || current.bank,
      accountNumber: profile.accountNumber ? formatAccount(profile.accountNumber) : current.accountNumber,
      accountName: profile.accountName ? String(profile.accountName).toUpperCase() : current.accountName,
    }))
    setTouched((current) => ({
      ...current,
      fullName: true,
      whatsapp: true,
      ktp: true,
      bank: true,
      accountNumber: true,
      accountName: true,
    }))
    setCrewNotice(profile)
    toast.success('Data lama dimuat', `Data ${profile.fullName} terisi otomatis. Tinggal lengkapi Posisi lalu kirim.`)
  }

  function clearCrewNotice() {
    setCrewNotice(null)
  }

  function markTouched(name) {
    setTouched((current) => ({ ...current, [name]: true }))
  }

  function fieldClass(name) {
    if (!touched[name]) return ''
    return errors[name] ? 'is-invalid' : 'is-valid'
  }

  function isValid(name) {
    return Boolean(touched[name] && !errors[name] && form[name])
  }

  async function handleSubmit(eventObject) {
    eventObject.preventDefault()
    if (sending) return
    const allTouched = Object.keys(EMPTY_FORM).reduce((result, name) => ({ ...result, [name]: true }), {})
    setTouched(allTouched)
    if (Object.keys(errors).length) {
      toast.error('Form belum lengkap', `${Object.keys(errors).length} bagian perlu diperiksa sebelum data dikirim.`)
      window.setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    if (!event || !onSubmitData) {
      const message = 'Formulir ini tidak memiliki tujuan event yang aktif. Kembali ke daftar event dan pilih formulir yang tersedia.'
      setSubmissionError(message)
      toast.error('Form tidak tersedia', message)
      return
    }
    if (siteKey && !turnstileToken) {
      toast.error('Verifikasi belum dicentang', 'Centang verifikasi keamanan di bawah sebelum mengirim data.')
      turnstileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    try {
      setSending(true)
      const result = await onSubmitData({ ...form, turnstileToken }, submissionId)
      refreshTurnstile()
      if (!result.ok) {
        setSubmissionError(result.message)
        toast.error('Data gagal dikirim', result.message)
        return
      }
      setSubmissionId(result.id)
      setSubmissionError('')
      setSubmitted(true)
      toast.success('Data berhasil dikirim', `Data ${form.fullName} sudah tercatat untuk ${event.name}.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      const message = 'Terjadi gangguan saat menyimpan data. Coba kembali beberapa saat lagi.'
      setSubmissionError(message)
      toast.error('Data gagal dikirim', message)
    } finally {
      setSending(false)
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setTouched({})
    setSubmitted(false)
    setSubmissionId(null)
    setSubmissionError('')
    setCrewNotice(null)
    localStorage.removeItem(storageKey)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
          <p className="eyebrow">{event ? 'PENDATAAN CREW EVENT' : 'FORMULIR DATA CREW'}</p>
          <h1>{event ? event.name : <>Data yang rapi,<br />pembayaran lebih pasti.</>}</h1>
          {event && (
            <div className="public-event-meta">
              <span><ClockIcon /> {formatEventDate(event.eventDate)}</span>
              <span><LocationIcon /> {event.location || 'Lokasi belum diatur'}</span>
            </div>
          )}
          <p className="intro-text">{event ? `Isi data pekerjaan dan rekening setelah bertugas di ${event.name}. Informasi ini digunakan tim finance untuk memproses pembayaran crew.` : 'Lengkapi identitas, riwayat posisi, dan rekening agar tim finance dapat memproses pembayaran crew dengan tepat.'}</p>
          <div className="trust-inline"><span><ClockIcon /> ±2 menit</span><span><ShieldIcon /> Untuk proses finance</span></div>
        </div>
        <div className="form-map" aria-label="Bagian formulir">
          <div className={`map-item is-active ${personalComplete ? 'is-complete' : ''}`}><span>{personalComplete ? <CheckIcon /> : '01'}</span><div><strong>Data crew</strong><small>Posisi, identitas, dan kontak</small></div></div>
          <div className="map-line" />
          <div className={`map-item ${paymentComplete ? 'is-complete' : ''}`}><span>{paymentComplete ? <CheckIcon /> : '02'}</span><div><strong>Rekening pembayaran</strong><small>Tujuan transfer finance</small></div></div>
        </div>
        <div className="privacy-note"><ShieldIcon /><p><strong>Data untuk kebutuhan finance.</strong> Draft non-sensitif disimpan di perangkat ini. Nomor rekening dan KTP tidak disimpan sebagai draft dan baru dicatat
           setelah data dikirim.</p></div>
      </aside>

      <main className="form-column">
        {submitted ? (
          <Confirmation form={form} event={event} onEdit={() => setSubmitted(false)} onReset={resetForm} onViewResponse={() => navigate?.(`/${event.slug}/respon`)} />
        ) : (
          <>
            <div className="form-heading">
              <p className="mobile-eyebrow">{event ? 'DATA CREW EVENT' : 'PENDATAAN CREW'}</p>
              {event && (
                <div className="event-context">
                  <span>EVENT</span>
                  <div><strong>{event.name}</strong><small>{formatEventDate(event.eventDate)} · {event.location || 'Lokasi belum diatur'}</small></div>
                </div>
              )}
              {event && (
                <button className="respon-link" type="button" onClick={() => navigate?.(`/${event.slug}/respon`)}>Lihat daftar data yang sudah masuk</button>
              )}
              <div className="heading-row">
                <div><h2>Lengkapi data pembayaran</h2><p>Isi sesuai data diri dan rekening aktif. Kolom bertanda <span>*</span> wajib diisi.</p></div>
                <div className={`draft-status ${draftSaved ? 'is-saved' : ''} ${draftError ? 'is-error' : ''}`}><SaveIcon /> {draftError ? 'Draft gagal disimpan' : draftSaved ? 'Draft non-sensitif tersimpan' : 'Menyimpan draft...'}</div>
              </div>
              <div className="progress-block" aria-label={`${progress}% formulir selesai`}><div><span>Progres pengisian</span><strong>{completedFields}/{requiredFields.length} lengkap</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>
            </div>

            <section className="crew-lookup-card" aria-labelledby="crew-lookup-title">
              <div className="crew-lookup-head">
                <span className="crew-lookup-icon-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
                </span>
                <div className="crew-lookup-titles">
                  <p className="crew-lookup-kicker">ISI OTOMATIS · CREW LAMA</p>
                  <h3 id="crew-lookup-title">Sudah Pernah Isi di Event Lain? Cari Namamu</h3>
                  <p className="crew-lookup-desc">Pilih namamu — data &amp; rekening terisi sendiri. Tinggal isi Posisi.</p>
                </div>
              </div>
              <CrewLookup onPick={handleCrewPick} />
              {crewNotice && (
                <div className="crew-lookup-notice" role="status">
                  <span className="crew-lookup-notice-icon" aria-hidden="true"><CheckIcon /></span>
                  <span className="crew-lookup-notice-text">Data <strong>{crewNotice.fullName}</strong> dimuat{crewNotice.lastEventName ? <> dari <strong>{crewNotice.lastEventName}</strong></> : null}. Cek kembali, lalu isi Posisi.</span>
                  <button type="button" onClick={clearCrewNotice} aria-label="Tutup pemberitahuan">×</button>
                </div>
              )}
            </section>

            {submissionError && <DuplicateModal message={submissionError} onClose={() => setSubmissionError('')} />}

            <form ref={formRef} onSubmit={handleSubmit} noValidate>
              <fieldset className={`form-section ${personalComplete ? 'section-complete' : ''}`}>
                <legend><span className="section-number">{personalComplete ? <CheckIcon /> : '01'}</span><span><strong>Data crew</strong><small>Catat posisi kerja, identitas, dan kontak yang dapat dihubungi.</small></span></legend>
                <div className="field-grid">
                  <div className={`field field-full ${fieldClass('position')}`}>
                    <label htmlFor="position">Posisi / peran saat event <span>*</span></label>
                    <div className="control-wrap"><input id="position" name="position" type="text" placeholder="Contoh: Loading, Konsumsi, LO, dll" autoComplete="off" value={form.position} aria-invalid={touched.position && Boolean(errors.position)} onChange={(e) => updateField('position', e.target.value)} onBlur={() => markTouched('position')} /><FieldCheck show={isValid('position')} /></div>
                    <FieldFeedback name="position" touched={touched} errors={errors} hint="Tulis peran yang dijalankan saat event berlangsung." />
                  </div>

                  <div className={`field field-full ${fieldClass('fullName')}`}>
                    <label htmlFor="fullName">Nama lengkap <span>*</span></label>
                    <div className="control-wrap"><input id="fullName" name="fullName" type="text" placeholder="Sesuai identitas resmi" autoComplete="name" value={form.fullName} aria-invalid={touched.fullName && Boolean(errors.fullName)} onChange={(e) => updateField('fullName', e.target.value)} onBlur={() => markTouched('fullName')} /><FieldCheck show={isValid('fullName')} /></div>
                    <FieldFeedback name="fullName" touched={touched} errors={errors} />
                  </div>

                  <div className={`field field-full ${fieldClass('whatsapp')}`}>
                    <label htmlFor="whatsapp">Nomor WhatsApp <span>*</span></label>
                    <div className="phone-field control-wrap"><span>+62</span><input id="whatsapp" name="whatsapp" type="tel" inputMode="numeric" placeholder="812 3456 7890" autoComplete="tel" value={form.whatsapp} aria-invalid={touched.whatsapp && Boolean(errors.whatsapp)} onChange={(e) => updateField('whatsapp', formatWhatsapp(e.target.value))} onBlur={() => markTouched('whatsapp')} /><FieldCheck show={isValid('whatsapp')} /></div>
                    <FieldFeedback name="whatsapp" touched={touched} errors={errors} hint="Nomor diformat otomatis tanpa angka 0 di depan." />
                  </div>

                  <div className={`field field-full ${fieldClass('ktp')}`}>
                    <label htmlFor="ktp">Nomor KTP / NIK <span>*</span></label>
                    <div className="control-wrap"><input id="ktp" name="ktp" type="text" inputMode="numeric" placeholder="16 digit sesuai KTP" autoComplete="off" value={form.ktp} aria-invalid={touched.ktp && Boolean(errors.ktp)} onChange={(e) => updateField('ktp', formatKtp(e.target.value))} onBlur={() => markTouched('ktp')} /><FieldCheck show={isValid('ktp')} /></div>
                    <FieldFeedback name="ktp" touched={touched} errors={errors} hint="Hanya angka, tidak disimpan sebagai draft di perangkat ini." />
                  </div>
                </div>
              </fieldset>

              <fieldset className={`form-section ${paymentComplete ? 'section-complete' : ''}`}>
                <legend><span className="section-number">{paymentComplete ? <CheckIcon /> : '02'}</span><span><strong>Rekening pembayaran</strong><small>Digunakan tim finance untuk mentransfer pembayaran crew.</small></span></legend>
                <div className="field-grid">
                  <div className={`field field-full ${fieldClass('bank')}`}>
                    <label htmlFor="bank">Bank atau layanan pembayaran <span>*</span></label>
                    <SearchableBank value={form.bank} onChange={(value) => updateField('bank', value)} onBlur={() => markTouched('bank')} invalid={touched.bank && Boolean(errors.bank)} valid={isValid('bank')} />
                    <FieldFeedback name="bank" touched={touched} errors={errors} hint={`${PAYMENT_OPTIONS.length} pilihan bank, BPD, bank digital, dan e-wallet tersedia.`} />
                  </div>
                  <div className={`field ${fieldClass('accountNumber')}`}>
                    <label htmlFor="accountNumber">Nomor rekening <span>*</span></label>
                    <div className="control-wrap"><input id="accountNumber" name="accountNumber" type="text" inputMode="numeric" placeholder="1234 5678 9012" autoComplete="off" value={form.accountNumber} aria-invalid={touched.accountNumber && Boolean(errors.accountNumber)} onChange={(e) => updateField('accountNumber', formatAccount(e.target.value))} onBlur={() => markTouched('accountNumber')} /><FieldCheck show={isValid('accountNumber')} /></div>
                    <FieldFeedback name="accountNumber" touched={touched} errors={errors} hint="Angka akan dikelompokkan otomatis." />
                  </div>
                  <div className={`field ${fieldClass('accountName')}`}>
                    <label htmlFor="accountName">Nama pemilik rekening <span>*</span></label>
                    <div className="control-wrap"><input id="accountName" name="accountName" type="text" placeholder="Sesuai buku rekening" autoComplete="off" value={form.accountName} aria-invalid={touched.accountName && Boolean(errors.accountName)} onChange={(e) => updateField('accountName', e.target.value.toUpperCase())} onBlur={() => markTouched('accountName')} /><FieldCheck show={isValid('accountName')} /></div>
                    <FieldFeedback name="accountName" touched={touched} errors={errors} />
                  </div>
                </div>
              </fieldset>

              {siteKey ? (
                <div className="field field-full" ref={turnstileRef}>
                  <label id="turnstile-label">Verifikasi keamanan <span>*</span></label>
                  <TurnstileWidget
                    key={`${siteKey}-${widgetReset}`}
                    siteKey={siteKey}
                    onVerify={(token) => { setTurnstileToken(token); setWidgetError('') }}
                    onExpire={() => setTurnstileToken('')}
                    onError={(code) => setWidgetError(code || 'render-error')}
                    resetSignal={widgetReset}
                  />
                  {widgetError
                    ? (
                      <div className="turnstile-error">
                        <small className="field-message error-message">Verifikasi gagal sementara (kode: {widgetError}). Biasanya karena jaringan, VPN, atau adblock. Matikan adblock/VPN lalu coba lagi — tidak perlu reload halaman.</small>
                        <button
                          className="secondary-button turnstile-retry"
                          type="button"
                          onClick={() => { setWidgetError(''); setTurnstileToken(''); setWidgetReset((count) => count + 1) }}
                        >
                          Muat ulang verifikasi
                        </button>
                      </div>
                    )
                    : <small className="field-message field-hint">Centang untuk membuktikan kamu bukan bot.</small>}
                </div>
              ) : null}

              <aside className="privacy-disclosure" id="privacy-notice">
                <ShieldIcon />
                <div>
                  <strong>Penggunaan dan penyimpanan data</strong>
                   <p>Data digunakan admin event untuk verifikasi crew dan pembayaran. Setelah dikirim,
                   identitas dan rekening tersimpan terpusat di database serta dapat dilihat atau diekspor oleh admin.
                   Draft di perangkat ini tidak menyimpan nomor rekening, KTP, maupun persetujuan. Hubungi admin event untuk meminta
                   koreksi atau penghapusan data.</p>
                </div>
              </aside>

              <div className={`consent-wrap ${touched.consent && errors.consent ? 'is-invalid' : ''}`}>
                <label className="consent check-control">
                  <input type="checkbox" name="consent" checked={form.consent} aria-invalid={touched.consent && Boolean(errors.consent)} aria-describedby="privacy-notice" onChange={(e) => { updateField('consent', e.target.checked); markTouched('consent') }} />
                  <span className="checkbox-mark" aria-hidden="true">{form.consent && <CheckIcon />}</span>
                  <span>Saya sudah membaca informasi penggunaan data, menyatakan data yang diisi benar, dan menyetujui pemrosesan data untuk pembayaran crew {event?.name || 'Prasasti Crew'}.</span>
                </label>
                <FieldFeedback name="consent" touched={touched} errors={errors} />
              </div>
              <div className="submit-row"><div className="submit-context"><ShieldIcon /><span><strong>Data belum dikirim</strong><small>Kamu masih bisa memeriksa semuanya.</small></span></div><button className="submit-button" type="submit" disabled={sending}>{sending ? 'Mengirim...' : <>Konfirmasi data<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></>}</button></div>
            </form>
          </>
        )}
        <footer><span>© 2026 Prasasti Crew</span><span>Butuh bantuan? <a href="https://wa.me/628998926985" target="_blank" rel="noreferrer">Hubungi Goden</a></span></footer>
      </main>
    </div>
  )
}

export default PublicFormPage
