# SIMPRO — Sistem Informasi Monitoring Protokoler (v1.0)

Platform internal terpusat untuk koordinasi operasional, manajemen agenda, pembaruan status kegiatan, dan informasi pergerakan **Bupati** serta **Wakil Bupati** dengan dukungan **offline-first (IndexedDB + Service Worker)** dan kontrol akses berbasis peran (**RBAC + RLS**).

> **Catatan Kesiapan Produksi:** Sesuai PRD SIMPRO v1.0, aplikasi ini merupakan fondasi implementasi penuh. Pengoperasian di lingkungan produksi wajib melewati pengujian UAT tiap role, audit keamanan, uji backup/restore, serta pengesahan SOP dan klasifikasi data oleh instansi berwenang.

---

## Arsitektur & Struktur Folder

```text
/
├── .env.example                           # Template konfigurasi environment (tanpa secret)
├── server.ts                              # Entry point server Express + Vite middleware
├── server/
│   ├── db.ts                              # Skema SQLite lokal terisolasi & seed akun uji non-produksi
│   ├── auth.ts                            # Scrypt password hashing, HMAC session cookie, auth middleware
│   ├── rbac.ts                            # Kebijakan otorisasi RBAC otoritatif di backend
│   └── routes.ts                          # REST API (/api/auth, /api/agendas, /api/updates, /api/admin)
├── supabase/
│   └── migrations/
│       └── 001_simpro_v1_schema.sql       # Migrasi PostgreSQL & RLS policy untuk Supabase
├── src/
│   ├── types/simpro.ts                    # Definisi tipe domain, role, status, keputusan Lampiran D
│   ├── lib/
│   │   ├── rbac.ts                        # Helper hak akses sisi klien
│   │   ├── validation.ts                  # Validasi input agenda, pembaruan status, GPS, email
│   │   ├── formatters.ts                  # Pemformat waktu Indonesia, umur data, ekspor CSV BOM
│   │   └── supabaseClient.ts              # Klien Supabase kondisional (hanya anon key publik)
│   ├── services/
│   │   ├── authService.ts                 # Layanan login, logout, sesi, pemulihan kata sandi
│   │   ├── dataService.ts                 # Klien API agenda, riwayat, notifikasi, admin, backup
│   │   ├── offlineDb.ts                   # Penyimpanan lokal IndexedDB (antrean & snapshot cache)
│   │   └── syncService.ts                 # Pengelola antrean offline & sinkronisasi idempoten
│   ├── hooks/                             # useOnlineStatus, usePWAInstall, useSyncQueue
│   ├── components/                        # Layout, LeaderPanel, StatusBadge, ConfirmModal, PWAInstallButton
│   └── pages/                             # Login, Dashboard, Agenda, StatusUpdate, History, Notifications, Reports, Admin
└── tests/
    └── rbac-and-sync.test.ts              # Pengujian terotomasi seluruh 7 role, RBAC negatif, dan sinkronisasi
```

---

## Cara Instalasi & Menjalankan Secara Lokal

1. **Instalasi dependensi**
   ```bash
   npm install
   ```

2. **Konfigurasi Environment**
   Salin `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   - Jika `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` **belum diisi**, aplikasi otomatis berjalan pada **Mode Lokal Terisolasi (SQLite + Express)** dengan penanda jelas di layar login & header, serta menyertakan 7 akun uji internal (non-produksi) untuk menguji seluruh role.
   - Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` dengan prefix `VITE_`.

3. **Menjalankan Mode Development**
   ```bash
   npm run dev
   ```
   Buka `http://localhost:3000`.

4. **Menjalankan Pengujian Role, RBAC, & Deduplikasi Sync**
   ```bash
   npm test
   ```

5. **Build & Menjalankan Mode Production**
   ```bash
   npm run build
   npm start
   ```

---

## Panduan Menghubungkan ke Supabase Production

1. Buat proyek di Supabase.
2. Buka **SQL Editor** di dashboard Supabase, lalu jalankan isi berkas `supabase/migrations/001_simpro_v1_schema.sql`.
   - Migrasi dirancang **non-destruktif** (`CREATE TABLE IF NOT EXISTS` dan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) sehingga aman dijalankan pada proyek yang sudah memiliki tabel awal `profiles`, `agendas`, atau `leader_updates`.
   - Seluruh tabel dilindungi **Row Level Security (RLS)** yang menegakkan batasan antar-role di tingkat database.
3. Buat akun individual pengguna pada Supabase Auth, lalu isi baris padanan pada tabel `public.profiles`.
4. Isi variabel `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` (khusus server) pada environment hosting HTTPS.

---

## Asumsi & Keputusan Sementara (PRD Lampiran D)

Keputusan kebijakan instansi yang belum ditetapkan dalam PRD dikonfigurasi secara aman sebagai nilai sementara dan dapat dilihat/disesuaikan oleh Admin di menu **Pengaturan**:
- **Role Pimpinan/Viewer**: Dinonaktifkan secara default (`viewer_enabled = false`) hingga disetujui instansi.
- **Ambang Kedaluwarsa Data**: 60 menit (dapat disesuaikan Admin).
- **Kanal Notifikasi Eksternal**: Nonaktif pada v1.0; notifikasi berjalan internal di dalam aplikasi.
- **Ekspansi Unit (Sekretaris Daerah & OPD)**: Skema `monitoring_units` sudah disiapkan di database, namun fitur pemantauan unit selain Bupati dan Wakil Bupati tetap dinonaktifkan pada v1.0.
