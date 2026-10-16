const SUBMISSION_STORAGE_KEY = 'prasasti-crew-submissions'

function createSubmissionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `submission-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getSubmissionPosition(submission) {
  if (!submission) return ''
  if (typeof submission.position === 'string' && submission.position.trim()) return submission.position.trim()
  if (Array.isArray(submission.positions) && submission.positions.length) return submission.positions.join(', ')
  return ''
}

export function getSubmissionPositions(submission) {
  if (!submission) return []
  if (Array.isArray(submission.positions) && submission.positions.length) return submission.positions
  const single = getSubmissionPosition(submission)
  return single ? [single] : []
}

export function getSubmissions() {
  try {
    const stored = JSON.parse(localStorage.getItem(SUBMISSION_STORAGE_KEY) || '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((submission) =>
      submission && typeof submission.id === 'string' && typeof submission.eventId === 'string',
    )
  } catch {
    return []
  }
}

export function saveSubmissions(submissions) {
  localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(submissions))
}

export function searchCrewProfiles(submissions, query, limit = 10) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const qNorm = q.toLocaleLowerCase('id-ID')
  const qDigits = String(q).replace(/\D/g, '')
  const safeLimit = Math.min(30, Math.max(5, Number(limit) || 10))
  const seen = new Set()
  const profiles = []
  for (const submission of Array.isArray(submissions) ? submissions : []) {
    if (!submission || typeof submission.fullName !== 'string') continue
    const hay = `${submission.fullName || ''} ${submission.whatsapp || ''} ${submission.bank || ''} ${submission.accountName || ''} ${submission.eventName || ''}`.toLocaleLowerCase('id-ID')
    const hayDigits = String(`${submission.whatsapp || ''} ${submission.accountNumber || ''} ${submission.ktp || ''}`).replace(/\D/g, '')
    if (!hay.includes(qNorm) && !(qDigits.length >= 3 && hayDigits.includes(qDigits))) continue
    const key = String(submission.fullName).trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
    if (!key || seen.has(key)) continue
    seen.add(key)
    profiles.push({
      fullName: submission.fullName,
      whatsapp: submission.whatsapp || '',
      ktp: submission.ktp || '',
      bank: submission.bank || '',
      accountNumber: submission.accountNumber || '',
      accountName: submission.accountName || '',
      lastEventName: submission.eventName || '',
      lastPosition: getSubmissionPosition(submission),
      updatedAt: submission.updatedAt || submission.submittedAt || '',
    })
    if (profiles.length >= safeLimit) break
  }
  return profiles
}

export function findDuplicateSubmission(submissions, eventId, form, currentSubmissionId = null) {
  const normalizedName = form.fullName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
  const normalizedAccount = form.accountNumber.replace(/\D/g, '')
  return submissions.find((submission) => {
    const submissionName = submission.fullName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
    const submissionAccount = submission.accountNumber.replace(/\D/g, '')
    return submission.eventId === eventId
      && submission.id !== currentSubmissionId
      && submissionName === normalizedName
      && submissionAccount === normalizedAccount
  }) || null
}

export function upsertSubmission(submissions, event, form, submissionId = null) {
  const now = new Date().toISOString()
  const existing = submissionId
    ? submissions.find((submission) => submission.id === submissionId)
    : null
  const positionText = typeof form.position === 'string' && form.position.trim()
    ? form.position.trim()
    : Array.isArray(form.positions)
      ? form.positions.join(', ').trim()
      : ''
  const submission = {
    id: existing?.id || createSubmissionId(),
    eventId: event.id,
    eventSlug: event.slug,
    eventName: event.name,
    eventDate: event.eventDate || '',
    location: event.location || '',
    position: positionText,
    positions: positionText ? [positionText] : [],
    fullName: form.fullName.trim(),
    whatsapp: form.whatsapp,
    ktp: typeof form.ktp === 'string' ? form.ktp.replace(/\D/g, '') : '',
    email: typeof form.email === 'string' ? form.email.trim() : '',
    city: typeof form.city === 'string' ? form.city.trim() : '',
    bank: form.bank,
    accountNumber: form.accountNumber,
    accountName: form.accountName.trim(),
    amount: existing?.amount || 0,
    paymentStatus: existing?.paymentStatus === 'paid' ? 'paid' : 'pending',
    paymentUpdatedAt: existing?.paymentUpdatedAt || '',
    submittedAt: existing?.submittedAt || now,
    updatedAt: now,
  }

  const nextSubmissions = existing
    ? submissions.map((item) => item.id === existing.id ? submission : item)
    : [submission, ...submissions]

  return { submission, submissions: nextSubmissions }
}
