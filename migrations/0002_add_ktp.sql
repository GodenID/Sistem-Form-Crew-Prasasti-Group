-- Tambah kolom NIK/KTP pada submissions.
-- Dijalankan via: wrangler d1 migrations apply prasasti-crew-db --remote

ALTER TABLE submissions ADD COLUMN ktp TEXT NOT NULL DEFAULT '';
