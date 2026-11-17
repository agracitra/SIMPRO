import {useCallback, useEffect, useState} from 'react';
import {offlineDb} from '../services/offlineDb.ts';
import {syncService} from '../services/syncService.ts';
import type {OfflineQueuedUpdate} from '../types/simpro.ts';

export function useSyncQueue(isOnline: boolean, userId: string | null, onSyncedCallback?: () => void) {
  const [queue, setQueue] = useState<OfflineQueuedUpdate[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState<string | null>(null);

  const reloadQueue = useCallback(async () => {
    const all = await offlineDb.getAllQueuedUpdates();
    setQueue(all);
  }, []);

  const runSync = useCallback(async () => {
    if (!isOnline || !userId || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncService.syncPendingQueue();
      await reloadQueue();
      if (res.attempted > 0) {
        setLastSyncSummary(
          `Sinkronisasi: ${res.succeeded} berhasil${res.failed > 0 ? `, ${res.failed} gagal` : ''}.`
        );
        if (res.succeeded > 0 && onSyncedCallback) {
          onSyncedCallback();
        }
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, userId, isSyncing, reloadQueue, onSyncedCallback]);

  useEffect(() => {
    reloadQueue();
  }, [reloadQueue]);

  // Otomatis sinkron ketika kembali online dan pengguna sudah login
  useEffect(() => {
    if (isOnline && userId) {
      runSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, userId]);

  const unsyncedCount = queue.filter(
    (item) => item.sync_status !== 'Berhasil tersinkron'
  ).length;

  return {
    queue,
    unsyncedCount,
    isSyncing,
    lastSyncSummary,
    reloadQueue,
    runSync,
  };
}
