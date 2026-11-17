import React from 'react';
import {Radio, ShieldCheck} from 'lucide-react';
import {LiveLocationMap} from '../components/LiveLocationMap.tsx';
import type {
  AppSettings,
  LeaderCode,
  LeaderUpdateItem,
  LiveLocationRecord,
  UserProfile,
} from '../types/simpro.ts';

interface LiveMapPageProps {
  user: UserProfile;
  settings: AppSettings;
  liveLocations: LiveLocationRecord[];
  updates: LeaderUpdateItem[];
  wsConnected: boolean;
  isOnline: boolean;
  lastSyncedAt: string | null;
  assignedLeader: LeaderCode | null;
  isBroadcasting: boolean;
  broadcastError: string | null;
  onStartBroadcasting: () => void;
  onStopBroadcasting: () => void;
  onRefreshLocations: () => void;
}

export const LiveMapPage: React.FC<LiveMapPageProps> = ({
  user,
  settings,
  liveLocations,
  updates,
  wsConnected,
  isOnline,
  lastSyncedAt,
  assignedLeader,
  isBroadcasting,
  broadcastError,
  onStartBroadcasting,
  onStopBroadcasting,
  onRefreshLocations,
}) => {
  const latestUpdates: Partial<Record<LeaderCode, LeaderUpdateItem | null>> = {
    bupati: updates.find((u) => u.leader === 'bupati') || null,
    wakil_bupati: updates.find((u) => u.leader === 'wakil_bupati') || null,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-[#0F294A] via-[#0F766E] to-[#10B981] px-6 py-5 text-white shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Peta Pergerakan & Live Location Google Maps
          </h2>
          <p className="mt-0.5 text-sm text-emerald-50">
            Pemantauan posisi terkini {settings.bupati_display_name} dan{' '}
            {settings.wakil_bupati_display_name} yang tersinkronisasi real-time dengan Google Maps.
          </p>
        </div>

        {isBroadcasting && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white/95 px-3.5 py-2 text-xs font-bold text-emerald-900 shadow-xs">
            <Radio className="h-4 w-4 text-emerald-600 animate-pulse" aria-hidden="true" />
            <span>Perangkat Anda sedang menyiarkan Live Location</span>
          </div>
        )}
      </div>

      <LiveLocationMap
        user={user}
        settings={settings}
        liveLocations={liveLocations}
        latestUpdates={latestUpdates}
        wsConnected={wsConnected}
        isOnline={isOnline}
        lastSyncedAt={lastSyncedAt}
        assignedLeader={assignedLeader}
        isBroadcasting={isBroadcasting}
        broadcastError={broadcastError}
        onStartBroadcasting={onStartBroadcasting}
        onStopBroadcasting={onStopBroadcasting}
        onRefreshLocations={onRefreshLocations}
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/80 to-sky-50/80 px-5 py-3.5 text-xs text-slate-700">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
        <div>
          <strong className="text-[#0F294A]">Kontrol Privasi & Kewenangan RBAC:</strong> Hanya
          Ajudan yang ditugaskan yang berwenang mengaktifkan siaran live location untuk
          pimpinannya. Tim Pengamanan hanya menerima koordinat yang disetujui untuk tugas
          pengamanan.
        </div>
      </div>
    </div>
  );
};
