-- Prasasti Crew: skema awal (events + submissions)
-- Dijalankan via: wrangler d1 migrations apply prasasti-crew-db --remote

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  event_date TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  form_status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  event_slug TEXT NOT NULL DEFAULT '',
  event_name TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  full_name_norm TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  bank TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  account_norm TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_updated_at TEXT NOT NULL DEFAULT '',
  finance_updated_at TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Satu crew (nama + rekening) hanya tercatat sekali per event.
CREATE UNIQUE INDEX IF NOT EXISTS ux_submissions_duplicate
  ON submissions(event_id, full_name_norm, account_norm);

CREATE INDEX IF NOT EXISTS ix_submissions_event ON submissions(event_id);
