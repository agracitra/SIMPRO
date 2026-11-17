import type {
  AgendaHistoryItem,
  AgendaItem,
  AgendaStatus,
  AppSettings,
  AuditLogItem,
  LeaderAttendance,
  LeaderCode,
  LeaderUpdateItem,
  LiveLocationRecord,
  NotificationItem,
  UserProfile,
  UserRole,
} from '../types/simpro.ts';
import {sessionToken} from '../lib/sessionToken.ts';
import {offlineDb} from './offlineDb.ts';

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const token = sessionToken.get();
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Permintaan server gagal (${res.status})`);
  }
  return data as T;
}

export const dataService = {
  async fetchSettings(isOnline: boolean): Promise<AppSettings | null> {
    if (isOnline) {
      try {
        const res = await apiRequest<{settings: AppSettings}>('/api/settings');
        await offlineDb.saveSnapshot('settings', res.settings);
        return res.settings;
      } catch (err) {
        const cached = await offlineDb.loadSnapshot<AppSettings>('settings');
        if (cached) return cached.payload;
        throw err;
      }
    }
    const cached = await offlineDb.loadSnapshot<AppSettings>('settings');
    return cached?.payload ?? null;
  },

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const res = await apiRequest<{settings: AppSettings}>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await offlineDb.saveSnapshot('settings', res.settings);
    return res.settings;
  },

  async fetchAgendas(isOnline: boolean): Promise<{items: AgendaItem[]; fromCache: boolean; cachedAt?: string}> {
    if (isOnline) {
      try {
        const res = await apiRequest<{agendas: AgendaItem[]}>('/api/agendas');
        await offlineDb.saveSnapshot('agendas', res.agendas);
        return {items: res.agendas, fromCache: false};
      } catch (err) {
        const cached = await offlineDb.loadSnapshot<AgendaItem[]>('agendas');
        if (cached) return {items: cached.payload, fromCache: true, cachedAt: cached.cached_at};
        throw err;
      }
    }
    const cached = await offlineDb.loadSnapshot<AgendaItem[]>('agendas');
    return {items: cached?.payload ?? [], fromCache: true, cachedAt: cached?.cached_at};
  },

  async fetchAgendaHistories(agendaId?: string): Promise<AgendaHistoryItem[]> {
    const qs = agendaId ? `?agendaId=${encodeURIComponent(agendaId)}` : '';
    const res = await apiRequest<{histories: AgendaHistoryItem[]}>(`/api/agendas/histories${qs}`);
    return res.histories;
  },

  async createAgenda(payload: {
    leader: LeaderCode;
    title: string;
    starts_at: string;
    location: string;
    pic: string;
    notes: string;
    documentation_notes?: string;
    status?: AgendaStatus;
    leader_attendance?: LeaderAttendance;
    attendance_note?: string;
    approved_for_security?: boolean;
  }): Promise<AgendaItem> {
    const res = await apiRequest<{agenda: AgendaItem}>('/api/agendas', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.agenda;
  },

  async updateAgenda(
    id: string,
    payload: Partial<{
      leader: LeaderCode;
      title: string;
      starts_at: string;
      location: string;
      pic: string;
      notes: string;
      documentation_notes: string;
      status: AgendaStatus;
      leader_attendance: LeaderAttendance;
      attendance_note: string;
      approved_for_security: boolean;
      change_reason: string;
    }>
  ): Promise<AgendaItem> {
    const res = await apiRequest<{agenda: AgendaItem}>(`/api/agendas/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res.agenda;
  },

  async deleteAgenda(id: string): Promise<void> {
    await apiRequest<{ok: boolean}>(`/api/agendas/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async fetchLeaderUpdates(
    isOnline: boolean
  ): Promise<{items: LeaderUpdateItem[]; fromCache: boolean; cachedAt?: string}> {
    if (isOnline) {
      try {
        const res = await apiRequest<{updates: LeaderUpdateItem[]}>('/api/updates');
        await offlineDb.saveSnapshot('leader_updates', res.updates);
        return {items: res.updates, fromCache: false};
      } catch (err) {
        const cached = await offlineDb.loadSnapshot<LeaderUpdateItem[]>('leader_updates');
        if (cached) return {items: cached.payload, fromCache: true, cachedAt: cached.cached_at};
        throw err;
      }
    }
    const cached = await offlineDb.loadSnapshot<LeaderUpdateItem[]>('leader_updates');
    return {items: cached?.payload ?? [], fromCache: true, cachedAt: cached?.cached_at};
  },

  async fetchLiveLocations(isOnline: boolean): Promise<LiveLocationRecord[]> {
    if (isOnline) {
      try {
        const res = await apiRequest<{locations: LiveLocationRecord[]}>('/api/live-locations');
        await offlineDb.saveSnapshot('live_locations', res.locations);
        return res.locations;
      } catch (err) {
        const cached = await offlineDb.loadSnapshot<LiveLocationRecord[]>('live_locations');
        if (cached) return cached.payload;
        throw err;
      }
    }
    const cached = await offlineDb.loadSnapshot<LiveLocationRecord[]>('live_locations');
    return cached?.payload ?? [];
  },

  async publishLiveLocation(payload: {
    leader: LeaderCode;
    latitude: number;
    longitude: number;
    accuracy_m?: number | null;
    heading?: number | null;
    speed_mps?: number | null;
    location_text?: string;
    status?: string;
    is_live_streaming?: boolean;
    approved_for_security?: boolean;
  }): Promise<LiveLocationRecord> {
    const res = await apiRequest<{location: LiveLocationRecord}>('/api/live-locations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.location;
  },

  async stopLiveLocation(leader: LeaderCode): Promise<LiveLocationRecord | null> {
    const res = await apiRequest<{ok: boolean; location: LiveLocationRecord | null}>(
      '/api/live-locations/stop',
      {
        method: 'POST',
        body: JSON.stringify({leader}),
      }
    );
    return res.location;
  },

  async fetchNotifications(isOnline: boolean): Promise<NotificationItem[]> {
    if (!isOnline) {
      const cached = await offlineDb.loadSnapshot<NotificationItem[]>('notifications');
      return cached?.payload ?? [];
    }
    const res = await apiRequest<{notifications: NotificationItem[]}>('/api/notifications');
    await offlineDb.saveSnapshot('notifications', res.notifications);
    return res.notifications;
  },

  async markNotificationRead(id: string): Promise<void> {
    await apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, {method: 'PATCH'});
  },

  async markAllNotificationsRead(): Promise<void> {
    await apiRequest('/api/notifications/read-all', {method: 'POST'});
  },

  async logReportExport(reportType: string, format: 'csv' | 'print', recordCount: number): Promise<void> {
    await apiRequest('/api/reports/export-log', {
      method: 'POST',
      body: JSON.stringify({report_type: reportType, format, record_count: recordCount}),
    });
  },

  // Admin APIs
  async fetchUsers(): Promise<UserProfile[]> {
    const res = await apiRequest<{users: UserProfile[]}>('/api/admin/users');
    return res.users;
  },

  async createUser(payload: {
    full_name: string;
    email: string;
    password: string;
    role: UserRole;
    is_active: boolean;
  }): Promise<UserProfile> {
    const res = await apiRequest<{user: UserProfile}>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.user;
  },

  async updateUser(
    id: string,
    payload: Partial<{
      full_name: string;
      role: UserRole;
      is_active: boolean;
      new_password: string;
    }>
  ): Promise<UserProfile> {
    const res = await apiRequest<{user: UserProfile}>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res.user;
  },

  async fetchAuditLogs(): Promise<AuditLogItem[]> {
    const res = await apiRequest<{logs: AuditLogItem[]}>('/api/admin/audit-logs');
    return res.logs;
  },

  async fetchMigrationSql(): Promise<{filename: string; sql: string}> {
    return await apiRequest<{filename: string; sql: string}>('/api/admin/migration-sql');
  },

  async downloadBackup(): Promise<Record<string, unknown>> {
    return await apiRequest<Record<string, unknown>>('/api/admin/backup');
  },

  async verifyBackup(snapshot: unknown): Promise<{
    valid: boolean;
    message?: string;
    error?: string;
    verified_counts?: Record<string, number>;
  }> {
    return await apiRequest('/api/admin/backup/verify', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    });
  },
};
