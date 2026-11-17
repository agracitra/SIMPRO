import type http from 'node:http';
import {WebSocketServer, WebSocket} from 'ws';
import {getSessionCookieName, parseCookies, verifySessionToken} from './auth.ts';
import type {SimproDatabase} from './db.ts';
import {canSubmitLeaderUpdate, filterLiveLocationsForRole} from './rbac.ts';
import {isValidLeader} from '../src/lib/validation.ts';
import type {LeaderCode, LiveLocationRecord, UserProfile} from '../src/types/simpro.ts';

interface ConnectedClient {
  socket: WebSocket;
  user: UserProfile;
}

export interface LiveLocationHub {
  broadcastLocation: (location: LiveLocationRecord) => void;
  close: () => void;
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function isValidCoord(val: unknown, min: number, max: number): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max;
}

export function attachLiveLocationHub(
  httpServer: http.Server,
  db: SimproDatabase
): LiveLocationHub {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/live-location',
  });

  const clients = new Set<ConnectedClient>();

  const broadcastLocation = (location: LiveLocationRecord) => {
    const viewerEnabled = db.getSettings().viewer_enabled;
    for (const client of clients) {
      const freshUser = db.getUserById(client.user.id);
      if (!freshUser || !freshUser.is_active) {
        client.socket.close(4003, 'Akun dinonaktifkan');
        clients.delete(client);
        continue;
      }
      if (freshUser.role === 'pimpinan_viewer' && !viewerEnabled) {
        continue;
      }
      if (freshUser.role === 'pengamanan' && !location.approved_for_security) {
        sendJson(client.socket, {
          type: 'live_location:removed',
          leader: location.leader,
        });
        continue;
      }
      sendJson(client.socket, {
        type: 'live_location:update',
        location,
      });
    }
  };

  wss.on('connection', (socket, req) => {
    const cookies = parseCookies(req.headers.cookie);
    let queryToken: string | null = null;
    try {
      const url = new URL(req.url || '', 'http://localhost');
      queryToken = url.searchParams.get('token');
    } catch {
      queryToken = null;
    }

    const token = cookies[getSessionCookieName()] || queryToken || '';
    const payload = verifySessionToken(token);
    if (!payload) {
      socket.close(4001, 'Autentikasi sesi tidak valid.');
      return;
    }

    const user = db.getUserById(payload.uid);
    if (!user || !user.is_active) {
      socket.close(4003, 'Akun pengguna tidak aktif.');
      return;
    }

    const settings = db.getSettings();
    if (user.role === 'pimpinan_viewer' && !settings.viewer_enabled) {
      socket.close(4003, 'Akses Pimpinan/Viewer dinonaktifkan.');
      return;
    }

    const clientEntry: ConnectedClient = {socket, user};
    clients.add(clientEntry);

    const initialLocations = filterLiveLocationsForRole(db.listLiveLocations(), user.role);
    sendJson(socket, {
      type: 'live_location:snapshot',
      locations: initialLocations,
      server_time: new Date().toISOString(),
    });

    socket.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        sendJson(socket, {type: 'pong', server_time: new Date().toISOString()});
        return;
      }

      if (msg.type === 'live_location:publish') {
        const leader = typeof msg.leader === 'string' ? msg.leader : '';
        if (!isValidLeader(leader)) {
          sendJson(socket, {type: 'live_location:error', error: 'Pimpinan tidak valid.'});
          return;
        }
        if (!canSubmitLeaderUpdate(user.role, leader as LeaderCode)) {
          sendJson(socket, {
            type: 'live_location:error',
            error: `Role ${user.role} tidak berwenang membagikan live location untuk ${leader}.`,
          });
          return;
        }
        if (!isValidCoord(msg.latitude, -90, 90) || !isValidCoord(msg.longitude, -180, 180)) {
          sendJson(socket, {type: 'live_location:error', error: 'Koordinat GPS tidak valid.'});
          return;
        }

        const existing = db.getLiveLocation(leader as LeaderCode);
        const wasStreaming = Boolean(existing?.is_live_streaming);

        const updated = db.upsertLiveLocation({
          leader: leader as LeaderCode,
          latitude: msg.latitude,
          longitude: msg.longitude,
          accuracy_m:
            typeof msg.accuracy_m === 'number' && msg.accuracy_m >= 0 ? msg.accuracy_m : null,
          heading:
            typeof msg.heading === 'number' && Number.isFinite(msg.heading) ? msg.heading : null,
          speed_mps:
            typeof msg.speed_mps === 'number' && msg.speed_mps >= 0 ? msg.speed_mps : null,
          location_text:
            typeof msg.location_text === 'string' ? msg.location_text : undefined,
          status: typeof msg.status === 'string' ? msg.status : undefined,
          is_live_streaming: true,
          approved_for_security:
            typeof msg.approved_for_security === 'boolean' ? msg.approved_for_security : true,
          updated_by: user.id,
        });

        if (!wasStreaming) {
          db.writeAuditLog({
            actor_id: user.id,
            actor_email: user.email,
            actor_role: user.role,
            action: 'LIVE_LOCATION_STARTED',
            entity: 'live_locations',
            entity_id: leader,
            metadata: {
              latitude: updated.latitude,
              longitude: updated.longitude,
            },
          });
        }

        broadcastLocation(updated);
        return;
      }

      if (msg.type === 'live_location:stop') {
        const leader = typeof msg.leader === 'string' ? msg.leader : '';
        if (!isValidLeader(leader) || !canSubmitLeaderUpdate(user.role, leader as LeaderCode)) {
          sendJson(socket, {
            type: 'live_location:error',
            error: 'Tidak berwenang menghentikan live location pimpinan tersebut.',
          });
          return;
        }
        const stopped = db.stopLiveStreaming(leader as LeaderCode, user.id);
        if (stopped) {
          db.writeAuditLog({
            actor_id: user.id,
            actor_email: user.email,
            actor_role: user.role,
            action: 'LIVE_LOCATION_STOPPED',
            entity: 'live_locations',
            entity_id: leader,
          });
          broadcastLocation(stopped);
        }
      }
    });

    socket.on('close', () => {
      clients.delete(clientEntry);
    });
  });

  return {
    broadcastLocation,
    close: () => {
      for (const client of clients) {
        client.socket.close();
      }
      clients.clear();
      wss.close();
    },
  };
}
