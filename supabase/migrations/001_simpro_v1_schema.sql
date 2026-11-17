-- ==============================================================================
-- SIMPRO v1.0 — Sistem Informasi Monitoring Protokoler
-- Migration: 001_simpro_v1_schema.sql
-- Deskripsi:
--   Migrasi non-destruktif untuk Supabase / PostgreSQL.
--   Memeriksa keberadaan tabel awal (profiles, agendas, leader_updates)
--   tanpa menghapus atau menimpa data yang sudah ada, serta menambahkan
--   kolom sinkronisasi, riwayat agenda, audit_logs, notifications,
--   app_settings, dan monitoring_units (kesiapan ekspansi multi-unit).
-- ==============================================================================

-- Ekstensi UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. MONITORING UNITS (Arsitektur Ekspansi Multi-Unit Masa Depan)
--    v1.0 hanya mengaktifkan monitoring aktif untuk Bupati & Wakil Bupati.
--    Sekretaris Daerah terdaftar sebagai unit terencana (is_active_v1 = false).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monitoring_units (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('pimpinan', 'sekretariat', 'opd')),
  is_active_v1 BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.monitoring_units (code, display_name, unit_type, is_active_v1, sort_order)
VALUES
  ('bupati', 'Bupati', 'pimpinan', TRUE, 1),
  ('wakil_bupati', 'Wakil Bupati', 'pimpinan', TRUE, 2),
  ('sekretaris_daerah', 'Sekretaris Daerah (Terencana Fase Lanjut)', 'sekretariat', FALSE, 3)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. PROFILES (Akun Individual & Role-Based Access Control)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN (
      'admin',
      'ajudan_bupati',
      'ajudan_wakil_bupati',
      'protokol',
      'dokumentasi',
      'pengamanan',
      'pimpinan_viewer'
    )
  ),
  unit_code TEXT REFERENCES public.monitoring_units(code),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unit_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(is_active);

-- ------------------------------------------------------------------------------
-- 3. APP_SETTINGS (Konfigurasi Sistem oleh Administrator)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (key, value)
VALUES
  ('viewer_enabled', 'false'::jsonb),
  ('stale_threshold_minutes', '60'::jsonb),
  ('bupati_display_name', '"Bupati"'::jsonb),
  ('wakil_bupati_display_name', '"Wakil Bupati"'::jsonb),
  ('status_options', '[
    {"code":"Persiapan","label":"Persiapan","tone":"info","important":false,"active":true},
    {"code":"Perjalanan menuju lokasi","label":"Perjalanan menuju lokasi","tone":"info","important":false,"active":true},
    {"code":"Tiba di lokasi","label":"Tiba di lokasi","tone":"success","important":true,"active":true},
    {"code":"Kegiatan berlangsung","label":"Kegiatan berlangsung","tone":"success","important":true,"active":true},
    {"code":"Kegiatan selesai","label":"Kegiatan selesai","tone":"neutral","important":false,"active":true},
    {"code":"Kembali","label":"Kembali","tone":"neutral","important":false,"active":true},
    {"code":"Perubahan rencana","label":"Perubahan rencana","tone":"warning","important":true,"active":true},
    {"code":"Ditunda","label":"Ditunda","tone":"warning","important":true,"active":true},
    {"code":"Dibatalkan","label":"Dibatalkan","tone":"danger","important":true,"active":true}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. AGENDAS (Manajemen Agenda Terpusat)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader TEXT NOT NULL REFERENCES public.monitoring_units(code),
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  pic TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  documentation_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'terjadwal' CHECK (
    status IN ('terjadwal', 'berlangsung', 'selesai', 'berubah', 'ditunda', 'dibatalkan')
  ),
  leader_attendance TEXT NOT NULL DEFAULT 'belum_konfirmasi' CHECK (
    leader_attendance IN ('belum_konfirmasi', 'hadir', 'diwakilkan', 'tidak_hadir')
  ),
  attendance_note TEXT NOT NULL DEFAULT '',
  approved_for_security BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS pic TEXT NOT NULL DEFAULT '';
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS documentation_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'terjadwal';
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS leader_attendance TEXT NOT NULL DEFAULT 'belum_konfirmasi';
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS attendance_note TEXT NOT NULL DEFAULT '';
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS approved_for_security BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.agendas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_agendas_leader_starts ON public.agendas(leader, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_agendas_status ON public.agendas(status);

-- ------------------------------------------------------------------------------
-- 5. AGENDA_HISTORIES (Jejak Perubahan Agenda Tak Terubah)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id UUID NOT NULL REFERENCES public.agendas(id) ON DELETE RESTRICT,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('dibuat', 'diubah', 'dibatalkan', 'catatan_dokumentasi')),
  previous_data JSONB,
  new_data JSONB NOT NULL,
  change_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_histories_agenda ON public.agenda_histories(agenda_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 6. LEADER_UPDATES (Pembaruan Status & GPS Manual + Metadata Sinkronisasi)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leader_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader TEXT NOT NULL REFERENCES public.monitoring_units(code),
  previous_status TEXT,
  status TEXT NOT NULL,
  location_text TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  gps_captured_at TIMESTAMPTZ,
  note TEXT NOT NULL DEFAULT '',
  approved_for_security BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_update_id UUID UNIQUE NOT NULL,
  client_created_at TIMESTAMPTZ NOT NULL,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status TEXT NOT NULL DEFAULT 'Berhasil tersinkron' CHECK (
    sync_status IN (
      'Tersimpan di perangkat',
      'Menunggu sinkronisasi',
      'Berhasil tersinkron',
      'Gagal tersinkron'
    )
  )
);

ALTER TABLE public.leader_updates ADD COLUMN IF NOT EXISTS previous_status TEXT;
ALTER TABLE public.leader_updates ADD COLUMN IF NOT EXISTS gps_captured_at TIMESTAMPTZ;
ALTER TABLE public.leader_updates ADD COLUMN IF NOT EXISTS approved_for_security BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.leader_updates ADD COLUMN IF NOT EXISTS client_update_id UUID;
ALTER TABLE public.leader_updates ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;
ALTER TABLE public.leader_updates ADD COLUMN IF NOT EXISTS server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.leader_updates ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'Berhasil tersinkron';

CREATE UNIQUE INDEX IF NOT EXISTS idx_leader_updates_client_id ON public.leader_updates(client_update_id);
CREATE INDEX IF NOT EXISTS idx_leader_updates_leader_created ON public.leader_updates(leader, server_received_at DESC);

-- ------------------------------------------------------------------------------
-- 7. AUDIT_LOGS (Audit Aksi Sensitif & Penolakan Akses — Append-Only)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);

-- ------------------------------------------------------------------------------
-- 8. NOTIFICATIONS (Notifikasi Internal Aplikasi Berbasis Kewenangan)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('AGENDA_BARU', 'AGENDA_BERUBAH', 'AGENDA_DIBATALKAN', 'LOKASI_BERUBAH', 'STATUS_PENTING', 'PEMULIHAN_SANDI')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_entity TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, status, created_at DESC);

-- ==============================================================================
-- FUNGSI HELPER OTORISASI RLS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_user_active()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE);
$$;

CREATE OR REPLACE FUNCTION public.is_viewer_enabled()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (value)::boolean FROM public.app_settings WHERE key = 'viewer_enabled'), FALSE);
$$;

-- Trigger: Mencegah pengguna biasa mengubah role atau status aktif diri sendiri
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Pengguna tidak diperbolehkan mengubah role atau status aktif milik sendiri.';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_privilege_escalation();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.monitoring_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- MONITORING UNITS
DROP POLICY IF EXISTS "units_read_active" ON public.monitoring_units;
CREATE POLICY "units_read_active" ON public.monitoring_units
  FOR SELECT USING (public.is_user_active());

-- PROFILES
DROP POLICY IF EXISTS "profiles_read_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_read_own_or_admin" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.current_user_role() IN ('admin', 'protokol', 'ajudan_bupati', 'ajudan_wakil_bupati')
  );

DROP POLICY IF EXISTS "profiles_admin_insert" ON public.profiles;
CREATE POLICY "profiles_admin_insert" ON public.profiles
  FOR INSERT WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE USING (public.current_user_role() = 'admin');

-- APP SETTINGS
DROP POLICY IF EXISTS "settings_read_active" ON public.app_settings;
CREATE POLICY "settings_read_active" ON public.app_settings
  FOR SELECT USING (public.is_user_active());

DROP POLICY IF EXISTS "settings_admin_write" ON public.app_settings;
CREATE POLICY "settings_admin_write" ON public.app_settings
  FOR ALL USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- AGENDAS
DROP POLICY IF EXISTS "agendas_select_by_role" ON public.agendas;
CREATE POLICY "agendas_select_by_role" ON public.agendas
  FOR SELECT USING (
    public.current_user_role() IN ('admin', 'protokol', 'dokumentasi', 'ajudan_bupati', 'ajudan_wakil_bupati')
    OR (public.current_user_role() = 'pengamanan' AND approved_for_security = TRUE)
    OR (public.current_user_role() = 'pimpinan_viewer' AND public.is_viewer_enabled())
  );

DROP POLICY IF EXISTS "agendas_insert_protokol" ON public.agendas;
DROP POLICY IF EXISTS "agendas_insert_admin" ON public.agendas;
CREATE POLICY "agendas_insert_admin" ON public.agendas
  FOR INSERT WITH CHECK (
    public.current_user_role() = 'admin'
    AND leader IN ('bupati', 'wakil_bupati')
  );

DROP POLICY IF EXISTS "agendas_update_protokol" ON public.agendas;
DROP POLICY IF EXISTS "agendas_update_admin_or_protokol" ON public.agendas;
CREATE POLICY "agendas_update_admin_or_protokol" ON public.agendas
  FOR UPDATE USING (public.current_user_role() IN ('admin', 'protokol'))
  WITH CHECK (public.current_user_role() IN ('admin', 'protokol'));

DROP POLICY IF EXISTS "agendas_delete_admin" ON public.agendas;
CREATE POLICY "agendas_delete_admin" ON public.agendas
  FOR DELETE USING (public.current_user_role() = 'admin');

-- AGENDA HISTORIES (Append-Only)
DROP POLICY IF EXISTS "agenda_histories_select" ON public.agenda_histories;
CREATE POLICY "agenda_histories_select" ON public.agenda_histories
  FOR SELECT USING (
    public.current_user_role() IN ('admin', 'protokol', 'dokumentasi', 'ajudan_bupati', 'ajudan_wakil_bupati')
  );

DROP POLICY IF EXISTS "agenda_histories_insert" ON public.agenda_histories;
CREATE POLICY "agenda_histories_insert" ON public.agenda_histories
  FOR INSERT WITH CHECK (
    public.current_user_role() IN ('admin', 'protokol', 'dokumentasi')
    AND changed_by = auth.uid()
  );

-- LEADER UPDATES (Append-Only + Ajudan Restricted by Leader Assignment)
DROP POLICY IF EXISTS "updates_select_by_role" ON public.leader_updates;
CREATE POLICY "updates_select_by_role" ON public.leader_updates
  FOR SELECT USING (
    public.current_user_role() IN ('admin', 'protokol', 'dokumentasi', 'ajudan_bupati', 'ajudan_wakil_bupati')
    OR (public.current_user_role() = 'pengamanan' AND approved_for_security = TRUE)
    OR (public.current_user_role() = 'pimpinan_viewer' AND public.is_viewer_enabled())
  );

DROP POLICY IF EXISTS "updates_insert_ajudan_only" ON public.leader_updates;
CREATE POLICY "updates_insert_ajudan_only" ON public.leader_updates
  FOR INSERT WITH CHECK (
    updated_by = auth.uid()
    AND (
      (public.current_user_role() = 'ajudan_bupati' AND leader = 'bupati')
      OR
      (public.current_user_role() = 'ajudan_wakil_bupati' AND leader = 'wakil_bupati')
    )
  );

-- AUDIT LOGS (Append-Only, Read Only by Admin)
DROP POLICY IF EXISTS "audit_admin_select" ON public.audit_logs;
CREATE POLICY "audit_admin_select" ON public.audit_logs
  FOR SELECT USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "audit_authenticated_insert" ON public.audit_logs;
CREATE POLICY "audit_authenticated_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (public.is_user_active());

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid() AND public.is_user_active());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid() AND public.is_user_active());
