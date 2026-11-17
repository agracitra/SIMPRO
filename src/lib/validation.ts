import type {AgendaStatus, LeaderAttendance, LeaderCode, UserRole} from '../types/simpro.ts';

const VALID_ROLES: UserRole[] = [
  'admin',
  'ajudan_bupati',
  'ajudan_wakil_bupati',
  'protokol',
  'dokumentasi',
  'pengamanan',
  'pimpinan_viewer',
];

const VALID_LEADERS: LeaderCode[] = ['bupati', 'wakil_bupati'];

const VALID_AGENDA_STATUSES: AgendaStatus[] = [
  'terjadwal',
  'berlangsung',
  'selesai',
  'berubah',
  'ditunda',
  'dibatalkan',
];

const VALID_LEADER_ATTENDANCES: LeaderAttendance[] = [
  'belum_konfirmasi',
  'hadir',
  'diwakilkan',
  'tidak_hadir',
];

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

export function isValidLeader(leader: string): leader is LeaderCode {
  return VALID_LEADERS.includes(leader as LeaderCode);
}

export function isValidAgendaStatus(status: string): status is AgendaStatus {
  return VALID_AGENDA_STATUSES.includes(status as AgendaStatus);
}

export function isValidLeaderAttendance(attendance: string): attendance is LeaderAttendance {
  return VALID_LEADER_ATTENDANCES.includes(attendance as LeaderAttendance);
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

export function validateAgendaInput(input: {
  leader?: string;
  title?: string;
  starts_at?: string;
  location?: string;
  status?: string;
  leader_attendance?: string;
}): string | null {
  if (!input.leader || !isValidLeader(input.leader)) {
    return 'Pimpinan harus dipilih (Bupati atau Wakil Bupati).';
  }
  if (!input.title || input.title.trim().length < 3 || input.title.trim().length > 200) {
    return 'Judul kegiatan wajib diisi (3–200 karakter).';
  }
  if (!input.starts_at || Number.isNaN(Date.parse(input.starts_at))) {
    return 'Tanggal dan waktu mulai kegiatan tidak valid.';
  }
  if (!input.location || input.location.trim().length < 2 || input.location.trim().length > 250) {
    return 'Lokasi kegiatan wajib diisi (2–250 karakter).';
  }
  if (input.status && !isValidAgendaStatus(input.status)) {
    return 'Status agenda tidak valid.';
  }
  if (input.leader_attendance && !isValidLeaderAttendance(input.leader_attendance)) {
    return 'Status kehadiran pimpinan tidak valid.';
  }
  return null;
}

export function validateStatusUpdateInput(input: {
  leader?: string;
  status?: string;
  location_text?: string;
  client_update_id?: string;
  client_created_at?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
}): string | null {
  if (!input.leader || !isValidLeader(input.leader)) {
    return 'Pimpinan tidak valid.';
  }
  if (!input.status || input.status.trim().length < 2 || input.status.trim().length > 100) {
    return 'Status kegiatan wajib dipilih.';
  }
  if (
    !input.location_text ||
    input.location_text.trim().length < 2 ||
    input.location_text.trim().length > 250
  ) {
    return 'Lokasi dalam bentuk teks wajib diisi (minimal 2 karakter).';
  }
  if (!input.client_update_id || input.client_update_id.trim().length < 8) {
    return 'ID unik pembaruan (client_update_id) tidak valid.';
  }
  if (!input.client_created_at || Number.isNaN(Date.parse(input.client_created_at))) {
    return 'Waktu pembuatan lokal (client_created_at) tidak valid.';
  }
  if (
    input.latitude !== null &&
    input.latitude !== undefined &&
    (typeof input.latitude !== 'number' || input.latitude < -90 || input.latitude > 90)
  ) {
    return 'Koordinat latitude GPS tidak valid.';
  }
  if (
    input.longitude !== null &&
    input.longitude !== undefined &&
    (typeof input.longitude !== 'number' || input.longitude < -180 || input.longitude > 180)
  ) {
    return 'Koordinat longitude GPS tidak valid.';
  }
  if (
    input.accuracy_m !== null &&
    input.accuracy_m !== undefined &&
    (typeof input.accuracy_m !== 'number' || input.accuracy_m < 0)
  ) {
    return 'Akurasi GPS tidak valid.';
  }
  return null;
}
