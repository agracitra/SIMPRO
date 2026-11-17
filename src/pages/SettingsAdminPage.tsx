import React, {useEffect, useState} from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  Plus,
  Save,
  Shield,
} from 'lucide-react';
import {formatDateTimeId} from '../lib/formatters.ts';
import {dataService} from '../services/dataService.ts';
import {
  PENDING_INSTITUTIONAL_DECISIONS,
  type AppSettings,
  type AuditLogItem,
  type StatusOption,
  type SystemModeInfo,
} from '../types/simpro.ts';

interface SettingsAdminPageProps {
  settings: AppSettings;
  systemMode: SystemModeInfo | null;
  isOnline: boolean;
  onSettingsUpdated: (next: AppSettings) => void;
}

export const SettingsAdminPage: React.FC<SettingsAdminPageProps> = ({
  settings,
  systemMode,
  isOnline,
  onSettingsUpdated,
}) => {
  const [tab, setTab] = useState<'config' | 'audit' | 'database'>('config');

  // Config state
  const [viewerEnabled, setViewerEnabled] = useState(settings.viewer_enabled);
  const [staleMinutes, setStaleMinutes] = useState(settings.stale_threshold_minutes);
  const [bupatiName, setBupatiName] = useState(settings.bupati_display_name);
  const [wabupName, setWabupName] = useState(settings.wakil_bupati_display_name);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(settings.status_options);
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // SQL & Backup state
  const [migrationSql, setMigrationSql] = useState<string>('');
  const [restoreCheckMsg, setRestoreCheckMsg] = useState<string | null>(null);

  useEffect(() => {
    if (tab === 'audit' && isOnline) {
      setLoadingAudit(true);
      dataService
        .fetchAuditLogs()
        .then(setAuditLogs)
        .finally(() => setLoadingAudit(false));
    }
    if (tab === 'database' && isOnline && !migrationSql) {
      dataService
        .fetchMigrationSql()
        .then((res) => setMigrationSql(res.sql))
        .catch(() => {});
    }
  }, [tab, isOnline, migrationSql]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const updated = await dataService.updateSettings({
        viewer_enabled: viewerEnabled,
        stale_threshold_minutes: Number(staleMinutes),
        bupati_display_name: bupatiName,
        wakil_bupati_display_name: wabupName,
        status_options: statusOptions,
      });
      onSettingsUpdated(updated);
      setFeedback('Konfigurasi aplikasi berhasil disimpan dan dicatat ke audit log.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddStatusOption = () => {
    const trimmed = newStatusLabel.trim();
    if (!trimmed) return;
    if (statusOptions.some((s) => s.code.toLowerCase() === trimmed.toLowerCase())) return;
    setStatusOptions([
      ...statusOptions,
      {
        code: trimmed,
        label: trimmed,
        tone: 'info',
        important: false,
        active: true,
      },
    ]);
    setNewStatusLabel('');
  };

  const handleDownloadBackup = async () => {
    setErrorMsg(null);
    try {
      const snapshot = await dataService.downloadBackup();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `simpro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengunduh berkas backup.');
    }
  };

  const handleVerifyBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreCheckMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await dataService.verifyBackup(parsed);
      setRestoreCheckMsg(
        res.valid
          ? `${res.message} (Profil: ${res.verified_counts?.profiles}, Agenda: ${res.verified_counts?.agendas}, Pembaruan: ${res.verified_counts?.leader_updates})`
          : res.error || 'Berkas backup tidak valid.'
      );
    } catch {
      setRestoreCheckMsg('Gagal membaca berkas JSON backup.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-r from-[#0F294A] via-[#1E40AF] to-[#4338CA] px-6 py-5 text-white shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-white">
          Pengaturan, Audit Log & Kesiapan Infrastruktur
        </h2>
        <p className="mt-0.5 text-sm text-indigo-100">
          Konfigurasi parameter operasional, peninjauan audit log keamanan, serta migrasi & backup
          database.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-indigo-200/80 bg-indigo-50 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab('config')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
            tab === 'config'
              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-xs'
              : 'text-indigo-900/75 hover:text-indigo-950'
          }`}
        >
          Konfigurasi & Status
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
            tab === 'audit'
              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-xs'
              : 'text-indigo-900/75 hover:text-indigo-950'
          }`}
        >
          Audit Log Keamanan
        </button>
        <button
          type="button"
          onClick={() => setTab('database')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
            tab === 'database'
              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-xs'
              : 'text-indigo-900/75 hover:text-indigo-950'
          }`}
        >
          Supabase, SQL & Backup
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
          {errorMsg}
        </div>
      )}

      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          <span>{feedback}</span>
        </div>
      )}

      {/* TAB 1: Konfigurasi */}
      {tab === 'config' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveConfig}
            className="space-y-6 rounded-xl border border-slate-200 bg-white p-6"
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Label Panel Pimpinan 1
                </label>
                <input
                  type="text"
                  value={bupatiName}
                  onChange={(e) => setBupatiName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Label Panel Pimpinan 2
                </label>
                <input
                  type="text"
                  value={wabupName}
                  onChange={(e) => setWabupName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Ambang Data Kedaluwarsa (menit)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={staleMinutes}
                  onChange={(e) => setStaleMinutes(Number(e.target.value))}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Dashboard menandai pembaruan sebagai &ldquo;Perlu Pembaruan&rdquo; setelah usia
                  data melebihi batas ini.
                </p>
              </div>

              <div className="flex items-start pt-5">
                <label className="inline-flex items-start gap-2.5 text-xs text-slate-800">
                  <input
                    type="checkbox"
                    checked={viewerEnabled}
                    onChange={(e) => setViewerEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <strong>Aktifkan Akses Pimpinan / Viewer</strong>
                    <span className="block text-[11px] text-slate-500">
                      Jika tidak dicentang, akun dengan role Pimpinan/Viewer ditolak masuk.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Daftar Status Kegiatan yang Dapat Dikonfigurasi */}
            <div className="border-t border-slate-200 pt-5">
              <h3 className="text-sm font-bold text-[#0F294A]">
                Daftar Status Kegiatan (Dapat Disesuaikan Admin)
              </h3>
              <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {statusOptions.map((opt, idx) => (
                  <div
                    key={opt.code}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                  >
                    <span className="font-medium text-slate-900">{opt.label}</span>
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-1.5 text-slate-600">
                        <input
                          type="checkbox"
                          checked={opt.important}
                          onChange={(e) => {
                            const copy = [...statusOptions];
                            copy[idx] = {...opt, important: e.target.checked};
                            setStatusOptions(copy);
                          }}
                        />
                        Kirim Notifikasi Penting
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-slate-600">
                        <input
                          type="checkbox"
                          checked={opt.active}
                          onChange={(e) => {
                            const copy = [...statusOptions];
                            copy[idx] = {...opt, active: e.target.checked};
                            setStatusOptions(copy);
                          }}
                        />
                        Aktif
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={newStatusLabel}
                  onChange={(e) => setNewStatusLabel(e.target.value)}
                  placeholder="Tambah status baru sesuai SOP..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddStatusOption}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Status
                </button>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={!isOnline || saving}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#0F294A] via-[#1D4ED8] to-[#0284C7] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:brightness-110 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
              </button>
            </div>
          </form>

          {/* Arsitektur Ekspansi Masa Depan (v1.0 nonaktif) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-[#0F294A]">
              Kesiapan Ekspansi Multi-Unit (Fase Lanjut)
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Skema database SIMPRO telah mendukung tabel <code>monitoring_units</code> untuk
              Sekretariat Daerah dan OPD terkait di masa depan. Sesuai lingkup v1.0, pemantauan OPD
              lain sengaja dinonaktifkan.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="font-semibold text-emerald-950">Bupati</div>
                <div className="text-emerald-800">Aktif pada SIMPRO v1.0</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="font-semibold text-emerald-950">Wakil Bupati</div>
                <div className="text-emerald-800">Aktif pada SIMPRO v1.0</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="font-semibold text-slate-800">Sekretaris Daerah & OPD</div>
                <div className="text-slate-500">Terdaftar di skema · Nonaktif pada v1.0</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Audit Logs */}
      {tab === 'audit' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#0F294A]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#0F294A]">
                Log Audit Keamanan & Aksi Sensitif (Append-Only)
              </h3>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">{auditLogs.length} entri</span>
          </div>

          {loadingAudit ? (
            <div className="px-6 py-10 text-center text-xs text-slate-500">Memuat audit log...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Aktor</th>
                    <th className="px-4 py-3">Aksi</th>
                    <th className="px-4 py-3">Entitas</th>
                    <th className="px-4 py-3">Metadata Aman</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                        {formatDateTimeId(log.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{log.actor_email || '—'}</div>
                        <div className="text-[11px] text-slate-500">{log.actor_role || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            log.action.includes('DENIED') || log.action.includes('FAILED')
                              ? 'border-red-200 bg-red-50 text-red-900'
                              : 'border-slate-200 bg-slate-50 text-slate-800'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{log.entity}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                        {JSON.stringify(log.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Database, SQL Migration, Backup & Lampiran D */}
      {tab === 'database' && (
        <div className="space-y-6">
          {/* Status Koneksi Supabase */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 text-[#0F294A]" aria-hidden="true" />
              <div className="space-y-1 text-xs">
                <h3 className="text-sm font-bold text-[#0F294A]">Status Koneksi Database</h3>
                <p className="text-slate-700">
                  Mode saat ini:{' '}
                  <strong>
                    {systemMode?.supabaseConfigured
                      ? 'Terhubung ke Supabase PostgreSQL'
                      : 'Mode Lokal Terisolasi (SQLite) — Kredensial Supabase Belum Diisi'}
                  </strong>
                </p>
                <p className="text-slate-600">
                  Untuk menghubungkan ke proyek Supabase instansi, isi{' '}
                  <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> pada
                  environment (dan <code>SUPABASE_SERVICE_ROLE_KEY</code> khusus server-side), lalu
                  jalankan migrasi SQL di bawah pada SQL Editor Supabase.
                </p>
              </div>
            </div>
          </div>

          {/* Backup & Uji Pemulihan */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-[#0F294A]">Backup & Uji Validasi Pemulihan</h3>
            <p className="mt-1 text-xs text-slate-600">
              Ekspor snapshot JSON seluruh tabel inti dan uji validasi integritas berkas backup
              (dry-run) sebelum peluncuran produksi.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!isOnline}
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#163B6B] disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Unduh Snapshot Backup (JSON)
              </button>

              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Uji Validasi Berkas Backup (Dry-Run)</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleVerifyBackupFile}
                  className="hidden"
                />
              </label>
            </div>
            {restoreCheckMsg && (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs text-sky-950">
                {restoreCheckMsg}
              </div>
            )}
          </div>

          {/* Keputusan Lampiran D PRD */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-[#0F294A]">
              Daftar Keputusan Instansi yang Perlu Divalidasi (PRD Lampiran D)
            </h3>
            <div className="mt-3 divide-y divide-slate-100 text-xs">
              {PENDING_INSTITUTIONAL_DECISIONS.map((item) => (
                <div key={item.topic} className="py-2.5">
                  <div className="font-semibold text-slate-900">{item.topic}</div>
                  <div className="text-slate-600">{item.question}</div>
                  <div className="mt-0.5 text-amber-800">
                    Konfigurasi sementara: {item.temporaryDefault}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SQL Migration Preview */}
          {migrationSql && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#0F294A]">
                  Migrasi SQL & RLS (supabase/migrations/001_simpro_v1_schema.sql)
                </h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(migrationSql)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Salin SQL
                </button>
              </div>
              <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
                {migrationSql}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
