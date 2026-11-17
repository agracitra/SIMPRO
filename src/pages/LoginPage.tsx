import React, {useState} from 'react';
import {AlertCircle, ChevronDown, ChevronUp, KeyRound, Lock} from 'lucide-react';
import {authService} from '../services/authService.ts';
import type {SystemModeInfo, UserProfile} from '../types/simpro.ts';

interface LoginPageProps {
  systemMode: SystemModeInfo | null;
  onLoginSuccess: (user: UserProfile) => void;
}

const LOCAL_QA_ACCOUNTS = [
  {role: 'Admin SIMPRO', email: 'admin@simpro.local', pass: 'Simpro#Admin2026', badge: 'bg-indigo-100 text-indigo-800'},
  {role: 'Ajudan Bupati', email: 'ajudan.bupati@simpro.local', pass: 'Simpro#Bupati2026', badge: 'bg-sky-100 text-sky-800'},
  {role: 'Ajudan Wakil Bupati', email: 'ajudan.wabup@simpro.local', pass: 'Simpro#Wabup2026', badge: 'bg-teal-100 text-teal-800'},
  {role: 'Tim Protokol', email: 'protokol@simpro.local', pass: 'Simpro#Protokol2026', badge: 'bg-amber-100 text-amber-900'},
  {role: 'Tim Dokumentasi', email: 'dokumentasi@simpro.local', pass: 'Simpro#Dok2026', badge: 'bg-violet-100 text-violet-800'},
  {role: 'Tim Pengamanan', email: 'pengamanan@simpro.local', pass: 'Simpro#Pam2026', badge: 'bg-rose-100 text-rose-800'},
  {role: 'Pimpinan / Viewer', email: 'pimpinan@simpro.local', pass: 'Simpro#Viewer2026', badge: 'bg-emerald-100 text-emerald-800'},
];

export const LoginPage: React.FC<LoginPageProps> = ({systemMode, onLoginSuccess}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const [showQaList, setShowQaList] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const profile = await authService.login(email, password);
      onLoginSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal melakukan autentikasi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryLoading(true);
    setRecoveryStatus(null);
    try {
      const msg = await authService.requestPasswordRecovery(recoveryEmail);
      setRecoveryStatus(msg);
    } catch (err) {
      setRecoveryStatus(
        err instanceof Error ? err.message : 'Gagal mengirim permintaan pemulihan.'
      );
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-sky-50 px-4 py-10 sm:px-6 lg:px-8">
      {/* Background Foto Samar Halaman Login */}
      <img
        src="/assets/aistudio/photo_6201715085466603981_w_5753f562.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-top opacity-25"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100/75 via-indigo-50/65 to-amber-100/75 backdrop-blur-[1.5px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-amber-400/20 blur-3xl"
      />

      <div className="relative z-10 mx-auto w-full max-w-md">
        {/* Identitas Resmi Aplikasi */}
        <div className="text-center">
          <div className="mx-auto h-28 w-28 overflow-hidden rounded-2xl border-2 border-sky-200 bg-white shadow-md ring-4 ring-white/70">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_1i6i501i6i501i6i_67b997c4.jpg"
              alt="Logo SIMPRO"
              className="h-full w-full scale-[1.22] object-cover object-center"
            />
          </div>
          <h1 className="sr-only">SIMPRO</h1>
          <p className="mt-3.5 text-sm font-bold text-[#0F294A]">
            Sistem Informasi Monitoring Protokoler
          </p>
          <p className="mt-1 text-xs font-semibold text-teal-800">
            Satu Informasi, Satu Koordinasi, Tepat Waktu.
          </p>
        </div>

        {/* Informasi Mode Backend */}
        {systemMode && (
          <div
            className={`mt-6 rounded-xl border px-4 py-3 text-xs shadow-xs backdrop-blur-xs ${
              systemMode.supabaseConfigured
                ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950'
                : 'border-sky-300 bg-gradient-to-r from-sky-50 via-cyan-50 to-indigo-50 text-sky-950'
            }`}
          >
            {systemMode.supabaseConfigured ? (
              <p>
                <strong>Terhubung ke Supabase:</strong> Autentikasi dan kontrol akses RLS berjalan
                melalui proyek Supabase yang dikonfigurasi.
              </p>
            ) : (
              <p>
                <strong>Mode Lokal Terisolasi (Konfigurasi Uji Internal):</strong> Kredensial
                Supabase belum diisi pada environment. Sistem berjalan dengan database SQLite lokal
                dan akun uji peran (bukan lingkungan produksi).
              </p>
            )}
          </div>
        )}

        {/* Kartu Login */}
        <div className="mt-5 overflow-hidden rounded-xl border border-sky-200/90 bg-white/95 shadow-lg backdrop-blur-sm">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#0F294A] via-sky-500 to-teal-500" />
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-sky-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-[#0F294A]">Masuk Akun Individual</h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Pendaftaran publik dinonaktifkan. Akun diterbitkan oleh Admin SIMPRO.
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Lock className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {!recoveryOpen ? (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700">
                    Email Dinas
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@instansi.go.id"
                    className="mt-1.5 block w-full rounded-lg border border-sky-200 bg-sky-50/30 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Kata Sandi
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryOpen(true);
                        setRecoveryStatus(null);
                        setError(null);
                      }}
                      className="text-xs font-semibold text-sky-700 hover:text-indigo-800 hover:underline"
                    >
                      Lupa kata sandi?
                    </button>
                  </div>
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="mt-1.5 block w-full rounded-lg border border-sky-200 bg-sky-50/30 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-gradient-to-r from-[#0F294A] via-[#1D4ED8] to-[#0284C7] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {submitting ? 'Memverifikasi Kredensial...' : 'Masuk ke SIMPRO'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRecovery} className="mt-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F294A]">
                  <KeyRound className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <span>Pemulihan Kata Sandi</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600">
                  Masukkan email akun Anda. Permintaan akan dicatat ke sistem untuk ditindaklanjuti
                  oleh Administrator SIMPRO sesuai prosedur verifikasi instansi.
                </p>
                <div>
                  <label htmlFor="rec-email" className="block text-xs font-semibold text-slate-700">
                    Email Terdaftar
                  </label>
                  <input
                    id="rec-email"
                    type="email"
                    required
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="nama@simpro.local"
                    className="mt-1.5 block w-full rounded-lg border border-sky-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                  />
                </div>

                {recoveryStatus && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-950">
                    {recoveryStatus}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRecoveryOpen(false)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Kembali ke Login
                  </button>
                  <button
                    type="submit"
                    disabled={recoveryLoading}
                    className="flex-1 rounded-lg bg-gradient-to-r from-[#0F294A] to-[#0284C7] py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {recoveryLoading ? 'Mengirim...' : 'Kirim Permintaan'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Daftar Akun Uji Peran (Hanya muncul pada Mode Uji Lokal Non-Produksi) */}
        {systemMode && systemMode.isNonProductionTestSeed && (
          <div className="mt-4 overflow-hidden rounded-xl border border-indigo-200 bg-white/95 shadow-xs backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setShowQaList((v) => !v)}
              className="flex w-full items-center justify-between bg-gradient-to-r from-indigo-50/70 to-sky-50/70 px-4 py-3 text-left text-xs font-semibold text-[#0F294A] hover:brightness-95"
            >
              <span>Daftar Akun Uji Internal Per Role (Non-Produksi)</span>
              {showQaList ? (
                <ChevronUp className="h-4 w-4 text-indigo-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-indigo-600" />
              )}
            </button>

            {showQaList && (
              <div className="border-t border-indigo-100 px-4 py-3">
                <p className="mb-2 text-[11px] text-slate-600">
                  Klik salah satu akun uji untuk mengisi formulir login (untuk verifikasi RBAC
                  setiap role):
                </p>
                <div className="divide-y divide-slate-100">
                  {LOCAL_QA_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => {
                        setEmail(acc.email);
                        setPassword(acc.pass);
                        setRecoveryOpen(false);
                        setError(null);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-sky-50"
                    >
                      <span className={`rounded px-2 py-0.5 font-semibold ${acc.badge}`}>
                        {acc.role}
                      </span>
                      <span className="font-mono text-[11px] text-slate-700">{acc.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-[11px] font-semibold leading-relaxed text-[#0F294A]/90">
          SIMPRO adalah alat koordinasi internal dan tidak menggantikan instruksi kedinasan, SOP
          protokoler/pengamanan, maupun kanal komunikasi darurat.
        </p>
      </div>
    </div>
  );
};
