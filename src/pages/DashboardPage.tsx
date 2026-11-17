import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Clock,
  CloudUpload,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {LeaderPanel} from '../components/LeaderPanel.tsx';
import {LiveLocationMap} from '../components/LiveLocationMap.tsx';
import {
  formatTimeOnlyId,
  isSameLocalDate,
  toLocalDateInputValue,
} from '../lib/formatters.ts';
import {clientPermissions} from '../lib/rbac.ts';
import type {
  AgendaItem,
  AppSettings,
  LeaderCode,
  LeaderUpdateItem,
  LiveLocationRecord,
  UserProfile,
} from '../types/simpro.ts';

interface DashboardPageProps {
  user: UserProfile;
  agendas: AgendaItem[];
  updates: LeaderUpdateItem[];
  liveLocations: LiveLocationRecord[];
  wsConnected: boolean;
  lastSyncedAt: string | null;
  assignedLeader: LeaderCode | null;
  isBroadcasting: boolean;
  broadcastError: string | null;
  settings: AppSettings;
  isOnline: boolean;
  unsyncedCount: number;
  fromCache: boolean;
  onNavigateToUpdate: (leader: LeaderCode) => void;
  onRefresh: () => void;
  onStartBroadcasting: () => void;
  onStopBroadcasting: () => void;
  onRefreshLocations: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  agendas,
  updates,
  liveLocations,
  wsConnected,
  lastSyncedAt,
  assignedLeader,
  isBroadcasting,
  broadcastError,
  settings,
  isOnline,
  unsyncedCount,
  fromCache,
  onNavigateToUpdate,
  onRefresh,
  onStartBroadcasting,
  onStopBroadcasting,
  onRefreshLocations,
}) => {
  const todayYmd = toLocalDateInputValue(new Date());
  const todayAgendas = agendas.filter((a) => isSameLocalDate(a.starts_at, todayYmd));
  const bupatiTodayAgendas = todayAgendas.filter((a) => a.leader === 'bupati');
  const wabupTodayAgendas = todayAgendas.filter((a) => a.leader === 'wakil_bupati');

  const nowMs = Date.now();
  const nextAgenda = agendas.find(
    (a) =>
      a.status !== 'dibatalkan' &&
      a.status !== 'selesai' &&
      new Date(a.starts_at).getTime() >= nowMs - 30 * 60 * 1000
  );

  const changedAgendaCount = agendas.filter(
    (a) => a.status === 'berubah' || a.status === 'ditunda' || a.status === 'dibatalkan'
  ).length;

  const latestBupati = updates.find((u) => u.leader === 'bupati') || null;
  const latestWabup = updates.find((u) => u.leader === 'wakil_bupati') || null;

  return (
    <div className="space-y-6">
      {/* Banner Header Operasional Berwarna */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-sky-200/80 bg-gradient-to-r from-[#0F294A] via-[#174276] to-[#0D7377] px-6 py-5 text-white shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Ringkasan Operasional Pimpinan
          </h2>
          <p className="mt-0.5 text-sm text-sky-100">
            Satu sumber informasi agenda dan pembaruan status terakhir yang dikirim petugas berwenang.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={!isOnline}
          className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/15 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white/25 disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Muat Ulang Data
        </button>
      </div>

      {fromCache && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-xs text-amber-950">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span>
            Menampilkan data dari cache lokal perangkat (IndexedDB). Data mungkin berbeda dengan
            kondisi terbaru di server hingga koneksi tersambung kembali.
          </span>
        </div>
      )}

      {/* KPI Strip Penuh Warna */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-white to-sky-50/90 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-sky-900">
            <span>Agenda Hari Ini</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Calendar className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-950 tabular-nums">
            {todayAgendas.length}
          </div>
          <div className="mt-1 text-xs font-medium text-sky-800/80 tabular-nums">
            {bupatiTodayAgendas.length} Bupati · {wabupTodayAgendas.length} Wabup
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50/90 p-4 shadow-xs sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
            <span>Agenda Berikutnya</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Clock className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          {nextAgenda ? (
            <>
              <div className="mt-2 truncate text-sm font-bold text-indigo-950">
                {nextAgenda.title}
              </div>
              <div className="mt-1 text-xs font-medium text-indigo-800/80 tabular-nums">
                {formatTimeOnlyId(nextAgenda.starts_at)} ·{' '}
                {nextAgenda.leader === 'bupati'
                  ? settings.bupati_display_name
                  : settings.wakil_bupati_display_name}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm font-medium text-indigo-900/70">
              Tidak ada agenda mendatang
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/95 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
            <span>Perubahan Agenda</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {changedAgendaCount}
          </div>
          <div className="mt-1 text-xs font-medium text-amber-900/75">
            Berubah / ditunda / batal
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 shadow-xs ${
            unsyncedCount > 0
              ? 'border-orange-200 bg-gradient-to-br from-white to-orange-50/90'
              : 'border-cyan-200 bg-gradient-to-br from-white to-cyan-50/90'
          }`}
        >
          <div
            className={`flex items-center justify-between text-xs font-semibold ${
              unsyncedCount > 0 ? 'text-orange-900' : 'text-cyan-900'
            }`}
          >
            <span>Belum Tersinkron</span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                unsyncedCount > 0
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-cyan-100 text-cyan-700'
              }`}
            >
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div
            className={`mt-2 text-2xl font-bold tabular-nums ${
              unsyncedCount > 0 ? 'text-orange-700' : 'text-cyan-950'
            }`}
          >
            {unsyncedCount}
          </div>
          <div
            className={`mt-1 text-xs font-medium ${
              unsyncedCount > 0 ? 'text-orange-900/75' : 'text-cyan-800/80'
            }`}
          >
            Antrean lokal perangkat
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 shadow-xs ${
            isOnline
              ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/90'
              : 'border-rose-200 bg-gradient-to-br from-white to-rose-50/90'
          }`}
        >
          <div
            className={`flex items-center justify-between text-xs font-semibold ${
              isOnline ? 'text-emerald-900' : 'text-rose-900'
            }`}
          >
            <span>Status Koneksi</span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {isOnline ? (
                <Wifi className="h-4 w-4" aria-hidden="true" />
              ) : (
                <WifiOff className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
          </div>
          <div
            className={`mt-2 text-base font-bold ${
              isOnline ? 'text-emerald-800' : 'text-rose-700'
            }`}
          >
            {isOnline ? 'Terhubung (Online)' : 'Terputus (Offline)'}
          </div>
          <div
            className={`mt-1 text-xs font-medium ${
              isOnline ? 'text-emerald-800/80' : 'text-rose-800/80'
            }`}
          >
            {isOnline ? 'Siap sinkronisasi ke server' : 'Menyimpan pembaruan di perangkat'}
          </div>
        </div>
      </div>

      {/* Dua Panel Utama: Bupati & Wakil Bupati */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LeaderPanel
          leader="bupati"
          displayName={settings.bupati_display_name}
          latestUpdate={latestBupati}
          todayAgendas={bupatiTodayAgendas}
          staleThresholdMinutes={settings.stale_threshold_minutes}
          statusOptions={settings.status_options}
          canSendUpdate={clientPermissions.canSubmitStatusUpdate(user.role, 'bupati')}
          onQuickUpdate={onNavigateToUpdate}
        />

        <LeaderPanel
          leader="wakil_bupati"
          displayName={settings.wakil_bupati_display_name}
          latestUpdate={latestWabup}
          todayAgendas={wabupTodayAgendas}
          staleThresholdMinutes={settings.stale_threshold_minutes}
          statusOptions={settings.status_options}
          canSendUpdate={clientPermissions.canSubmitStatusUpdate(user.role, 'wakil_bupati')}
          onQuickUpdate={onNavigateToUpdate}
        />
      </div>

      {/* Peta Pergerakan & Sinkronisasi Google Maps Live Location */}
      <LiveLocationMap
        user={user}
        settings={settings}
        liveLocations={liveLocations}
        latestUpdates={{bupati: latestBupati, wakil_bupati: latestWabup}}
        wsConnected={wsConnected}
        isOnline={isOnline}
        lastSyncedAt={lastSyncedAt}
        assignedLeader={assignedLeader}
        isBroadcasting={isBroadcasting}
        broadcastError={broadcastError}
        onStartBroadcasting={onStartBroadcasting}
        onStopBroadcasting={onStopBroadcasting}
        onRefreshLocations={onRefreshLocations}
        compact
      />

      {/* Catatan Prinsip Operasional */}
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-sky-50/70 to-teal-50/70 px-5 py-3.5 text-xs text-slate-700">
        <strong className="text-[#0F294A]">Catatan Operasional:</strong> Panel status menampilkan
        pembaruan terakhir dari petugas berwenang, sedangkan peta Google Maps tersinkronisasi secara
        real-time saat Ajudan mengaktifkan siaran Live Location GPS atas persetujuan eksplisit.
        SIMPRO tidak menggantikan instruksi kedinasan, SOP protokoler, SOP pengamanan, maupun kanal
        darurat.
      </div>
    </div>
  );
};
