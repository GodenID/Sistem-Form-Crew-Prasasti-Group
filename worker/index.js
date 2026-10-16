// Prasasti Crew API — Cloudflare Worker + D1.
// Melayani /api/* ; request lain diteruskan ke static assets (lihat wrangler.jsonc).

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const DUPLICATE_MESSAGE = 'Nama lengkap dan nomor rekening tersebut sudah tercatat pada event ini. Satu crew hanya dapat mengirim satu data untuk kombinasi tersebut.'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function slugifyEventName(value) {
  const text = String(value || '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/&/g, ' dan ')
    .replace(/[^\u0061-\u007a\u0030-\u0039]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return text
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeWhatsapp(value) {
  let digits = digitsOnly(value)
  if (digits.startsWith('62')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

function timingSafeEqual(a, b) {
  const encoder = new TextEncoder()
  const left = encoder.encode(String(a || ''))
  const right = encoder.encode(String(b || ''))
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
  return diff === 0
}

function unauthorized(request, env) {
  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const expected = env.ADMIN_TOKEN || ''
  if (!expected || !token || !timingSafeEqual(token, expected)) {
    return json({ message: 'Akses admin ditolak. Masuk ulang sebagai admin.' }, 401)
  }
  return null
}

async function readJson(request) {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : null
  } catch {
    return null
  }
}

// Verifikasi token Turnstile ke Cloudflare. Bila secret belum dikonfigurasi
// (mis. dev lokal tanpa kunci), verifikasi dilewati agar alur tetap jalan.
async function verifyTurnstile(token, env, request) {
  const secret = env.TURNSTILE_SECRET_KEY || ''
  if (!secret) return { ok: true, skipped: true }
  if (!token || typeof token !== 'string') return { ok: false }
  try {
    const ip = request.headers.get('cf-connecting-ip') || ''
    const payload = new URLSearchParams()
    payload.append('secret', secret)
    payload.append('response', token)
    if (ip) payload.append('remoteip', ip)
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: payload,
    })
    const data = await response.json().catch(() => null)
    return data && data.success === true ? { ok: true } : { ok: false }
  } catch {
    return { ok: false }
  }
}

function validateEventInput(body) {
  if (!body || String(body.name || '').trim().length < 2) return 'Nama event minimal 2 karakter.'
  if (!body.eventDate) return 'Tanggal event wajib diisi.'
  if (String(body.location || '').trim().length < 2) return 'Lokasi event wajib diisi.'
  if (!slugifyEventName(body.slug || body.name)) return 'Slug tautan wajib diisi.'
  return null
}

function validateSubmissionInput(form) {
  if (!form || !form.position || String(form.position).trim().length < 2) return 'Masukkan posisi / peran saat event.'
  if (String(form.fullName || '').trim().split(/\s+/).length < 2) return 'Masukkan nama lengkap, minimal dua kata.'
  const digits = normalizeWhatsapp(form.whatsapp)
  if (digits.length < 9 || digits.length > 13) return 'Masukkan 9–13 digit nomor WhatsApp.'
  if (!form.bank || !String(form.bank).trim()) return 'Pilih bank atau layanan dari daftar.'
  if (digitsOnly(form.accountNumber).length < 6) return 'Nomor rekening minimal 6 digit.'
  if (digitsOnly(form.ktp).length !== 16) return 'Nomor KTP harus 16 digit.'
  if (String(form.accountName || '').trim().split(/\s+/).length < 2) return 'Masukkan nama pemilik sesuai rekening.'
  return null
}

function mapEvent(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    eventDate: row.event_date || '',
    location: row.location || '',
    formStatus: row.form_status === 'closed' ? 'closed' : 'open',
    positions: [],
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

function mapSubmission(row) {
  const position = row.position || ''
  return {
    id: row.id,
    eventId: row.event_id,
    eventSlug: row.event_slug || '',
    eventName: row.event_name || '',
    eventDate: row.event_date || '',
    location: row.location || '',
    position,
    positions: position ? [position] : [],
    fullName: row.full_name || '',
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    city: row.city || '',
    bank: row.bank || '',
    accountNumber: row.account_number || '',
    accountName: row.account_name || '',
    ktp: row.ktp || '',
    amount: Number(row.amount) || 0,
    paymentStatus: row.payment_status === 'paid' ? 'paid' : 'pending',
    paymentUpdatedAt: row.payment_updated_at || '',
    financeUpdatedAt: row.finance_updated_at || '',
    submittedAt: row.submitted_at || '',
    updatedAt: row.updated_at || '',
  }
}

function submissionColumns() {
  return 'id, event_id, event_slug, event_name, event_date, location, position, full_name, full_name_norm, whatsapp, email, city, bank, account_number, account_norm, account_name, ktp, amount, payment_status, payment_updated_at, finance_updated_at, submitted_at, updated_at'
}

function submissionValues(event, form, ids) {
  return [
    ids.id,
    event.id,
    event.slug,
    event.name,
    event.event_date || '',
    event.location || '',
    String(form.position).trim(),
    String(form.fullName).trim(),
    normalizeName(form.fullName),
    form.whatsapp,
    typeof form.email === 'string' ? form.email.trim() : '',
    typeof form.city === 'string' ? form.city.trim() : '',
    form.bank,
    form.accountNumber,
    digitsOnly(form.accountNumber),
    String(form.accountName).trim(),
    digitsOnly(form.ktp),
    Number(form.amount) || 0,
    form.paymentStatus === 'paid' ? 'paid' : 'pending',
    form.paymentUpdatedAt || '',
    form.financeUpdatedAt || '',
    ids.submittedAt,
    ids.updatedAt,
  ]
}

async function uniqueSlug(db, value, excludeId) {
  const base = slugifyEventName(value) || 'event'
  const rows = await db.prepare('SELECT id, slug FROM events').all()
  const used = new Set((rows.results || []).filter((row) => row.id !== excludeId).map((row) => row.slug))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

async function getEventById(db, id) {
  return db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
}

async function handleCreateSubmission(db, env, request, eventRow, form, submissionId) {
  const invalid = validateSubmissionInput(form)
  if (invalid) return { error: json({ message: invalid }, 400) }
  if (eventRow.form_status === 'closed') {
    return { error: json({ message: 'Formulir event sudah ditutup oleh admin. Data tidak dikirim.' }, 403) }
  }
  const nameNorm = normalizeName(form.fullName)
  const accountNorm = digitsOnly(form.accountNumber)
  const duplicate = await db
    .prepare('SELECT id FROM submissions WHERE event_id = ? AND full_name_norm = ? AND account_norm = ? AND id != ?')
    .bind(eventRow.id, nameNorm, accountNorm, submissionId || '')
    .first()
  if (duplicate) return { error: json({ message: DUPLICATE_MESSAGE }, 409) }
  const human = await verifyTurnstile(form.turnstileToken, env, request)
  if (!human.ok) {
    return { error: json({ message: 'Verifikasi keamanan gagal atau kedaluwarsa. Muat ulang halaman lalu coba lagi.' }, 403) }
  }

  const now = new Date().toISOString()
  if (submissionId) {
    const existing = await db.prepare('SELECT * FROM submissions WHERE id = ?').bind(submissionId).first()
    if (existing && existing.event_id === eventRow.id) {
      const ids = { id: existing.id, submittedAt: existing.submitted_at, updatedAt: now }
      const values = submissionValues(
        eventRow,
        { ...form, amount: existing.amount, paymentStatus: existing.payment_status, paymentUpdatedAt: existing.payment_updated_at, financeUpdatedAt: existing.finance_updated_at },
        ids,
      )
      await db
        .prepare(`UPDATE submissions SET event_id = ?, event_slug = ?, event_name = ?, event_date = ?, location = ?, position = ?, full_name = ?, full_name_norm = ?, whatsapp = ?, email = ?, city = ?, bank = ?, account_number = ?, account_norm = ?, account_name = ?, ktp = ?, amount = ?, payment_status = ?, payment_updated_at = ?, finance_updated_at = ?, submitted_at = ?, updated_at = ? WHERE id = ?`)
        .bind(...values, existing.id)
        .run()
      const updated = await db.prepare(`SELECT ${submissionColumns()} FROM submissions WHERE id = ?`).bind(existing.id).first()
      return { submission: mapSubmission(updated) }
    }
  }

  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `submission-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const ids = { id, submittedAt: now, updatedAt: now }
  try {
    const values = submissionValues(eventRow, form, ids)
    const placeholders = values.map(() => '?').join(', ')
    await db
      .prepare(`INSERT INTO submissions (${submissionColumns()}) VALUES (${placeholders})`)
      .bind(...values)
      .run()
  } catch (error) {
    if (String(error && error.message).includes('UNIQUE')) return { error: json({ message: DUPLICATE_MESSAGE }, 409) }
    throw error
  }
  const created = await db.prepare(`SELECT ${submissionColumns()} FROM submissions WHERE id = ?`).bind(id).first()
  return { submission: mapSubmission(created) }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const { pathname } = url
    const method = request.method.toUpperCase()

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }

    const db = env.DB
    if (!db) return json({ message: 'Database belum dikonfigurasi di Worker.' }, 500)

    try {
      const parts = pathname.split('/').filter(Boolean)

      if (pathname === '/api/health' && method === 'GET') {
        return json({ ok: true, time: new Date().toISOString() })
      }

      if (pathname === '/api/admin/ping' && method === 'GET') {
        const err = unauthorized(request, env)
        if (err) return err
        return json({ ok: true })
      }

      // GET /api/turnstile/config (publik: site key untuk widget)
      if (pathname === '/api/turnstile/config' && method === 'GET') {
        return json({ siteKey: env.TURNSTILE_SITE_KEY || '' })
      }

      // GET /api/events (publik: daftar event)
      if (parts.length === 2 && parts[1] === 'events' && method === 'GET') {
        const rows = await db.prepare('SELECT * FROM events ORDER BY created_at DESC').all()
        return json((rows.results || []).map(mapEvent))
      }

      // POST /api/events (admin: buat event)
      if (parts.length === 2 && parts[1] === 'events' && method === 'POST') {
        const err = unauthorized(request, env)
        if (err) return err
        const body = await readJson(request)
        const invalid = validateEventInput(body || {})
        if (invalid) return json({ message: invalid }, 400)
        const now = new Date().toISOString()
        const id = body.id && typeof body.id === 'string' ? body.id : crypto.randomUUID()
        const slug = await uniqueSlug(db, body.slug || body.name, id)
        await db
          .prepare('INSERT INTO events (id, name, slug, event_date, location, form_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, String(body.name).trim(), slug, body.eventDate || '', String(body.location || '').trim(), body.formStatus === 'closed' ? 'closed' : 'open', body.createdAt || now, body.updatedAt || now)
          .run()
        const created = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
        return json(mapEvent(created), 201)
      }

      // PUT / DELETE /api/events/:id (admin)
      if (parts.length === 3 && parts[1] === 'events') {
        const err = unauthorized(request, env)
        if (err) return err
        const eventRow = await getEventById(db, parts[2])
        if (!eventRow) return json({ message: 'Event tidak ditemukan.' }, 404)
        if (method === 'PUT') {
          const body = await readJson(request)
          const merged = {
            name: body.name !== undefined ? body.name : eventRow.name,
            eventDate: body.eventDate !== undefined ? body.eventDate : eventRow.event_date,
            location: body.location !== undefined ? body.location : eventRow.location,
            slug: body.slug !== undefined ? body.slug : eventRow.slug,
            formStatus: body.formStatus !== undefined ? body.formStatus : eventRow.form_status,
          }
          const invalid = validateEventInput(merged)
          if (invalid) return json({ message: invalid }, 400)
          const slug = await uniqueSlug(db, merged.slug || merged.name, eventRow.id)
          const now = new Date().toISOString()
          await db
            .prepare('UPDATE events SET name = ?, slug = ?, event_date = ?, location = ?, form_status = ?, updated_at = ? WHERE id = ?')
            .bind(String(merged.name).trim(), slug, merged.eventDate || '', String(merged.location || '').trim(), merged.formStatus === 'closed' ? 'closed' : 'open', now, eventRow.id)
            .run()
          const updated = await getEventById(db, eventRow.id)
          return json(mapEvent(updated))
        }
        if (method === 'DELETE') {
          await db.batch([
            db.prepare('DELETE FROM submissions WHERE event_id = ?').bind(eventRow.id),
            db.prepare('DELETE FROM events WHERE id = ?').bind(eventRow.id),
          ])
          return json({ ok: true })
        }
        return json({ message: 'Metode tidak didukung.' }, 405)
      }

      // GET / POST /api/events/:id/submissions (publik per event)
      if (parts.length === 4 && parts[1] === 'events' && parts[3] === 'submissions') {
        const eventRow = await getEventById(db, parts[2])
        if (!eventRow) return json({ message: 'Event tidak ditemukan.' }, 404)
        if (method === 'GET') {
          const rows = await db
            .prepare(`SELECT ${submissionColumns()} FROM submissions WHERE event_id = ? ORDER BY submitted_at DESC`)
            .bind(eventRow.id)
            .all()
          return json((rows.results || []).map(mapSubmission))
        }
        if (method === 'POST') {
          const form = await readJson(request)
          if (!form) return json({ message: 'Body JSON tidak valid.' }, 400)
          const result = await handleCreateSubmission(db, env, request, eventRow, form, typeof form.submissionId === 'string' ? form.submissionId : null)
          if (result.error) return result.error
          return json(result.submission, 201)
        }
        return json({ message: 'Metode tidak didukung.' }, 405)
      }

      // GET /api/crew?q=&limit= (publik: direktori crew lintas event untuk autofill).
      // Mengembalikan profil unik per nama (data terbaru), tanpa auth — sama
      // terbukanya dengan halaman respon publik.
      if (parts.length === 2 && parts[1] === 'crew' && method === 'GET') {
        const q = String(url.searchParams.get('q') || '').trim()
        const limitRaw = Number(url.searchParams.get('limit') || '10')
        const limit = Math.min(30, Math.max(5, Number.isFinite(limitRaw) ? limitRaw : 10))
        if (q.length < 2) return json([])
        const qNorm = q.toLocaleLowerCase('id-ID')
        const qDigits = digitsOnly(q)
        const rows = await db
          .prepare(`SELECT ${submissionColumns()} FROM submissions ORDER BY updated_at DESC LIMIT 500`)
          .all()
        const seen = new Set()
        const profiles = []
        for (const row of rows.results || []) {
          const hay = `${row.full_name || ''} ${row.whatsapp || ''} ${row.bank || ''} ${row.account_name || ''} ${row.event_name || ''}`.toLocaleLowerCase('id-ID')
          const hayDigits = digitsOnly(`${row.whatsapp || ''} ${row.account_number || ''} ${row.ktp || ''}`)
          const textMatch = hay.includes(qNorm)
          const digitMatch = qDigits.length >= 3 && hayDigits.includes(qDigits)
          if (!textMatch && !digitMatch) continue
          const key = row.full_name_norm || normalizeName(row.full_name)
          if (!key || seen.has(key)) continue
          seen.add(key)
          const mapped = mapSubmission(row)
          profiles.push({
            fullName: mapped.fullName,
            whatsapp: mapped.whatsapp,
            ktp: mapped.ktp,
            bank: mapped.bank,
            accountNumber: mapped.accountNumber,
            accountName: mapped.accountName,
            lastEventName: mapped.eventName,
            lastPosition: mapped.position,
            updatedAt: mapped.updatedAt,
          })
          if (profiles.length >= limit) break
        }
        return json(profiles)
      }

      // GET /api/submissions (admin: semua data, opsional ?eventId=)
      if (parts.length === 2 && parts[1] === 'submissions' && method === 'GET') {
        const err = unauthorized(request, env)
        if (err) return err
        const eventId = url.searchParams.get('eventId')
        const rows = eventId
          ? await db.prepare(`SELECT ${submissionColumns()} FROM submissions WHERE event_id = ? ORDER BY submitted_at DESC`).bind(eventId).all()
          : await db.prepare(`SELECT ${submissionColumns()} FROM submissions ORDER BY submitted_at DESC`).all()
        return json((rows.results || []).map(mapSubmission))
      }

      // PUT / DELETE /api/submissions/:id (admin)
      if (parts.length === 3 && parts[1] === 'submissions') {
        const err = unauthorized(request, env)
        if (err) return err
        const existing = await db.prepare(`SELECT ${submissionColumns()} FROM submissions WHERE id = ?`).bind(parts[2]).first()
        if (!existing) return json({ message: 'Data crew tidak ditemukan.' }, 404)
        if (method === 'PUT') {
          const body = await readJson(request)
          if (!body) return json({ message: 'Body JSON tidak valid.' }, 400)
          const amount = body.amount === undefined ? existing.amount : Number(String(body.amount).replace(/\D/g, '')) || 0
          const paymentStatus = body.paymentStatus === 'paid' || existing.payment_status === 'paid' ? 'paid' : 'pending'
          const now = new Date().toISOString()
          await db
            .prepare('UPDATE submissions SET position = ?, full_name = ?, full_name_norm = ?, whatsapp = ?, email = ?, city = ?, bank = ?, account_number = ?, account_norm = ?, account_name = ?, ktp = ?, amount = ?, payment_status = ?, payment_updated_at = ?, finance_updated_at = ?, updated_at = ? WHERE id = ?')
            .bind(
              body.position !== undefined ? String(body.position) : existing.position,
              body.fullName !== undefined ? String(body.fullName) : existing.full_name,
              normalizeName(body.fullName !== undefined ? body.fullName : existing.full_name),
              body.whatsapp !== undefined ? body.whatsapp : existing.whatsapp,
              body.email !== undefined ? String(body.email) : existing.email,
              body.city !== undefined ? String(body.city) : existing.city,
              body.bank !== undefined ? body.bank : existing.bank,
              body.accountNumber !== undefined ? body.accountNumber : existing.account_number,
              digitsOnly(body.accountNumber !== undefined ? body.accountNumber : existing.account_number),
              body.accountName !== undefined ? String(body.accountName) : existing.account_name,
              digitsOnly(body.ktp !== undefined ? body.ktp : existing.ktp),
              amount,
              body.paymentStatus !== undefined ? (body.paymentStatus === 'paid' ? 'paid' : 'pending') : paymentStatus,
              body.paymentUpdatedAt !== undefined ? body.paymentUpdatedAt : existing.payment_updated_at,
              body.financeUpdatedAt !== undefined ? body.financeUpdatedAt : (body.finance_updated_at !== undefined ? body.finance_updated_at : existing.finance_updated_at),
              now,
              existing.id,
            )
            .run()
          const updated = await db.prepare(`SELECT ${submissionColumns()} FROM submissions WHERE id = ?`).bind(existing.id).first()
          return json(mapSubmission(updated))
        }
        if (method === 'DELETE') {
          await db.prepare('DELETE FROM submissions WHERE id = ?').bind(existing.id).run()
          return json({ ok: true })
        }
        return json({ message: 'Metode tidak didukung.' }, 405)
      }

      return json({ message: 'Endpoint tidak ditemukan.' }, 404)
    } catch (error) {
      return json({ message: 'Terjadi gangguan pada server. Coba kembali beberapa saat lagi.' }, 500)
    }
  },
}
