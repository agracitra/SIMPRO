import React from 'react';
import {Bell, CheckCheck, Info} from 'lucide-react';
import {formatDateTimeId} from '../lib/formatters.ts';
import {dataService} from '../services/dataService.ts';
import type {NotificationItem} from '../types/simpro.ts';

interface NotificationsPageProps {
  notifications: NotificationItem[];
  isOnline: boolean;
  onChanged: () => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({
  notifications,
  isOnline,
  onChanged,
}) => {
  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  const handleMarkRead = async (id: string) => {
    if (!isOnline) return;
    await dataService.markNotificationRead(id);
    onChanged();
  };

  const handleMarkAllRead = async () => {
    if (!isOnline) return;
    await dataService.markAllNotificationsRead();
    onChanged();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-orange-200/80 bg-gradient-to-r from-[#0F294A] via-[#C2410C] to-[#F59E0B] px-6 py-5 text-white shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Notifikasi Internal Aplikasi
          </h2>
          <p className="mt-0.5 text-sm text-orange-50">
            Pemberitahuan perubahan agenda, pembatalan, perubahan lokasi, dan pembaruan status
            penting sesuai kewenangan role Anda.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            disabled={!isOnline}
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-[#0F294A] shadow-xs hover:bg-orange-50 disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5 text-orange-700" aria-hidden="true" />
            Tandai Semua Dibaca ({unreadCount})
          </button>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 via-cyan-50/70 to-amber-50/50 px-4 py-3 text-xs text-sky-950">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
        <span>
          <strong>Status Kanal Notifikasi:</strong> Notifikasi internal aplikasi aktif dan disaring
          berdasarkan role pengguna. Kanal notifikasi eksternal (WhatsApp/Email/Push gateway) belum
          dikonfigurasi pada v1.0 dan menunggu persetujuan instansi.
        </span>
      </div>

      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-orange-200/80 bg-white shadow-xs">
        {notifications.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Bell className="mx-auto h-8 w-8 text-orange-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              Belum ada notifikasi untuk akun Anda.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Notifikasi otomatis dikirim ketika terjadi perubahan agenda atau pembaruan status
              penting.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`flex flex-wrap items-start justify-between gap-4 px-5 py-4 transition-colors ${
                n.status === 'unread'
                  ? 'bg-gradient-to-r from-amber-50/85 via-orange-50/45 to-sky-50/45'
                  : 'bg-white hover:bg-slate-50/60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-[#0F294A]">{n.type}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{formatDateTimeId(n.created_at)}</span>
                  {n.status === 'unread' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-amber-800">Belum dibaca</span>
                    </>
                  )}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{n.title}</div>
                <p className="mt-0.5 text-xs text-slate-700">{n.message}</p>
              </div>

              {n.status === 'unread' && (
                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={() => handleMarkRead(n.id)}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Tandai Dibaca
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
