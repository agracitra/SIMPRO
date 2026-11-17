export type UserRole =
  | 'admin'
  | 'ajudan_bupati'
  | 'ajudan_wakil_bupati'
  | 'protokol'
  | 'dokumentasi'
  | 'pengamanan'
  | 'pimpinan_viewer';

export type LeaderCode = 'bupati' | 'wakil_bupati';

export type AgendaStatus =
  | 'terjadwal'
  | 'berlangsung'
  | 'selesai'
  | 'berubah'
  | 'ditunda'
  | 'dibatalkan';

export type LeaderAttendance =
  | 'belum_konfirmasi'
  | 'hadir'
  | 'diwakilkan'
  | 'tidak_hadir';

export type SyncStatus =
  | 'Tersimpan di perangkat'
  | 'Menunggu sinkronisasi'
  | 'Berhasil tersinkron'
  | 'Gagal tersinkron';

export interface StatusOption {
  code: string;
  label: string;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  important: boolean;
  active: boolean;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  unit_code?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface AgendaItem {
  id: string;
  leader: LeaderCode;
  title: string;
  starts_at: string;
  location: string;
  pic: string;
  notes: string;
  documentation_notes: string;
  status: AgendaStatus;
  leader_attendance: LeaderAttendance;
  attendance_note: string;
  approved_for_security: boolean;
  created_by: string;
  created_by_name?: string;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendaHistoryItem {
  id: string;
  agenda_id: string;
  agenda_title?: string;
  leader?: LeaderCode;
  changed_by: string;
  changed_by_name?: string;
  change_type: 'dibuat' | 'diubah' | 'dibatalkan' | 'catatan_dokumentasi';
  previous_data: Partial<AgendaItem> | null;
  new_data: Partial<AgendaItem>;
  change_reason: string;
  created_at: string;
}

export interface LeaderUpdateItem {
  id: string;
  leader: LeaderCode;
  previous_status?: string | null;
  status: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  gps_captured_at: string | null;
  note: string;
  approved_for_security: boolean;
  updated_by: string;
  updated_by_name?: string;
  created_at: string;
  client_update_id: string;
  client_created_at: string;
  server_received_at: string | null;
  sync_status: SyncStatus;
}

export interface LiveLocationRecord {
  leader: LeaderCode;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  heading: number | null;
  speed_mps: number | null;
  location_text: string;
  status: string;
  is_live_streaming: boolean;
  is_test_seed?: boolean;
  approved_for_security: boolean;
  updated_by: string | null;
  updated_by_name?: string;
  updated_at: string;
}

export interface OfflineQueuedUpdate {
  client_update_id: string;
  leader: LeaderCode;
  status: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  gps_captured_at: string | null;
  note: string;
  approved_for_security: boolean;
  client_created_at: string;
  server_received_at: string | null;
  sync_status: SyncStatus;
  retry_count: number;
  last_error: string | null;
  author_id: string;
  author_name: string;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  type:
    | 'AGENDA_BARU'
    | 'AGENDA_BERUBAH'
    | 'AGENDA_DIBATALKAN'
    | 'LOKASI_BERUBAH'
    | 'STATUS_PENTING'
    | 'PEMULIHAN_SANDI';
  title: string;
  message: string;
  reference_entity: string;
  reference_id: string;
  status: 'unread' | 'read';
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface AppSettings {
  viewer_enabled: boolean;
  stale_threshold_minutes: number;
  bupati_display_name: string;
  wakil_bupati_display_name: string;
  status_options: StatusOption[];
}

export interface SystemModeInfo {
  mode: 'local_isolated' | 'supabase_connected';
  supabaseConfigured: boolean;
  isNonProductionTestSeed: boolean;
  externalNotificationsConfigured: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin SIMPRO',
  ajudan_bupati: 'Ajudan Bupati',
  ajudan_wakil_bupati: 'Ajudan Wakil Bupati',
  protokol: 'Tim Protokol',
  dokumentasi: 'Tim Dokumentasi',
  pengamanan: 'Tim Pengamanan',
  pimpinan_viewer: 'Pimpinan / Viewer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Mengelola akun, role, konfigurasi, audit log, serta menginput dan mengelola agenda pimpinan.',
  ajudan_bupati: 'Mengirim pembaruan status, lokasi manual, dan catatan khusus Bupati.',
  ajudan_wakil_bupati: 'Mengirim pembaruan status, lokasi manual, dan catatan khusus Wakil Bupati.',
  protokol: 'Memantau agenda pimpinan serta mengedit status kegiatan dan kehadiran pimpinan.',
  dokumentasi: 'Melihat agenda, perubahan jadwal/lokasi, dan mencatat kesiapan dokumentasi.',
  pengamanan: 'Melihat informasi operasional yang telah disetujui untuk tugas pengamanan.',
  pimpinan_viewer: 'Melihat dashboard ringkasan baca-saja apabila diaktifkan oleh Administrator.',
};

export const AGENDA_STATUS_LABELS: Record<AgendaStatus, string> = {
  terjadwal: 'Terjadwal',
  berlangsung: 'Berlangsung',
  selesai: 'Selesai',
  berubah: 'Perubahan Jadwal',
  ditunda: 'Ditunda',
  dibatalkan: 'Dibatalkan',
};

export const LEADER_ATTENDANCE_LABELS: Record<LeaderAttendance, string> = {
  belum_konfirmasi: 'Belum Dikonfirmasi',
  hadir: 'Hadir',
  diwakilkan: 'Diwakilkan',
  tidak_hadir: 'Tidak Hadir',
};

export const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  {code: 'Persiapan', label: 'Persiapan', tone: 'info', important: false, active: true},
  {
    code: 'Perjalanan menuju lokasi',
    label: 'Perjalanan menuju lokasi',
    tone: 'info',
    important: false,
    active: true,
  },
  {code: 'Tiba di lokasi', label: 'Tiba di lokasi', tone: 'success', important: true, active: true},
  {
    code: 'Kegiatan berlangsung',
    label: 'Kegiatan berlangsung',
    tone: 'success',
    important: true,
    active: true,
  },
  {code: 'Kegiatan selesai', label: 'Kegiatan selesai', tone: 'neutral', important: false, active: true},
  {code: 'Kembali', label: 'Kembali', tone: 'neutral', important: false, active: true},
  {code: 'Perubahan rencana', label: 'Perubahan rencana', tone: 'warning', important: true, active: true},
  {code: 'Ditunda', label: 'Ditunda', tone: 'warning', important: true, active: true},
  {code: 'Dibatalkan', label: 'Dibatalkan', tone: 'danger', important: true, active: true},
];

export const PENDING_INSTITUTIONAL_DECISIONS = [
  {
    topic: 'Pemilik Aplikasi',
    question: 'Unit/pejabat penanggung jawab proses dan pemilik resmi aplikasi.',
    temporaryDefault: 'Bagian Protokol & Komunikasi Pimpinan (konfigurasi sementara)',
  },
  {
    topic: 'SOP Status Baku',
    question: 'Daftar status final kegiatan yang disepakati untuk kedua pimpinan.',
    temporaryDefault: '9 status awal PRD v1.0 (dapat disesuaikan Admin)',
  },
  {
    topic: 'Kewenangan Pengesahan Agenda',
    question: 'Pejabat/role pengesah akhir sebelum agenda dikunci.',
    temporaryDefault: 'Role Protokol mencatat & menyimpan dengan log riwayat',
  },
  {
    topic: 'Retensi Data & GPS',
    question: 'Masa simpan koordinat GPS, catatan operasional, dan prosedur penghapusan.',
    temporaryDefault: 'Belum ada penghapusan otomatis; menunggu kebijakan retensi instansi',
  },
  {
    topic: 'Kanal Notifikasi Eksternal',
    question: 'Persetujuan kanal resmi (WhatsApp Gateway/Email/Push) dan daftar penerima.',
    temporaryDefault: 'Notifikasi internal aplikasi saja (kanal eksternal nonaktif)',
  },
  {
    topic: 'Role Pimpinan/Viewer',
    question: 'Apakah akun Pimpinan/Viewer diaktifkan pada peluncuran v1.0.',
    temporaryDefault: 'Dinonaktifkan secara default hingga diaktifkan Administrator',
  },
];
