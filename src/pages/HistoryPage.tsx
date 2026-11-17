import React, {useMemo, useState} from 'react';
import {Search} from 'lucide-react';
import {LeaderStatusLabel, SyncStatusLabel} from '../components/StatusBadge.tsx';
import {formatDateTimeId} from '../lib/formatters.ts';
import type {
  AgendaHistoryItem,
  AppSettings,
  LeaderCode,
  LeaderUpdateItem,
} from '../types/simpro.ts';

interface HistoryPageProps {
  updates: LeaderUpdateItem[];
  agendaHistories: AgendaHistoryItem[];
  settings: AppSettings;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  updates,
  agendaHistories,
  settings,
}) => {
  const [tab, setTab] = useState<'status' | 'agenda'>('status');
  const [leaderFilter, setLeaderFilter] = useState<'all' | LeaderCode>('all');
  const [query, setQuery] = useState('');

  const leaderLabel = (code?: LeaderCode) =>
    code === 'bupati'
      ? settings.bupati_display_name
      : code === 'wakil_bupati'
        ? settings.wakil_bupati_display_name
        : '—';

  const filteredUpdates = useMemo(() => {
    return updates.filter((u) => {
      if (leaderFilter !== 'all' && u.leader !== leaderFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          u.status.toLowerCase().includes(q) ||
          u.location_text.toLowerCase().includes(q) ||
          (u.updated_by_name || '').toLowerCase().includes(q) ||
          u.note.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [updates, leaderFilter, query]);

  const filteredAgendaHistories = useMemo(() => {
    return agendaHistories.filter((h) => {
      if (leaderFilter !== 'all' && h.leader !== leaderFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          (h.agenda_title || '').toLowerCase().includes(q) ||
          (h.changed_by_name || '').toLowerCase().includes(q) ||
          h.change_reason.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [agendaHistories, leaderFilter, query]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-rose-200/80 bg-gradient-to-r from-[#0F294A] via-[#9F1239] to-[#E11D48] px-6 py-5 text-white shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-white">
          Riwayat Pembaruan & Perubahan
        </h2>
        <p className="mt-0.5 text-sm text-rose-50">
          Jejak historis yang tidak dapat diubah atau dihapus oleh pengguna biasa untuk menjaga
          akuntabilitas operasional.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200/80 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-1 rounded-lg bg-rose-50 p-1">
          <button
            type="button"
            onClick={() => setTab('status')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
              tab === 'status'
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-xs'
                : 'text-rose-900/75 hover:text-rose-950'
            }`}
          >
            Riwayat Status Pimpinan ({filteredUpdates.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('agenda')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
              tab === 'agenda'
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-xs'
                : 'text-rose-900/75 hover:text-rose-950'
            }`}
          >
            Riwayat Perubahan Agenda ({filteredAgendaHistories.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari pengirim, lokasi, status..."
              className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#0F294A] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter pimpinan riwayat"
            value={leaderFilter}
            onChange={(e) => setLeaderFilter(e.target.value as 'all' | LeaderCode)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
          >
            <option value="all">Semua Pimpinan</option>
            <option value="bupati">{settings.bupati_display_name}</option>
            <option value="wakil_bupati">{settings.wakil_bupati_display_name}</option>
          </select>
        </div>
      </div>

      {/* Tabel Riwayat Status */}
      {tab === 'status' && (
        <div className="overflow-hidden rounded-xl border border-rose-200/80 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-rose-200 bg-gradient-to-r from-rose-50 via-amber-50/60 to-sky-50/70 font-bold text-[#0F294A]">
                  <th className="px-4 py-3">Waktu Pembaruan</th>
                  <th className="px-4 py-3">Pimpinan</th>
                  <th className="px-4 py-3">Perubahan Status</th>
                  <th className="px-4 py-3">Lokasi & GPS</th>
                  <th className="px-4 py-3">Petugas Pengirim</th>
                  <th className="px-4 py-3">Sinkronisasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUpdates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      Tidak ada riwayat pembaruan status yang sesuai.
                    </td>
                  </tr>
                ) : (
                  filteredUpdates.map((u) => (
                    <tr key={u.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                        <div>Lokal: {formatDateTimeId(u.client_created_at)}</div>
                        <div className="text-[11px] text-slate-500">
                          Server: {formatDateTimeId(u.server_received_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[#0F294A] whitespace-nowrap">
                        {leaderLabel(u.leader)}
                      </td>
                      <td className="px-4 py-3 space-y-1">
                        {u.previous_status && (
                          <div className="text-[11px] text-slate-500">
                            Sebelumnya: {u.previous_status}
                          </div>
                        )}
                        <LeaderStatusLabel status={u.status} options={settings.status_options} />
                        {u.note && <p className="text-slate-600">{u.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        <div className="font-medium">{u.location_text}</div>
                        {u.latitude !== null && u.longitude !== null && (
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                            {u.latitude.toFixed(5)}, {u.longitude.toFixed(5)} (
                            {u.accuracy_m !== null ? `±${Math.round(u.accuracy_m)} m` : 'GPS'})
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {u.updated_by_name || u.updated_by}
                      </td>
                      <td className="px-4 py-3">
                        <SyncStatusLabel status={u.sync_status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabel Riwayat Agenda */}
      {tab === 'agenda' && (
        <div className="overflow-hidden rounded-xl border border-rose-200/80 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-rose-200 bg-gradient-to-r from-rose-50 via-amber-50/60 to-sky-50/70 font-bold text-[#0F294A]">
                  <th className="px-4 py-3">Waktu Perubahan</th>
                  <th className="px-4 py-3">Pimpinan</th>
                  <th className="px-4 py-3">Kegiatan</th>
                  <th className="px-4 py-3">Jenis Perubahan</th>
                  <th className="px-4 py-3">Petugas</th>
                  <th className="px-4 py-3">Alasan / Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgendaHistories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      Belum ada riwayat perubahan agenda.
                    </td>
                  </tr>
                ) : (
                  filteredAgendaHistories.map((h) => (
                    <tr key={h.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                        {formatDateTimeId(h.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#0F294A] whitespace-nowrap">
                        {leaderLabel(h.leader)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {h.agenda_title || h.agenda_id}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700 uppercase">
                        {h.change_type}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {h.changed_by_name || h.changed_by}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{h.change_reason || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
