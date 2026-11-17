import React, {useState} from 'react';
import {
  Activity,
  Bell,
  CalendarDays,
  FileBarChart2,
  FilePlus2,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  Settings,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {ROLE_LABELS, type SystemModeInfo, type UserProfile} from '../types/simpro.ts';
import {PWAInstallButton} from './PWAInstallButton.tsx';

export type NavKey =
  | 'dashboard'
  | 'map'
  | 'agenda'
  | 'input_agenda'
  | 'updates'
  | 'history'
  | 'notifications'
  | 'reports'
  | 'users'
  | 'settings';

interface LayoutProps {
  user: UserProfile;
  activeNav: NavKey;
  onSelectNav: (nav: NavKey) => void;
  onLogout: () => void;
  isOnline: boolean;
  simulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  unsyncedCount: number;
  unreadNotificationsCount: number;
  isSyncing: boolean;
  onManualSync: () => void;
  systemMode: SystemModeInfo | null;
  children: React.ReactNode;
}

const NAV_ACCENTS: Record<NavKey, {iconColor: string; activeBg: string; badgeBg?: string}> = {
  dashboard: {
    iconColor: 'text-sky-300',
    activeBg: 'bg-gradient-to-r from-sky-500/30 via-blue-500/20 to-transparent ring-1 ring-sky-300/40',
  },
  map: {
    iconColor: 'text-emerald-300',
    activeBg: 'bg-gradient-to-r from-emerald-500/30 via-teal-500/20 to-transparent ring-1 ring-emerald-300/40',
  },
  agenda: {
    iconColor: 'text-violet-300',
    activeBg: 'bg-gradient-to-r from-violet-500/30 via-indigo-500/20 to-transparent ring-1 ring-violet-300/40',
  },
  input_agenda: {
    iconColor: 'text-amber-300',
    activeBg: 'bg-gradient-to-r from-amber-500/30 via-orange-500/20 to-transparent ring-1 ring-amber-300/40',
  },
  updates: {
    iconColor: 'text-cyan-300',
    activeBg: 'bg-gradient-to-r from-cyan-500/30 via-sky-500/20 to-transparent ring-1 ring-cyan-300/40',
  },
  history: {
    iconColor: 'text-rose-300',
    activeBg: 'bg-gradient-to-r from-rose-500/30 via-pink-500/20 to-transparent ring-1 ring-rose-300/40',
  },
  notifications: {
    iconColor: 'text-orange-300',
    activeBg: 'bg-gradient-to-r from-orange-500/30 via-amber-500/20 to-transparent ring-1 ring-orange-300/40',
  },
  reports: {
    iconColor: 'text-teal-300',
    activeBg: 'bg-gradient-to-r from-teal-500/30 via-emerald-500/20 to-transparent ring-1 ring-teal-300/40',
  },
  users: {
    iconColor: 'text-fuchsia-300',
    activeBg: 'bg-gradient-to-r from-fuchsia-500/30 via-purple-500/20 to-transparent ring-1 ring-fuchsia-300/40',
  },
  settings: {
    iconColor: 'text-indigo-200',
    activeBg: 'bg-gradient-to-r from-indigo-500/30 via-blue-500/20 to-transparent ring-1 ring-indigo-300/40',
  },
};

export const Layout: React.FC<LayoutProps> = ({
  user,
  activeNav,
  onSelectNav,
  onLogout,
  isOnline,
  simulatedOffline,
  onToggleSimulatedOffline,
  unsyncedCount,
  unreadNotificationsCount,
  isSyncing,
  onManualSync,
  systemMode,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{
    key: NavKey;
    label: string;
    icon: React.FC<{className?: string}>;
    badge?: number;
    adminOnly?: boolean;
  }> = [
    {key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard},
    {key: 'map', label: 'Peta Live', icon: MapPin},
    {key: 'agenda', label: 'Agenda', icon: CalendarDays},
    {key: 'input_agenda', label: 'Input Agenda', icon: FilePlus2},
    {key: 'updates', label: 'Pembaruan Status', icon: Activity, badge: unsyncedCount || undefined},
    {key: 'history', label: 'Riwayat', icon: History},
    {
      key: 'notifications',
      label: 'Notifikasi',
      icon: Bell,
      badge: unreadNotificationsCount || undefined,
    },
    {key: 'reports', label: 'Laporan', icon: FileBarChart2},
    {key: 'users', label: 'Manajemen Pengguna', icon: Users, adminOnly: true},
    {key: 'settings', label: 'Pengaturan', icon: Settings, adminOnly: true},
  ];

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user.role === 'admin');
  const activeNavLabel = visibleNavItems.find((i) => i.key === activeNav)?.label || 'Dashboard';

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#0C2340] via-[#133868] to-[#0E4D7A] text-slate-100">
      {/* Brand */}
      <div className="flex items-center justify-between border-b border-amber-300/20 bg-white/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-sky-200/50 bg-white shadow-sm">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_1i6i501i6i501i6i_67b997c4.jpg"
              alt="Logo SIMPRO"
              className="h-full w-full scale-[1.28] object-cover object-center"
            />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-white">SIMPRO</div>
            <div className="text-[11px] font-medium text-sky-200">Monitoring Protokoler v1.0</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-md p-1 text-slate-300 hover:bg-white/10 lg:hidden"
          aria-label="Tutup menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigasi Utama */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4" aria-label="Navigasi utama">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.key;
          const accent = NAV_ACCENTS[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onSelectNav(item.key);
                setMobileMenuOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all whitespace-nowrap ${
                active
                  ? `${accent.activeBg} text-white shadow-xs`
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? accent.iconColor : `${accent.iconColor} opacity-85`}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="rounded-md bg-gradient-to-r from-amber-400 to-orange-400 px-1.5 py-0.5 text-[11px] font-bold text-slate-950 shadow-xs tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Informasi Akun Individual */}
      <div className="border-t border-white/15 bg-black/15 p-4">
        <div className="text-xs font-semibold text-white truncate">{user.full_name}</div>
        <div className="mt-0.5 text-xs font-semibold text-amber-300 truncate">
          {ROLE_LABELS[user.role]}
        </div>
        <div className="mt-0.5 text-[11px] text-sky-200/80 truncate">{user.email}</div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300/30 bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-100 transition-colors hover:bg-rose-500/35 whitespace-nowrap"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Keluar Sesi
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/45 to-indigo-50/40 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden w-64 shrink-0 shadow-md lg:block">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-64 max-w-[85vw] shadow-xl">{renderSidebarContent()}</div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar (3 Zona) */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-sky-200/80 bg-gradient-to-r from-white via-sky-50/55 to-indigo-50/45 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-sky-200 bg-white p-2 text-[#0F294A] hover:bg-sky-50 lg:hidden"
              aria-label="Buka menu navigasi"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-bold text-[#0F294A] whitespace-nowrap">SIMPRO</span>
              <span className="text-sky-400" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-indigo-950 truncate">{activeNavLabel}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Indikator Koneksi & Antrean Offline */}
            <button
              type="button"
              onClick={onToggleSimulatedOffline}
              title="Klik untuk menguji mode offline / koneksi terputus"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isOnline
                  ? 'border-emerald-300 bg-emerald-100/80 text-emerald-900 hover:bg-emerald-200/80'
                  : 'border-rose-300 bg-rose-100/85 text-rose-900 hover:bg-rose-200/85'
              }`}
            >
              {isOnline ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-rose-700" aria-hidden="true" />
              )}
              <span>{isOnline ? 'Online' : simulatedOffline ? 'OFFLINE (Uji)' : 'OFFLINE'}</span>
            </button>

            {unsyncedCount > 0 && (
              <button
                type="button"
                disabled={!isOnline || isSyncing}
                onClick={onManualSync}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-100 to-orange-100 px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:brightness-95 disabled:opacity-60 whitespace-nowrap shrink-0 tabular-nums"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-amber-800 ${isSyncing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{unsyncedCount} Antrean</span>
              </button>
            )}

            <PWAInstallButton />
          </div>
        </header>

        {/* Peringatan Koneksi Offline */}
        {!isOnline && (
          <div
            role="status"
            className="no-print border-b border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2.5 text-xs text-amber-950 sm:px-6"
          >
            <strong>Mode OFFLINE Aktif:</strong> Aplikasi menampilkan salinan data terakhir di
            perangkat Anda. Pembaruan status baru akan disimpan ke antrean IndexedDB lokal dan{' '}
            <strong>belum diterima oleh perangkat anggota lain</strong> sebelum sinkronisasi ke
            server berhasil.
          </div>
        )}

        {/* Penanda Mode Lokal Terisolasi vs Supabase */}
        {systemMode && !systemMode.supabaseConfigured && (
          <div className="no-print border-b border-sky-200 bg-gradient-to-r from-sky-50 via-cyan-50/70 to-indigo-50/60 px-4 py-2 text-xs text-sky-950 sm:px-6">
            <strong>Lingkungan Uji Lokal (Supabase Belum Dikonfigurasi):</strong> Sistem menggunakan
            database SQLite lokal terisolasi dan data uji internal (bukan data lokasi produksi).
          </div>
        )}

        {/* Konten Halaman */}
        <main className="print-container flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
};
