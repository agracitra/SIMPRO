import React from 'react';
import {Clock, Compass, ExternalLink, MapPin, User} from 'lucide-react';
import {
  formatDateTimeId,
  formatTimeOnlyId,
  getDataAgeInfo,
} from '../lib/formatters.ts';
import type {
  AgendaItem,
  LeaderCode,
  LeaderUpdateItem,
  StatusOption,
} from '../types/simpro.ts';
import {AgendaStatusLabel, AttendanceStatusLabel, LeaderStatusLabel} from './StatusBadge.tsx';

interface LeaderPanelProps {
  leader: LeaderCode;
  displayName: string;
  latestUpdate: LeaderUpdateItem | null;
  todayAgendas: AgendaItem[];
  staleThresholdMinutes: number;
  statusOptions: StatusOption[];
  canSendUpdate: boolean;
  onQuickUpdate?: (leader: LeaderCode) => void;
}

export const LeaderPanel: React.FC<LeaderPanelProps> = ({
  leader,
  displayName,
  latestUpdate,
  todayAgendas,
  staleThresholdMinutes,
  statusOptions,
  canSendUpdate,
  onQuickUpdate,
}) => {
  const ageInfo = getDataAgeInfo(
    latestUpdate?.server_received_at || latestUpdate?.client_created_at,
    staleThresholdMinutes
  );

  const isBupati = leader === 'bupati';

  const cardBorder = isBupati ? 'border-sky-200/90' : 'border-teal-200/90';
  const headerGradient = isBupati
    ? 'bg-gradient-to-r from-[#0F294A] via-[#1A4B84] to-[#0284C7]'
    : 'bg-gradient-to-r from-[#0D4F4B] via-[#0F766E] to-[#14B8A6]';
  const subtitleColor = isBupati ? 'text-sky-200' : 'text-teal-100';
  const accentPinColor = isBupati ? 'text-sky-600' : 'text-teal-600';
  const noteSurface = isBupati
    ? 'border-sky-100 bg-sky-50/70 text-slate-800'
    : 'border-teal-100 bg-teal-50/70 text-slate-800';
  const ctaGradient = isBupati
    ? 'bg-gradient-to-r from-[#0F294A] to-[#0284C7] hover:brightness-110'
    : 'bg-gradient-to-r from-[#0F766E] to-[#0D9488] hover:brightness-110';
  const agendaSectionBg = isBupati ? 'bg-sky-50/35 border-sky-100' : 'bg-teal-50/35 border-teal-100';

  return (
    <section
      aria-label={`Panel Monitoring ${displayName}`}
      className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-xs ${cardBorder}`}
    >
      {/* Header Panel Berwarna */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-white ${headerGradient}`}>
        <div className="flex items-center gap-3.5">
          {isBupati && (
            <div className="h-16 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-sky-200/80 bg-gradient-to-b from-sky-50 to-white shadow-sm">
              <img
                src="/assets/aistudio/Wakil_Bupati_Sidoarjo_Subandi_18547112.png"
                alt={`Foto ${displayName}`}
                className="h-full w-full object-cover object-top"
              />
            </div>
          )}
          <div>
            <p className={`text-xs font-medium ${subtitleColor}`}>
              Objek Pemantauan Operasional
            </p>
            <h2 className="text-lg font-bold tracking-tight text-white">
              {displayName}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold tabular-nums shadow-xs ${
              ageInfo.isStale
                ? 'border-amber-300 bg-amber-100 text-amber-950'
                : 'border-emerald-300 bg-emerald-100 text-emerald-950'
            }`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {ageInfo.isStale ? `Perlu Pembaruan (${ageInfo.label})` : `Terkini · ${ageInfo.label}`}
            </span>
          </span>
        </div>
      </div>

      {/* Status & Lokasi Terakhir */}
      <div className="space-y-4 px-6 py-5">
        {latestUpdate ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LeaderStatusLabel status={latestUpdate.status} options={statusOptions} />
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                Pembaruan status terakhir
              </span>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="flex items-start gap-2.5">
                <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${accentPinColor}`} aria-hidden="true" />
                <div>
                  <div className="text-xs font-medium text-slate-500">Lokasi Terakhir Dilaporkan</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {latestUpdate.location_text}
                  </div>
                </div>
              </div>

              {latestUpdate.note && (
                <p className={`rounded-lg border px-3 py-2 text-sm ${noteSurface}`}>
                  {latestUpdate.note}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <User className={`h-3.5 w-3.5 shrink-0 ${accentPinColor}`} aria-hidden="true" />
                  <span className="truncate">
                    Pengirim:{' '}
                    <strong className="font-semibold text-slate-900">
                      {latestUpdate.updated_by_name || 'Ajudan'}
                    </strong>
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600 tabular-nums">
                  <Clock className={`h-3.5 w-3.5 shrink-0 ${accentPinColor}`} aria-hidden="true" />
                  <span>
                    Waktu:{' '}
                    <strong className="font-mono font-semibold text-slate-900">
                      {formatDateTimeId(latestUpdate.client_created_at)}
                    </strong>
                  </span>
                </div>
              </div>

              {latestUpdate.latitude !== null && latestUpdate.longitude !== null && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 tabular-nums">
                  <span className="inline-flex items-center gap-1.5 font-mono font-medium text-slate-800">
                    <Compass className={`h-3.5 w-3.5 ${accentPinColor}`} aria-hidden="true" />
                    {latestUpdate.latitude.toFixed(5)}, {latestUpdate.longitude.toFixed(5)}
                  </span>
                  {latestUpdate.accuracy_m !== null && (
                    <span>Akurasi GPS: ±{Math.round(latestUpdate.accuracy_m)} m</span>
                  )}
                  {latestUpdate.gps_captured_at && (
                    <span>Diambil: {formatTimeOnlyId(latestUpdate.gps_captured_at)}</span>
                  )}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${latestUpdate.latitude},${latestUpdate.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 font-semibold underline ${
                      isBupati
                        ? 'text-sky-700 hover:text-sky-900'
                        : 'text-teal-700 hover:text-teal-900'
                    }`}
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    Google Maps
                  </a>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              Belum ada pembaruan status untuk {displayName}.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Pembaruan akan tampil setelah Ajudan mengirimkan laporan status kegiatan.
            </p>
          </div>
        )}

        {canSendUpdate && onQuickUpdate && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => onQuickUpdate(leader)}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition-all whitespace-nowrap ${ctaGradient}`}
            >
              Kirim Pembaruan Status {displayName}
            </button>
          </div>
        )}
      </div>

      {/* Agenda Hari Ini */}
      <div className={`mt-auto border-t px-6 py-4 ${agendaSectionBg}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={`text-xs font-bold tracking-wide uppercase ${isBupati ? 'text-sky-900' : 'text-teal-900'}`}>
            Agenda Hari Ini ({todayAgendas.length})
          </h3>
        </div>

        {todayAgendas.length === 0 ? (
          <p className="mt-2.5 text-xs text-slate-500">
            Tidak ada agenda terjadwal untuk tanggal hari ini.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200/70">
            {todayAgendas.map((agenda) => (
              <li key={agenda.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                    <span
                      className={`font-mono font-bold ${
                        isBupati ? 'text-sky-800' : 'text-teal-800'
                      }`}
                    >
                      {formatTimeOnlyId(agenda.starts_at)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{agenda.location}</span>
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">{agenda.title}</p>
                  {agenda.pic && (
                    <p className="mt-0.5 text-xs text-slate-600">PIC: {agenda.pic}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <AgendaStatusLabel status={agenda.status} />
                  <AttendanceStatusLabel
                    attendance={agenda.leader_attendance || 'belum_konfirmasi'}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
