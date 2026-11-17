import type {LeaderCode, LeaderUpdateItem, OfflineQueuedUpdate} from '../types/simpro.ts';
import {sessionToken} from '../lib/sessionToken.ts';
import {offlineDb} from './offlineDb.ts';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface SubmitUpdateDraft {
  leader: LeaderCode;
  status: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  gps_captured_at: string | null;
  note: string;
  approved_for_security?: boolean;
  author_id: string;
  author_name: string;
}

export const syncService = {
  async enqueueAndTrySync(
    draft: SubmitUpdateDraft,
    isOnline: boolean
  ): Promise<{queuedItem: OfflineQueuedUpdate; synced: boolean; error?: string}> {
    const item: OfflineQueuedUpdate = {
      client_update_id: generateUuid(),
      leader: draft.leader,
      status: draft.status,
      location_text: draft.location_text,
      latitude: draft.latitude,
      longitude: draft.longitude,
      accuracy_m: draft.accuracy_m,
      gps_captured_at: draft.gps_captured_at,
      note: draft.note,
      approved_for_security: draft.approved_for_security !== false,
      client_created_at: new Date().toISOString(),
      server_received_at: null,
      sync_status: isOnline ? 'Menunggu sinkronisasi' : 'Tersimpan di perangkat',
      retry_count: 0,
      last_error: null,
      author_id: draft.author_id,
      author_name: draft.author_name,
    };

    // Simpan ke IndexedDB terlebih dahulu agar tidak pernah hilang jika jaringan terputus di tengah jalan
    await offlineDb.putQueuedUpdate(item);

    if (!isOnline) {
      return {queuedItem: item, synced: false};
    }

    const result = await this.syncSingleItem(item);
    return {
      queuedItem: result.updatedItem,
      synced: result.ok,
      error: result.error,
    };
  },

  async syncSingleItem(
    item: OfflineQueuedUpdate
  ): Promise<{ok: boolean; updatedItem: OfflineQueuedUpdate; error?: string}> {
    const pendingItem: OfflineQueuedUpdate = {
      ...item,
      sync_status: 'Menunggu sinkronisasi',
    };
    await offlineDb.putQueuedUpdate(pendingItem);

    try {
      const token = sessionToken.get();
      const res = await fetch('/api/updates', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({
          leader: item.leader,
          status: item.status,
          location_text: item.location_text,
          latitude: item.latitude,
          longitude: item.longitude,
          accuracy_m: item.accuracy_m,
          gps_captured_at: item.gps_captured_at,
          note: item.note,
          approved_for_security: item.approved_for_security,
          client_update_id: item.client_update_id,
          client_created_at: item.client_created_at,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || `Sinkronisasi gagal (${res.status})`;
        const failed: OfflineQueuedUpdate = {
          ...item,
          sync_status: 'Gagal tersinkron',
          retry_count: item.retry_count + 1,
          last_error: msg,
        };
        await offlineDb.putQueuedUpdate(failed);
        return {ok: false, updatedItem: failed, error: msg};
      }

      const saved = data.update as LeaderUpdateItem | undefined;
      const synced: OfflineQueuedUpdate = {
        ...item,
        sync_status: 'Berhasil tersinkron',
        server_received_at: saved?.server_received_at || new Date().toISOString(),
        last_error: null,
      };
      await offlineDb.putQueuedUpdate(synced);
      return {ok: true, updatedItem: synced};
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Koneksi ke server terputus saat proses sinkronisasi.';
      const failed: OfflineQueuedUpdate = {
        ...item,
        sync_status: 'Gagal tersinkron',
        retry_count: item.retry_count + 1,
        last_error: msg,
      };
      await offlineDb.putQueuedUpdate(failed);
      return {ok: false, updatedItem: failed, error: msg};
    }
  },

  async syncPendingQueue(): Promise<{attempted: number; succeeded: number; failed: number}> {
    const all = await offlineDb.getAllQueuedUpdates();
    const pending = all.filter(
      (i) =>
        i.sync_status === 'Tersimpan di perangkat' ||
        i.sync_status === 'Menunggu sinkronisasi' ||
        i.sync_status === 'Gagal tersinkron'
    );

    if (pending.length === 0) {
      return {attempted: 0, succeeded: 0, failed: 0};
    }

    // Urutkan kronologis dari terlama agar urutan status terjaga
    const ordered = [...pending].sort(
      (a, b) => new Date(a.client_created_at).getTime() - new Date(b.client_created_at).getTime()
    );

    let succeeded = 0;
    let failed = 0;
    for (const item of ordered) {
      const res = await this.syncSingleItem(item);
      if (res.ok) succeeded += 1;
      else failed += 1;
    }

    return {attempted: ordered.length, succeeded, failed};
  },
};
