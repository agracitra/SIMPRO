import type {OfflineQueuedUpdate} from '../types/simpro.ts';

const DB_NAME = 'simpro_offline_db';
const DB_VERSION = 1;
const STORE_QUEUE = 'update_queue';
const STORE_CACHE = 'cached_snapshots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia pada peramban ini.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, {keyPath: 'client_update_id'});
        store.createIndex('sync_status', 'sync_status', {unique: false});
        store.createIndex('client_created_at', 'client_created_at', {unique: false});
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, {keyPath: 'key'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB.'));
  });
}

export const offlineDb = {
  async getAllQueuedUpdates(): Promise<OfflineQueuedUpdate[]> {
    try {
      const db = await openDb();
      return await new Promise<OfflineQueuedUpdate[]>((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readonly');
        const req = tx.objectStore(STORE_QUEUE).getAll();
        req.onsuccess = () => {
          const items = (req.result as OfflineQueuedUpdate[]) || [];
          items.sort(
            (a, b) =>
              new Date(b.client_created_at).getTime() - new Date(a.client_created_at).getTime()
          );
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      const raw = localStorage.getItem('simpro_fallback_queue');
      return raw ? (JSON.parse(raw) as OfflineQueuedUpdate[]) : [];
    }
  },

  async putQueuedUpdate(item: OfflineQueuedUpdate): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        tx.objectStore(STORE_QUEUE).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      const existing = await this.getAllQueuedUpdates();
      const idx = existing.findIndex((i) => i.client_update_id === item.client_update_id);
      if (idx >= 0) existing[idx] = item;
      else existing.unshift(item);
      localStorage.setItem('simpro_fallback_queue', JSON.stringify(existing));
    }
  },

  async saveSnapshot<T>(key: string, payload: T): Promise<void> {
    const record = {key, payload, cached_at: new Date().toISOString()};
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readwrite');
        tx.objectStore(STORE_CACHE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      localStorage.setItem(`simpro_cache_${key}`, JSON.stringify(record));
    }
  },

  async loadSnapshot<T>(key: string): Promise<{payload: T; cached_at: string} | null> {
    try {
      const db = await openDb();
      return await new Promise<{payload: T; cached_at: string} | null>((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readonly');
        const req = tx.objectStore(STORE_CACHE).get(key);
        req.onsuccess = () => resolve((req.result as {payload: T; cached_at: string}) || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      const raw = localStorage.getItem(`simpro_cache_${key}`);
      return raw ? (JSON.parse(raw) as {payload: T; cached_at: string}) : null;
    }
  },
};
