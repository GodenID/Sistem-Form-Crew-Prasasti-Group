# Prasasti Crew — Backend Cloudflare (Worker + D1)

Frontend (React/Vite) disajikan sebagai static assets oleh Worker yang sama,
sementara `/api/*` dilayani Worker (`worker/index.js`) dengan database D1
`prasasti-crew-db`. Tanpa Worker (mis. `npm run dev`), aplikasi otomatis
fallback ke localStorage.

## Perintah harian

```bash
npm run dev:worker   # jalan lokal: frontend + API + D1 lokal
npm run deploy       # build + deploy production
npm run db:migrate   # apply migrasi ke D1 production
```

## Endpoint API

| Metode | Path | Auth | Fungsi |
|---|---|---|---|
| GET | /api/health | — | cek hidup |
| GET | /api/events | — | daftar event |
| POST | /api/events | admin | buat event |
| PUT | /api/events/:id | admin | edit event |
| DELETE | /api/events/:id | admin | hapus event + datanya |
| GET | /api/events/:id/submissions | — | daftar respon 1 event |
| POST | /api/events/:id/submissions | — | kirim data crew (cek duplikat 409) |
| GET | /api/submissions | admin | semua data crew |
| PUT | /api/submissions/:id | admin | update nominal/status |
| DELETE | /api/submissions/:id | admin | hapus 1 data |
| GET | /api/admin/ping | admin | verifikasi password |

Auth admin = header `Authorization: Bearer <ADMIN_TOKEN>`.

## Ganti password admin

```bash
wrangler secret put ADMIN_TOKEN   # production (prompt aman)
# lalu samakan .dev.vars untuk `wrangler dev` lokal
```

## Anti-bot Turnstile (form publik)

1. Dashboard Cloudflare → Turnstile → Add widget (mode Managed),
   domain: `prasasti-crew-form.ranggadhisesa.workers.dev`.
2. Salin **Site Key** → isi `TURNSTILE_SITE_KEY` di `wrangler.jsonc`, lalu deploy.
3. Salin **Secret Key** → `wrangler secret put TURNSTILE_SECRET_KEY`.
4. Tanpa secret, verifikasi dilewati (mode dev). Tanpa token valid, submit ditolak 403.

## Rollback / log

```bash
wrangler versions list   # daftar versi terdeploy
wrangler rollback        # kembali ke versi sebelumnya
wrangler tail            # lihat log live
wrangler d1 export prasasti-crew-db --remote --output backup.sql
```

## Catatan

- Data lama di localStorage browser TIDAK otomatis pindah ke D1 (remote mulai kosong).
- Edit nominal di tabel admin di-debounce ±800ms sebelum dikirim ke server.
