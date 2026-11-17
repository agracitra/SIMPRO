import React, {useMemo, useState} from 'react';
import {Download, Printer, ShieldAlert} from 'lucide-react';
import {
  downloadCsvFile,
  formatDateTimeId,
  isSameLocalDate,
  toLocalDateInputValue,
} from '../lib/formatters.ts';
import {clientPermissions} from '../lib/rbac.ts';
import {dataService} from '../services/dataService.ts';
import {
  AGENDA_STATUS_LABELS,
  LEADER_ATTENDANCE_LABELS,
  type AgendaHistoryItem,
  type AgendaItem,
  type AppSettings,
  type LeaderCode,
  type LeaderUpdateItem,
  type UserProfile,
} from '../types/simpro.ts';

interface ReportsPageProps {
  user: UserProfile;
  agendas: AgendaItem[];
  updates: LeaderUpdateItem[];
  agendaHistories: AgendaHistoryItem[];
  settings: AppSettings;
  isOnline: boolean;
}

type ReportKind = 'daily' | 'weekly' | 'status' | 'agenda_changes';

export const ReportsPage: React.FC<ReportsPageProps> = ({
  user,
  agendas,
  updates,
  agendaHistories,
  settings,
  isOnline,
}) => {
  const [reportKind, setReportKind] = useState<ReportKind>('daily');
  const [selectedDate, setSelectedDate] = useState(toLocalDateInputValue(new Date()));
  const [leaderFilter, setLeaderFilter] = useState<'all' | LeaderCode>('all');
  const [exportNote, setExportNote] = useState<string | null>(null);

  const canExport = clientPermissions.canExportReports(user.role);

  const leaderName = (code?: LeaderCode) =>
    code === 'bupati'
      ? settings.bupati_display_name
      : code === 'wakil_bupati'
        ? settings.wakil_bupati_display_name
        : '—';

  const weeklyRange = useMemo(() => {
    const base = new Date(`${selectedDate}T00:00:00`);
    const day = base.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      startYmd: toLocalDateInputValue(monday),
      endYmd: toLocalDateInputValue(sunday),
    };
  }, [selectedDate]);

  const dailyAgendas = useMemo(
    () =>
      agendas.filter(
        (a) =>
          isSameLocalDate(a.starts_at, selectedDate) &&
          (leaderFilter === 'all' || a.leader === leaderFilter)
      ),
    [agendas, selectedDate, leaderFilter]
  );

  const weeklyAgendas = useMemo(
    () =>
      agendas.filter((a) => {
        const ymd = toLocalDateInputValue(new Date(a.starts_at));
        const inWeek = ymd >= weeklyRange.startYmd && ymd <= weeklyRange.endYmd;
        return inWeek && (leaderFilter === 'all' || a.leader === leaderFilter);
      }),
    [agendas, weeklyRange, leaderFilter]
  );

  const filteredUpdates = useMemo(
    () => updates.filter((u) => leaderFilter === 'all' || u.leader === leaderFilter),
    [updates, leaderFilter]
  );

  const filteredAgendaChanges = useMemo(
    () => agendaHistories.filter((h) => leaderFilter === 'all' || h.leader === leaderFilter),
    [agendaHistories, leaderFilter]
  );

  const handleExportCsv = async () => {
    if (!canExport) return;
    setExportNote(null);
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = `simpro-laporan-${reportKind}-${selectedDate}.csv`;

    if (reportKind === 'daily' || reportKind === 'weekly') {
      const source = reportKind === 'daily' ? dailyAgendas : weeklyAgendas;
      headers = [
        'Waktu Mulai',
        'Pimpinan',
        'Judul Kegiatan',
        'Lokasi',
        'PIC',
        'Status',
        'Kehadiran Pimpinan',
        'Keterangan Kehadiran',
        'Catatan',
      ];
      rows = source.map((a) => [
        formatDateTimeId(a.starts_at),
        leaderName(a.leader),
        a.title,
        a.location,
        a.pic,
        AGENDA_STATUS_LABELS[a.status] || a.status,
        LEADER_ATTENDANCE_LABELS[a.leader_attendance || 'belum_konfirmasi'],
        a.attendance_note || '',
        a.notes,
      ]);
    } else if (reportKind === 'status') {
      headers = [
        'Waktu Lokal',
        'Waktu Server',
        'Pimpinan',
        'Status Sebelumnya',
        'Status Terbaru',
        'Lokasi Teks',
        'Koordinat GPS',
        'Akurasi (m)',
        'Pengirim',
      ];
      rows = filteredUpdates.map((u) => [
        formatDateTimeId(u.client_created_at),
        formatDateTimeId(u.server_received_at),
        leaderName(u.leader),
        u.previous_status || '—',
        u.status,
        u.location_text,
        u.latitude !== null && u.longitude !== null ? `${u.latitude},${u.longitude}` : '—',
        u.accuracy_m !== null ? String(Math.round(u.accuracy_m)) : '—',
        u.updated_by_name || u.updated_by,
      ]);
    } else {
      headers = ['Waktu Perubahan', 'Pimpinan', 'Judul Kegiatan', 'Jenis', 'Petugas', 'Alasan'];
      rows = filteredAgendaChanges.map((h) => [
        formatDateTimeId(h.created_at),
        leaderName(h.leader),
        h.agenda_title || h.agenda_id,
        h.change_type,
        h.changed_by_name || h.changed_by,
        h.change_reason,
      ]);
    }

    downloadCsvFile(filename, headers, rows);

    if (isOnline) {
      await dataService.logReportExport(reportKind, 'csv', rows.length).catch(() => {});
    }
    setExportNote(
      `Berkas CSV "${filename}" (${rows.length} baris) berhasil diunduh dan aktivitas ekspor dicatat.`
    );
  };

  const handlePrint = async () => {
    if (!canExport) return;
    const count =
      reportKind === 'daily'
        ? dailyAgendas.length
        : reportKind === 'weekly'
          ? weeklyAgendas.length
          : reportKind === 'status'
            ? filteredUpdates.length
            : filteredAgendaChanges.length;
    if (isOnline) {
      await dataService.logReportExport(reportKind, 'print', count).catch(() => {});
    }
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4 rounded-xl border border-teal-200/80 bg-gradient-to-r from-[#0F294A] via-[#0F766E] to-[#059669] px-6 py-5 text-white shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Laporan & Rekap Operasional
          </h2>
          <p className="mt-0.5 text-sm text-teal-50">
            Rekapitulasi agenda harian/mingguan, pembaruan status, dan riwayat perubahan sesuai hak
            akses.
          </p>
        </div>

        {canExport && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/15 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/25"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Ekspor CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-xs hover:bg-amber-300"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              Cetak / PDF
            </button>
          </div>
        )}
      </div>

      {!canExport && (
        <div className="no-print flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span>
            Role <strong>Pimpinan / Viewer</strong> hanya memiliki akses tampilan ringkasan dan
            tidak berwenang mengekspor laporan CSV/cetak.
          </span>
        </div>
      )}

      {exportNote && (
        <div className="no-print rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-950">
          {exportNote}
        </div>
      )}

      {/* Filter & Pilihan Rekap */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200/80 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-teal-50 p-1">
          {[
            {key: 'daily', label: 'Agenda Harian'},
            {key: 'weekly', label: 'Agenda Mingguan'},
            {key: 'status', label: 'Rekap Pembaruan Status'},
            {key: 'agenda_changes', label: 'Riwayat Perubahan Agenda'},
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setReportKind(item.key as ReportKind)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                reportKind === item.key
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xs'
                  : 'text-teal-900/75 hover:text-teal-950'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter pimpinan laporan"
            value={leaderFilter}
            onChange={(e) => setLeaderFilter(e.target.value as 'all' | LeaderCode)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
          >
            <option value="all">Semua Pimpinan</option>
            <option value="bupati">{settings.bupati_display_name}</option>
            <option value="wakil_bupati">{settings.wakil_bupati_display_name}</option>
          </select>

          {(reportKind === 'daily' || reportKind === 'weekly') && (
            <input
              type="date"
              aria-label="Tanggal acuan laporan"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 tabular-nums"
            />
          )}
        </div>
      </div>

      {/* Konten Laporan */}
      <div className="overflow-hidden rounded-xl border border-teal-200/80 bg-white shadow-xs">
        <div className="border-b border-teal-100 bg-gradient-to-r from-teal-50/80 via-sky-50/60 to-emerald-50/60 px-5 py-4">
          <h3 className="text-sm font-bold text-[#0F294A]">
            {reportKind === 'daily' && `Rekap Agenda Harian (${selectedDate})`}
            {reportKind === 'weekly' &&
              `Rekap Agenda Mingguan (${weeklyRange.startYmd} s.d. ${weeklyRange.endYmd})`}
            {reportKind === 'status' && 'Rekap Pembaruan Status Pimpinan'}
            {reportKind === 'agenda_changes' && 'Rekap Riwayat Perubahan Agenda'}
          </h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Dicetak/diakses oleh: {user.full_name} ({user.email})
          </p>
        </div>

        <div className="overflow-x-auto">
          {(reportKind === 'daily' || reportKind === 'weekly') && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-teal-200 bg-teal-50/70 font-bold text-[#0F294A]">
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Pimpinan</th>
                  <th className="px-4 py-3">Judul Kegiatan</th>
                  <th className="px-4 py-3">Lokasi</th>
                  <th className="px-4 py-3">PIC</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Kehadiran Pimpinan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(reportKind === 'daily' ? dailyAgendas : weeklyAgendas).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Tidak ada agenda pada periode ini.
                    </td>
                  </tr>
                ) : (
                  (reportKind === 'daily' ? dailyAgendas : weeklyAgendas).map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-mono whitespace-nowrap tabular-nums">
                        {formatDateTimeId(a.starts_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#0F294A] whitespace-nowrap">
                        {leaderName(a.leader)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{a.title}</td>
                      <td className="px-4 py-3 text-slate-700">{a.location}</td>
                      <td className="px-4 py-3 text-slate-600">{a.pic || '—'}</td>
                      <td className="px-4 py-3 font-medium">
                        {AGENDA_STATUS_LABELS[a.status] || a.status}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {LEADER_ATTENDANCE_LABELS[a.leader_attendance || 'belum_konfirmasi']}
                        {a.attendance_note ? ` (${a.attendance_note})` : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportKind === 'status' && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="px-4 py-3">Waktu Lokal</th>
                  <th className="px-4 py-3">Pimpinan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Lokasi</th>
                  <th className="px-4 py-3">Pengirim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUpdates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Belum ada data pembaruan status.
                    </td>
                  </tr>
                ) : (
                  filteredUpdates.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-mono whitespace-nowrap tabular-nums">
                        {formatDateTimeId(u.client_created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#0F294A]">
                        {leaderName(u.leader)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{u.status}</td>
                      <td className="px-4 py-3 text-slate-700">{u.location_text}</td>
                      <td className="px-4 py-3 text-slate-700">{u.updated_by_name || u.updated_by}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {reportKind === 'agenda_changes' && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Pimpinan</th>
                  <th className="px-4 py-3">Kegiatan</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Petugas</th>
                  <th className="px-4 py-3">Alasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgendaChanges.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Belum ada riwayat perubahan agenda.
                    </td>
                  </tr>
                ) : (
                  filteredAgendaChanges.map((h) => (
                    <tr key={h.id}>
                      <td className="px-4 py-3 font-mono whitespace-nowrap tabular-nums">
                        {formatDateTimeId(h.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#0F294A]">
                        {leaderName(h.leader)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {h.agenda_title || h.agenda_id}
                      </td>
                      <td className="px-4 py-3 uppercase">{h.change_type}</td>
                      <td className="px-4 py-3">{h.changed_by_name || h.changed_by}</td>
                      <td className="px-4 py-3 text-slate-600">{h.change_reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
