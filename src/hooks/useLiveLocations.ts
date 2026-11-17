import {useCallback, useEffect, useRef, useState} from 'react';
import {clientPermissions} from '../lib/rbac.ts';
import {sessionToken} from '../lib/sessionToken.ts';
import {dataService} from '../services/dataService.ts';
import {offlineDb} from '../services/offlineDb.ts';
import type {LeaderCode, LiveLocationRecord, UserProfile} from '../types/simpro.ts';

interface BroadcastOptions {
  locationText?: string;
  status?: string;
  approvedForSecurity?: boolean;
}

export function useLiveLocations(user: UserProfile | null, isOnline: boolean) {
  const [liveLocations, setLiveLocations] = useState<LiveLocationRecord[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // State khusus Ajudan untuk berbagi live location perangkat (watchPosition)
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastMeta, setBroadcastMeta] = useState<BroadcastOptions>({
    approvedForSecurity: true,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const broadcastMetaRef = useRef<BroadcastOptions>(broadcastMeta);

  useEffect(() => {
    broadcastMetaRef.current = broadcastMeta;
  }, [broadcastMeta]);

  const assignedLeader: LeaderCode | null = user
    ? clientPermissions.getAssignedLeader(user.role)
    : null;

  const refreshLiveLocations = useCallback(async () => {
    if (!user) return;
    try {
      const items = await dataService.fetchLiveLocations(isOnline);
      setLiveLocations(items);
      setLastSyncedAt(new Date().toISOString());
    } catch {
      // Pertahankan cache/state terakhir bila permintaan gagal
    }
  }, [user, isOnline]);

  // Muat snapshot awal dari API/cache
  useEffect(() => {
    if (!user) {
      setLiveLocations([]);
      setWsConnected(false);
      return;
    }
    refreshLiveLocations();
  }, [user, refreshLiveLocations]);

  // Koneksi WebSocket real-time untuk sinkronisasi live location
  useEffect(() => {
    if (!user || !isOnline || typeof window === 'undefined') {
      setWsConnected(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = sessionToken.get();
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const wsUrl = `${protocol}//${window.location.host}/ws/live-location${qs}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        attempt = 0;
        setWsConnected(true);
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({type: 'ping'}));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as {
            type?: string;
            locations?: LiveLocationRecord[];
            location?: LiveLocationRecord;
            leader?: LeaderCode;
          };

          if (data.type === 'live_location:snapshot' && Array.isArray(data.locations)) {
            setLiveLocations(data.locations);
            setLastSyncedAt(new Date().toISOString());
            offlineDb.saveSnapshot('live_locations', data.locations).catch(() => {});
          } else if (data.type === 'live_location:update' && data.location) {
            const incoming = data.location;
            setLiveLocations((prev) => {
              const idx = prev.findIndex((item) => item.leader === incoming.leader);
              const next =
                idx >= 0
                  ? prev.map((item, i) => (i === idx ? incoming : item))
                  : [...prev, incoming];
              offlineDb.saveSnapshot('live_locations', next).catch(() => {});
              return next;
            });
            setLastSyncedAt(new Date().toISOString());
          } else if (data.type === 'live_location:removed' && data.leader) {
            setLiveLocations((prev) => {
              const next = prev.filter((item) => item.leader !== data.leader);
              offlineDb.saveSnapshot('live_locations', next).catch(() => {});
              return next;
            });
          }
        } catch {
          // Abaikan payload tidak dikenal
        }
      };

      ws.onclose = () => {
        if (pingTimer !== null) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setWsConnected(false);
        if (!cancelled) {
          attempt += 1;
          const delay = Math.min(1500 * Math.pow(1.6, attempt - 1), 10000);
          reconnectTimer = window.setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // Handler onclose akan menangani rekoneksi
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (pingTimer !== null) window.clearInterval(pingTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [user, isOnline]);

  const stopBroadcasting = useCallback(async () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsBroadcasting(false);

    if (!assignedLeader || !isOnline) return;

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: 'live_location:stop', leader: assignedLeader}));
    } else {
      await dataService.stopLiveLocation(assignedLeader).catch(() => {});
    }
  }, [assignedLeader, isOnline]);

  const sendPosition = useCallback(
    async (coords: {
      latitude: number;
      longitude: number;
      accuracy_m: number | null;
      heading: number | null;
      speed_mps: number | null;
    }) => {
      if (!assignedLeader) return;
      const meta = broadcastMetaRef.current;
      const payload = {
        leader: assignedLeader,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_m: coords.accuracy_m,
        heading: coords.heading,
        speed_mps: coords.speed_mps,
        location_text: meta.locationText,
        status: meta.status,
        is_live_streaming: true,
        approved_for_security: meta.approvedForSecurity !== false,
      };

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'live_location:publish', ...payload}));
      } else if (isOnline) {
        try {
          const updated = await dataService.publishLiveLocation(payload);
          setLiveLocations((prev) => {
            const idx = prev.findIndex((item) => item.leader === updated.leader);
            return idx >= 0 ? prev.map((item, i) => (i === idx ? updated : item)) : [...prev, updated];
          });
        } catch (err) {
          setBroadcastError(
            err instanceof Error ? err.message : 'Gagal mengirim koordinat live location.'
          );
        }
      }
    },
    [assignedLeader, isOnline]
  );

  const startBroadcasting = useCallback(
    (options?: BroadcastOptions) => {
      if (!assignedLeader) {
        setBroadcastError('Hanya Ajudan Bupati atau Ajudan Wakil Bupati yang dapat membagikan live location.');
        return;
      }
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setBroadcastError('Peramban atau perangkat ini tidak mendukung Geolocation.');
        return;
      }

      if (options) {
        setBroadcastMeta((prev) => ({...prev, ...options}));
      }

      setBroadcastError(null);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      setIsBroadcasting(true);
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          setBroadcastError(null);
          sendPosition({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
            heading:
              typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading)
                ? pos.coords.heading
                : null,
            speed_mps:
              typeof pos.coords.speed === 'number' && Number.isFinite(pos.coords.speed)
                ? pos.coords.speed
                : null,
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setBroadcastError(
              'Izin lokasi ditolak oleh pengguna/browser. Aktifkan izin lokasi untuk membagikan live location.'
            );
            stopBroadcasting();
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setBroadcastError('Sinyal GPS sedang tidak tersedia. Mencoba memperoleh sinyal ulang...');
          } else {
            setBroadcastError('Waktu pengambilan sinyal GPS habis. Tetap menunggu pembaruan posisi...');
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 15000,
        }
      );
      watchIdRef.current = id;
    },
    [assignedLeader, sendPosition, stopBroadcasting]
  );

  // Hentikan watchPosition otomatis bila user logout
  useEffect(() => {
    if (!user && watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsBroadcasting(false);
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    liveLocations,
    wsConnected,
    lastSyncedAt,
    assignedLeader,
    isBroadcasting,
    broadcastError,
    setBroadcastMeta,
    startBroadcasting,
    stopBroadcasting,
    refreshLiveLocations,
  };
}
