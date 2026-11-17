import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  PauseCircle,
  UserCheck,
  UserMinus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  AGENDA_STATUS_LABELS,
  LEADER_ATTENDANCE_LABELS,
  type AgendaStatus,
  type LeaderAttendance,
  type StatusOption,
  type SyncStatus,
} from '../types/simpro.ts';

type Tone = 'info' | 'success' | 'warning' | 'orange' | 'danger' | 'indigo' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  info: 'border-sky-300 bg-sky-100/85 text-sky-950',
  success: 'border-emerald-300 bg-emerald-100/85 text-emerald-950',
  warning: 'border-amber-300 bg-amber-100/90 text-amber-950',
  orange: 'border-orange-300 bg-orange-100/85 text-orange-950',
  danger: 'border-rose-300 bg-rose-100/85 text-rose-950',
  indigo: 'border-indigo-300 bg-indigo-100/80 text-indigo-950',
  neutral: 'border-slate-300 bg-slate-100 text-slate-800',
};

function renderToneIcon(tone: Tone) {
  switch (tone) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />;
    case 'warning':
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />;
    case 'orange':
      return <PauseCircle className="h-3.5 w-3.5 shrink-0 text-orange-700" aria-hidden="true" />;
    case 'danger':
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-700" aria-hidden="true" />;
    case 'indigo':
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-indigo-700" aria-hidden="true" />;
    case 'info':
      return <Info className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden="true" />;
    default:
      return <Clock className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden="true" />;
  }
}

export const LeaderStatusLabel: React.FC<{
  status: string;
  options?: StatusOption[];
}> = ({status, options}) => {
  const matched = options?.find((o) => o.code === status || o.label === status);
  let tone: Tone = matched?.tone || 'neutral';
  if (!matched) {
    const lower = status.toLowerCase();
    if (lower.includes('berlangsung') || lower.includes('tiba')) tone = 'success';
    else if (lower.includes('perjalanan') || lower.includes('persiapan')) tone = 'info';
    else if (lower.includes('tunda')) tone = 'orange';
    else if (lower.includes('perubahan')) tone = 'warning';
    else if (lower.includes('selesai')) tone = 'indigo';
    else if (lower.includes('batal')) tone = 'danger';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {renderToneIcon(tone)}
      <span>{status}</span>
    </span>
  );
};

export const AgendaStatusLabel: React.FC<{status: AgendaStatus}> = ({status}) => {
  const toneMap: Record<AgendaStatus, Tone> = {
    terjadwal: 'info',
    berlangsung: 'success',
    selesai: 'indigo',
    berubah: 'warning',
    ditunda: 'orange',
    dibatalkan: 'danger',
  };
  const tone = toneMap[status] || 'neutral';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {renderToneIcon(tone)}
      <span>{AGENDA_STATUS_LABELS[status] || status}</span>
    </span>
  );
};

export const AttendanceStatusLabel: React.FC<{attendance: LeaderAttendance}> = ({attendance}) => {
  const toneMap: Record<LeaderAttendance, Tone> = {
    belum_konfirmasi: 'neutral',
    hadir: 'success',
    diwakilkan: 'warning',
    tidak_hadir: 'danger',
  };
  const tone = toneMap[attendance] || 'neutral';
  const Icon =
    attendance === 'hadir'
      ? UserCheck
      : attendance === 'diwakilkan'
        ? Users
        : attendance === 'tidak_hadir'
          ? UserMinus
          : Clock;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{LEADER_ATTENDANCE_LABELS[attendance] || attendance}</span>
    </span>
  );
};

export const SyncStatusLabel: React.FC<{status: SyncStatus}> = ({status}) => {
  const toneMap: Record<SyncStatus, Tone> = {
    'Tersimpan di perangkat': 'warning',
    'Menunggu sinkronisasi': 'info',
    'Berhasil tersinkron': 'success',
    'Gagal tersinkron': 'danger',
  };
  const tone = toneMap[status] || 'neutral';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {renderToneIcon(tone)}
      <span>{status}</span>
    </span>
  );
};
