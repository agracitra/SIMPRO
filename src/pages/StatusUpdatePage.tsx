import React, {useEffect, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Info,
  MapPin,
  Radio,
  RefreshCw,
  Send,
  Square,
  Trash2,
} from 'lucide-react';
import {SyncStatusLabel} from '../components/StatusBadge.tsx';
import {formatDateTimeId} from '../lib/formatters.ts';
import {clientPermissions} from '../lib/rbac.ts';
import {syncService} from '../services/syncService.ts';
import type {
  AppSettings,
  LeaderCode,
  OfflineQueuedUpdate,
  UserProfile,
} from '../types/simpro.ts';

interface StatusUpdatePageProps {
  user: UserProfile;
  settings: AppSettings;
  isOnline: boolean;
  preselectedLeader?: LeaderCode;
  queue: OfflineQueuedUpdate[];
  isSyncing: boolean;
  wsConnected: boolean;
  isBroadcasting: boolean;
  broadcastError: string | null;
  onStartBroadcasting: (options?: {
    locationText?: string;
    status?: string;
    approvedForSecurity?: boolean;
  }) => void;
  onStopBroadcasting: () => void;
  onUpdateBroadcastMeta: (options: {
    locationText?: string;
    status?: string;
    approvedForSecurity?: boolean;
  }) => void;
  onQueueUpdated: () => Promise<void>;
  onManualSync: () => Promise<void>;
  onServerSynced: () => void;
}

type GpsPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable' | 'unknown';

export const StatusUpdatePage: React.FC<StatusUpdatePageProps> = ({
  user,
  settings,
  isOnline,
  preselectedLeader,
  queue,
  isSyncing,
  wsConnected,
  isBroadcasting,
  broadcastError,
  onStartBroadcasting,
  onStopBroadcasting,
  onUpdateBroadcastMeta,
  onQueueUpdated,
  onManualSync,
  onServerSynced,
}) => {
  const assignedLeader = clientPermissions.getAssignedLeader(user.role);
  const canSubmit = assignedLeader !== null;

  const activeStatuses = settings.status_options.filter((s) => s.active);
  const [leader, setLeader] = useState<LeaderCode>(
    assignedLeader || preselectedLeader || 'bupati'
  );
  const [status, setStatus] = useState<string>(activeStatuses[0]?.code || 'Persiapan');
  const [locationText, setLocationText] = useState('');
  const [note, setNote] = useState('');
  const [approvedForSecurity, setApprovedForSecurity] = useState(true);

  // State GPS Manual (hanya diisi saat tombol Ambil GPS ditekan)
  const [gpsPermission, setGpsPermission] = useState<GpsPermissionState>('unknown');
  const [gpsCapturing, setGpsCapturing] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [gpsCapturedAt, setGpsCapturedAt] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (assignedLeader) {
      setLeader(assignedLeader);
    }
  }, [assignedLeader]);

  useEffect(() => {
    onUpdateBroadcastMeta({
      locationText: locationText.trim() || undefined,
      status,
      approvedForSecurity,
    });
  }, [locationText, status, approvedForSecurity, onUpdateBroadcastMeta]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsPermission('unavailable');
      return;
    }
    if ('permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({name: 'geolocation'})
        .then((res) => {
          setGpsPermission(res.state as GpsPermissionState);
        })
        .catch(() => setGpsPermission('unknown'));
    }
  }, []);

  const handleCaptureGps = () => {
    setGpsError(null);
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsPermission('unavailable');
      setGpsError(
        'Perangkat atau browser ini tidak mendukung Geolocation. Silakan isi lokasi dalam bentuk teks.'
      );
      return;
    }

    setGpsCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCapturing(false);
        setGpsPermission('granted');
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAccuracyM(pos.coords.accuracy);
        setGpsCapturedAt(new Date().toISOString());
      },
      (err) => {
        setGpsCapturing(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsPermission('denied');
          setGpsError(
            'Izin lokasi ditolak oleh pengguna/browser. Anda tetap dapat mengirim pembaruan menggunakan lokasi teks.'
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError(
            'Sinyal lokasi tidak tersedia saat ini. Gunakan lokasi teks untuk melanjutkan.'
          );
        } else {
          setGpsError('Waktu pengambilan GPS habis. Anda dapat mencoba ulang atau memakai lokasi teks.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  const clearGps = () => {
    setLatitude(null);
    setLongitude(null);
    setAccuracyM(null);
    setGpsCapturedAt(null);
    setGpsError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !assignedLeader) return;
    setSubmitFeedback(null);
    setSubmitting(true);

    try {
      const result = await syncService.enqueueAndTrySync(
        {
          leader: assignedLeader,
          status,
          location_text: locationText.trim(),
          latitude,
          longitude,
          accuracy_m: accuracyM,
          gps_captured_at: gpsCapturedAt,
          note: note.trim(),
          approved_for_security: approvedForSecurity,
          author_id: user.id,
          author_name: user.full_name,
        },
        isOnline
      );

      await onQueueUpdated();

      if (result.synced) {
        setSubmitFeedback({
          tone: 'success',
          message:
            'Pembaruan status berhasil tersinkron ke server dan kini dapat dilihat oleh petugas berwenang.',
        });
        setLocationText('');
        setNote('');
        clearGps();
        onServerSynced();
      } else if (!isOnline) {
        setSubmitFeedback({
          tone: 'warning',
          message:
            'Koneksi sedang OFFLINE. Pembaruan tersimpan di perangkat (IndexedDB) dan BELUM diterima perangkat anggota lain hingga sinkronisasi ke server berhasil.',
        });
        setLocationText('');
        setNote('');
        clearGps();
      } else {
        setSubmitFeedback({
          tone: 'error',
          message: `Pembaruan disimpan lokal namun gagal tersinkron: ${
            result.error || 'Kesalahan server'
          }. Data tetap aman di antrean perangkat.`,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetrySingle = async (item: OfflineQueuedUpdate) => {
    await syncService.syncSingleItem(item);
    await onQueueUpdated();
    onServerSynced();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-cyan-200/80 bg-gradient-to-r from-[#0F294A] via-[#0369A1] to-[#0891B2] px-6 py-5 text-white shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-white">
          Pembaruan Status & GPS Manual
        </h2>
        <p className="mt-0.5 text-sm text-cyan-50">
          Pengiriman status kegiatan pimpinan secara sadar oleh Ajudan dengan dukungan antrean
          offline IndexedDB.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form Pembaruan Status */}
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-cyan-200/80 bg-white p-6 shadow-xs">
            {!canSubmit ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                <div className="flex items-start gap-2.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Akses Pembaruan Khusus Ajudan</p>
                    <p className="mt-1 text-xs leading-relaxed text-sky-900">
                      Sesuai matriks RBAC SIMPRO v1.0, hanya <strong>Ajudan Bupati</strong> dan{' '}
                      <strong>Ajudan Wakil Bupati</strong> yang berwenang mengirim pembaruan status
                      lapangan untuk pimpinan yang ditugaskan. Anda tetap dapat memantau antrean
                      sinkronisasi perangkat di sisi kanan.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Pimpinan (Sesuai Penugasan)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={
                        leader === 'bupati'
                          ? settings.bupati_display_name
                          : settings.wakil_bupati_display_name
                      }
                      className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-[#0F294A]"
                    />
                  </div>

                  <div>
                    <label htmlFor="status-select" className="block text-xs font-medium text-slate-700">
                      Status Kegiatan
                    </label>
                    <select
                      id="status-select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F294A] focus:outline-none"
                    >
                      {activeStatuses.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="loc-text" className="block text-xs font-medium text-slate-700">
                    Lokasi (Teks — Wajib)
                  </label>
                  <div className="relative mt-1.5">
                    <MapPin
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="loc-text"
                      type="text"
                      required
                      minLength={2}
                      value={locationText}
                      onChange={(e) => setLocationText(e.target.value)}
                      placeholder="Contoh: Halaman Kantor Kecamatan Sukamaju"
                      className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 focus:border-[#0F294A] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="upd-note" className="block text-xs font-medium text-slate-700">
                    Catatan Tambahan
                  </label>
                  <textarea
                    id="upd-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Keterangan singkat kondisi kegiatan atau estimasi pergerakan..."
                    className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#0F294A] focus:outline-none"
                  />
                </div>

                {/* Seksi GPS Manual (Hanya saat tombol ditekan) */}
                <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/75 to-indigo-50/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[#0F294A]">
                        Koordinat GPS Manual (Opsional)
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        Status izin perangkat: <strong className="font-mono">{gpsPermission}</strong>{' '}
                        · Tidak ada pelacakan latar belakang.
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {latitude !== null && (
                        <button
                          type="button"
                          onClick={clearGps}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Hapus GPS
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={gpsCapturing}
                        onClick={handleCaptureGps}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Compass className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                        {gpsCapturing ? 'Mengambil Koordinat...' : 'Ambil GPS'}
                      </button>
                    </div>
                  </div>

                  {gpsError && (
                    <p className="mt-2.5 text-xs text-amber-900">{gpsError}</p>
                  )}

                  {latitude !== null && longitude !== null && (
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs tabular-nums sm:grid-cols-4">
                      <div>
                        <span className="text-slate-500">Latitude</span>
                        <div className="font-mono font-semibold text-slate-900">
                          {latitude.toFixed(6)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Longitude</span>
                        <div className="font-mono font-semibold text-slate-900">
                          {longitude.toFixed(6)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Akurasi</span>
                        <div className="font-mono font-semibold text-slate-900">
                          {accuracyM !== null ? `±${Math.round(accuracyM)} m` : '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Diambil Pada</span>
                        <div className="font-mono font-semibold text-slate-900">
                          {formatDateTimeId(gpsCapturedAt)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Seksi Siaran Live Location Real-Time ke Google Maps */}
                <div
                  className={`rounded-xl border p-4 ${
                    isBroadcasting
                      ? 'border-emerald-300 bg-emerald-50/70'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                        <Radio
                          className={`h-3.5 w-3.5 ${
                            isBroadcasting ? 'text-emerald-600 animate-pulse' : 'text-slate-500'
                          }`}
                          aria-hidden="true"
                        />
                        <span>Siaran Live Location (Sinkron Google Maps)</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        {isBroadcasting
                          ? `Sedang menyiarkan posisi GPS secara real-time (${
                              wsConnected ? 'WebSocket terhubung' : 'mengirim via API'
                            }).`
                          : 'Nonaktif. Aktifkan hanya saat ingin membagikan pergerakan langsung ke peta SIMPRO.'}
                      </div>
                    </div>

                    {isBroadcasting ? (
                      <button
                        type="button"
                        onClick={onStopBroadcasting}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap"
                      >
                        <Square className="h-3 w-3 fill-current" aria-hidden="true" />
                        Hentikan Live Location
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!isOnline}
                        onClick={() =>
                          onStartBroadcasting({
                            locationText: locationText.trim() || undefined,
                            status,
                            approvedForSecurity,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                        Aktifkan Live Location
                      </button>
                    )}
                  </div>

                  {broadcastError && (
                    <p className="mt-2 text-xs text-red-700">{broadcastError}</p>
                  )}
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={approvedForSecurity}
                    onChange={(e) => setApprovedForSecurity(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Tampilkan pembaruan ini ke Tim Pengamanan
                </label>

                {submitFeedback && (
                  <div
                    role="status"
                    className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs ${
                      submitFeedback.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                        : submitFeedback.tone === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-950'
                          : 'border-red-200 bg-red-50 text-red-950'
                    }`}
                  >
                    {submitFeedback.tone === 'success' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>{submitFeedback.message}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <span className="text-xs text-slate-500 tabular-nums">
                    Waktu lokal perangkat: {formatDateTimeId(new Date().toISOString())}
                  </span>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#0F294A] via-[#0284C7] to-[#0891B2] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:brightness-110 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    {submitting
                      ? 'Menyimpan...'
                      : isOnline
                        ? 'Kirim Pembaruan'
                        : 'Simpan ke Antrean Offline'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Panel Antrean Sinkronisasi Lokal (IndexedDB) */}
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-xl border border-indigo-200/80 bg-white shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-cyan-50/70 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-[#0F294A]">
                  Antrean Sinkronisasi Perangkat
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Penyimpanan IndexedDB · ID unik mencegah duplikasi
                </p>
              </div>
              <button
                type="button"
                disabled={!isOnline || isSyncing}
                onClick={onManualSync}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                Sinkronkan
              </button>
            </div>

            <div className="px-5 py-3 divide-y divide-slate-100">
              {queue.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Belum ada pembaruan yang disimpan dalam antrean perangkat ini.
                </p>
              ) : (
                queue.slice(0, 15).map((item) => (
                  <div key={item.client_update_id} className="py-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {item.leader === 'bupati'
                          ? settings.bupati_display_name
                          : settings.wakil_bupati_display_name}{' '}
                        · {item.status}
                      </span>
                      <SyncStatusLabel status={item.sync_status} />
                    </div>
                    <p className="mt-1 text-slate-700">{item.location_text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 tabular-nums">
                      <span>Dibuat: {formatDateTimeId(item.client_created_at)}</span>
                      {item.server_received_at && (
                        <span>Diterima server: {formatDateTimeId(item.server_received_at)}</span>
                      )}
                    </div>
                    {item.last_error && (
                      <p className="mt-1 text-[11px] text-red-700">Error: {item.last_error}</p>
                    )}
                    {item.sync_status === 'Gagal tersinkron' && isOnline && (
                      <button
                        type="button"
                        onClick={() => handleRetrySingle(item)}
                        className="mt-2 inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-800 hover:bg-red-100"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                        Coba Sinkron Ulang
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
