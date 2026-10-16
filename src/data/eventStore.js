const EVENT_STORAGE_KEY = 'prasasti-crew-events'

export function slugifyEventName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function getEvents() {
  try {
    const stored = JSON.parse(localStorage.getItem(EVENT_STORAGE_KEY) || '[]')
    if (!Array.isArray(stored)) return []
    return stored
      .filter((event) =>
        event && typeof event.name === 'string' && typeof event.slug === 'string',
      )
      .map((event) => ({
        ...event,
        positions: Array.isArray(event.positions) ? event.positions : [],
        formStatus: event.formStatus === 'closed' ? 'closed' : 'open',
      }))
  } catch {
    return []
  }
}

export function saveEvents(events) {
  localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events))
}

export function createEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getUniqueSlug(value, events, currentId = null) {
  const base = slugifyEventName(value) || 'event'
  const used = new Set(events.filter((event) => event.id !== currentId).map((event) => event.slug))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}
