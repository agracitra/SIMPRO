import http from 'node:http';
import {describe, expect, it} from 'vitest';
import express from 'express';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import {SimproDatabase} from '../server/db.ts';
import {attachLiveLocationHub} from '../server/liveLocationHub.ts';
import {createApiRouter} from '../server/routes.ts';

async function createTestApp() {
  const db = new SimproDatabase(':memory:');
  const app = express();
  app.use(express.json());
  const httpServer = http.createServer(app);
  const hub = attachLiveLocationHub(httpServer, db);
  app.use('/api', createApiRouter(db, {onLiveLocationUpdated: hub.broadcastLocation}));
  return {db, app, httpServer, hub};
}

async function loginAs(
  baseUrl: string,
  email: string,
  password: string
): Promise<{status: number; cookie: string; body: Record<string, unknown>}> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] || '';
  const body = (await res.json()) as Record<string, unknown>;
  return {status: res.status, cookie, body};
}

async function apiCall(
  baseUrl: string,
  path: string,
  cookie: string,
  method = 'GET',
  payload?: unknown
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? {Cookie: cookie} : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return {status: res.status, body};
}

describe('SIMPRO v1.0 — Pengujian Autentikasi, RBAC 7 Role, Offline Sync Deduplikasi, dan Audit', () => {
  it('Menegakkan otorisasi tiap role, isolasi ajudan, pembatasan pengamanan, viewer toggle, dan deduplikasi sync', async () => {
    const {httpServer, hub} = await createTestApp();
    const server = await new Promise<http.Server>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve(httpServer));
    });

    try {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      // 1. Pimpinan/Viewer ditolak saat viewer_enabled = false
      const viewerBlocked = await loginAs(baseUrl, 'pimpinan@simpro.local', 'Simpro#Viewer2026');
      expect(viewerBlocked.status).toBe(403);

      // 2. Login semua role aktif
      const admin = await loginAs(baseUrl, 'admin@simpro.local', 'Simpro#Admin2026');
      const ajudanBup = await loginAs(baseUrl, 'ajudan.bupati@simpro.local', 'Simpro#Bupati2026');
      const ajudanWabup = await loginAs(baseUrl, 'ajudan.wabup@simpro.local', 'Simpro#Wabup2026');
      const protokol = await loginAs(baseUrl, 'protokol@simpro.local', 'Simpro#Protokol2026');
      const dokumentasi = await loginAs(baseUrl, 'dokumentasi@simpro.local', 'Simpro#Dok2026');
      const pengamanan = await loginAs(baseUrl, 'pengamanan@simpro.local', 'Simpro#Pam2026');

      expect(admin.status).toBe(200);
      expect(ajudanBup.status).toBe(200);
      expect(ajudanWabup.status).toBe(200);
      expect(protokol.status).toBe(200);
      expect(dokumentasi.status).toBe(200);
      expect(pengamanan.status).toBe(200);

      // 3. Ajudan Bupati hanya boleh memperbarui Bupati (ditolak untuk Wakil Bupati)
      const clientUpdateId = crypto.randomUUID();
      const bupOk = await apiCall(baseUrl, '/api/updates', ajudanBup.cookie, 'POST', {
        leader: 'bupati',
        status: 'Tiba di lokasi',
        location_text: 'Pendopo Kabupaten',
        latitude: -7.1234,
        longitude: 110.4321,
        accuracy_m: 12,
        gps_captured_at: new Date().toISOString(),
        note: 'Uji GPS manual',
        client_update_id: clientUpdateId,
        client_created_at: new Date().toISOString(),
      });
      expect(bupOk.status).toBe(201);

      const bupDeniedWabup = await apiCall(baseUrl, '/api/updates', ajudanBup.cookie, 'POST', {
        leader: 'wakil_bupati',
        status: 'Tiba di lokasi',
        location_text: 'Bappeda',
        client_update_id: crypto.randomUUID(),
        client_created_at: new Date().toISOString(),
      });
      expect(bupDeniedWabup.status).toBe(403);

      // 4. Ajudan Wakil Bupati ditolak untuk Bupati
      const wabupDeniedBup = await apiCall(baseUrl, '/api/updates', ajudanWabup.cookie, 'POST', {
        leader: 'bupati',
        status: 'Persiapan',
        location_text: 'Rumah Dinas',
        client_update_id: crypto.randomUUID(),
        client_created_at: new Date().toISOString(),
      });
      expect(wabupDeniedBup.status).toBe(403);

      // 5. Admin & Protokol tidak dapat mengirim pembaruan lapangan
      const adminDeniedUpdate = await apiCall(baseUrl, '/api/updates', admin.cookie, 'POST', {
        leader: 'bupati',
        status: 'Persiapan',
        location_text: 'Kantor',
        client_update_id: crypto.randomUUID(),
        client_created_at: new Date().toISOString(),
      });
      expect(adminDeniedUpdate.status).toBe(403);

      // 6. Idempotency / Deduplikasi Offline Sync (client_update_id sama tidak membuat duplikat)
      const duplicateSync = await apiCall(baseUrl, '/api/updates', ajudanBup.cookie, 'POST', {
        leader: 'bupati',
        status: 'Tiba di lokasi',
        location_text: 'Pendopo Kabupaten',
        client_update_id: clientUpdateId,
        client_created_at: new Date().toISOString(),
      });
      expect(duplicateSync.status).toBe(200);
      expect(duplicateSync.body.deduplicated).toBe(true);

      // 7. Admin SIMPRO berwenang input agenda baru; Protokol & Ajudan ditolak membuat agenda baru
      const protokolCreateDenied = await apiCall(baseUrl, '/api/agendas', protokol.cookie, 'POST', {
        leader: 'bupati',
        title: 'Agenda Tanpa Izin Protokol',
        starts_at: new Date().toISOString(),
        location: 'Aula',
      });
      expect(protokolCreateDenied.status).toBe(403);

      const createdAgenda = await apiCall(baseUrl, '/api/agendas', admin.cookie, 'POST', {
        leader: 'bupati',
        title: 'Rapat Evaluasi Kinerja Uji',
        starts_at: new Date().toISOString(),
        location: 'Aula Setda',
        pic: 'Protokol',
        notes: 'Catatan awal',
        status: 'terjadwal',
        leader_attendance: 'hadir',
        attendance_note: 'Terkonfirmasi hadir',
      });
      expect(createdAgenda.status).toBe(201);
      const agendaObj = createdAgenda.body.agenda as {id: string; leader_attendance: string};
      const agendaId = agendaObj.id;
      expect(agendaObj.leader_attendance).toBe('hadir');

      // 7a. Tim Protokol dapat mengedit status kegiatan & kehadiran pimpinan (untuk Bupati & Wabup),
      //     tetapi ditolak mengubah judul, jadwal, atau lokasi agenda.
      const protokolEditStatusOk = await apiCall(
        baseUrl,
        `/api/agendas/${agendaId}`,
        protokol.cookie,
        'PATCH',
        {
          status: 'berlangsung',
          leader_attendance: 'hadir',
          attendance_note: 'Pimpinan sudah berada di ruang rapat',
        }
      );
      expect(protokolEditStatusOk.status).toBe(200);
      expect((protokolEditStatusOk.body.agenda as {status: string}).status).toBe('berlangsung');

      const protokolEditWabupStatusOk = await apiCall(
        baseUrl,
        '/api/agendas/agd-003',
        protokol.cookie,
        'PATCH',
        {
          status: 'berlangsung',
          leader_attendance: 'hadir',
        }
      );
      expect(protokolEditWabupStatusOk.status).toBe(200);

      const protokolEditTitleDenied = await apiCall(
        baseUrl,
        `/api/agendas/${agendaId}`,
        protokol.cookie,
        'PATCH',
        {title: 'Mengubah Judul oleh Protokol'}
      );
      expect(protokolEditTitleDenied.status).toBe(403);

      // Admin SIMPRO dapat mengedit detail agenda sekaligus status kegiatan
      const adminEditFullOk = await apiCall(
        baseUrl,
        `/api/agendas/${agendaId}`,
        admin.cookie,
        'PATCH',
        {
          location: 'Ruang Rapat Utama Setda',
          status: 'ditunda',
          change_reason: 'Penyesuaian ruangan oleh Admin SIMPRO',
        }
      );
      expect(adminEditFullOk.status).toBe(200);
      expect((adminEditFullOk.body.agenda as {status: string}).status).toBe('ditunda');

      // 7b. Ajudan Bupati dapat mengedit status agenda & kehadiran pimpinan untuk agenda Bupati,
      //     tetapi ditolak mengubah agenda Wakil Bupati atau mengubah jadwal/judul.
      const ajudanEditBupAtt = await apiCall(
        baseUrl,
        `/api/agendas/${agendaId}`,
        ajudanBup.cookie,
        'PATCH',
        {
          status: 'berlangsung',
          leader_attendance: 'diwakilkan',
          attendance_note: 'Diwakilkan Sekretaris Daerah',
        }
      );
      expect(ajudanEditBupAtt.status).toBe(200);
      expect((ajudanEditBupAtt.body.agenda as {leader_attendance: string}).leader_attendance).toBe(
        'diwakilkan'
      );

      const ajudanCrossLeaderDenied = await apiCall(
        baseUrl,
        '/api/agendas/agd-003',
        ajudanBup.cookie,
        'PATCH',
        {leader_attendance: 'hadir'}
      );
      expect(ajudanCrossLeaderDenied.status).toBe(403);

      const ajudanEditTitleDenied = await apiCall(
        baseUrl,
        `/api/agendas/${agendaId}`,
        ajudanBup.cookie,
        'PATCH',
        {title: 'Mengubah Judul'}
      );
      expect(ajudanEditTitleDenied.status).toBe(403);

      const ajudanCreateAgendaDenied = await apiCall(
        baseUrl,
        '/api/agendas',
        ajudanBup.cookie,
        'POST',
        {
          leader: 'bupati',
          title: 'Agenda Ilegal',
          starts_at: new Date().toISOString(),
          location: 'Aula',
        }
      );
      expect(ajudanCreateAgendaDenied.status).toBe(403);

      // 8. Dokumentasi hanya boleh mengubah documentation_notes, ditolak jika mengubah jadwal/judul
      const docNotesOk = await apiCall(
        baseUrl,
        `/api/agendas/${agendaId}`,
        dokumentasi.cookie,
        'PATCH',
        {documentation_notes: 'Siapkan 2 kamera dan mic podium.'}
      );
      expect(docNotesOk.status).toBe(200);

      const docChangeTitleDenied = await apiCall(
        baseUrl,
        `/api/agendas/${agendaId}`,
        dokumentasi.cookie,
        'PATCH',
        {title: 'Mengubah Judul'}
      );
      expect(docChangeTitleDenied.status).toBe(403);

      // 9. Pengamanan tidak menerima agenda dengan approved_for_security = false (agd-004)
      const pamAgendas = await apiCall(baseUrl, '/api/agendas', pengamanan.cookie, 'GET');
      expect(pamAgendas.status).toBe(200);
      const pamAgendaIds = (pamAgendas.body.agendas as Array<{id: string}>).map((a) => a.id);
      expect(pamAgendaIds).not.toContain('agd-004');

      // 10. Non-admin tidak boleh mengakses manajemen pengguna atau audit log
      const nonAdminUsersDenied = await apiCall(baseUrl, '/api/admin/users', protokol.cookie, 'GET');
      expect(nonAdminUsersDenied.status).toBe(403);
      const nonAdminAuditDenied = await apiCall(
        baseUrl,
        '/api/admin/audit-logs',
        ajudanBup.cookie,
        'GET'
      );
      expect(nonAdminAuditDenied.status).toBe(403);

      // 11. Admin tidak boleh mengubah role atau menonaktifkan dirinya sendiri
      const adminUserId = (admin.body.user as {id: string}).id;
      const selfDemoteDenied = await apiCall(
        baseUrl,
        `/api/admin/users/${adminUserId}`,
        admin.cookie,
        'PATCH',
        {role: 'protokol'}
      );
      expect(selfDemoteDenied.status).toBe(403);

      // 12. Penonaktifan akun memblokir login tanpa menghapus riwayat
      const docUserId = (dokumentasi.body.user as {id: string}).id;
      const deactivateDoc = await apiCall(
        baseUrl,
        `/api/admin/users/${docUserId}`,
        admin.cookie,
        'PATCH',
        {is_active: false}
      );
      expect(deactivateDoc.status).toBe(200);

      const deactivatedLogin = await loginAs(baseUrl, 'dokumentasi@simpro.local', 'Simpro#Dok2026');
      expect(deactivatedLogin.status).toBe(403);

      // 13. Admin dapat mengaktifkan Pimpinan/Viewer sehingga login viewer berhasil, dan ekspor viewer tetap ditolak
      const enableViewer = await apiCall(baseUrl, '/api/settings', admin.cookie, 'PATCH', {
        viewer_enabled: true,
      });
      expect(enableViewer.status).toBe(200);

      const viewerAllowed = await loginAs(baseUrl, 'pimpinan@simpro.local', 'Simpro#Viewer2026');
      expect(viewerAllowed.status).toBe(200);

      const viewerExportDenied = await apiCall(
        baseUrl,
        '/api/reports/export-log',
        viewerAllowed.cookie,
        'POST',
        {report_type: 'daily', format: 'csv', record_count: 1}
      );
      expect(viewerExportDenied.status).toBe(403);

      // 14. Admin dapat mengunduh & memverifikasi integritas backup
      const backupRes = await apiCall(baseUrl, '/api/admin/backup', admin.cookie, 'GET');
      expect(backupRes.status).toBe(200);
      const verifyRes = await apiCall(
        baseUrl,
        '/api/admin/backup/verify',
        admin.cookie,
        'POST',
        backupRes.body
      );
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(true);

      // 15. Audit log mencatat seluruh akses ditolak & aksi sensitif
      const auditRes = await apiCall(baseUrl, '/api/admin/audit-logs', admin.cookie, 'GET');
      expect(auditRes.status).toBe(200);
      const actions = (auditRes.body.logs as Array<{action: string}>).map((l) => l.action);
      expect(actions).toContain('ACCESS_DENIED');
      expect(actions).toContain('BACKUP_RESTORE_DRY_RUN');

      // 16. Autentikasi Bearer token (mode iframe tanpa cookie) & flag cookie HTTPS
      const adminToken = admin.body.token as string;
      expect(typeof adminToken).toBe('string');
      expect(adminToken.length).toBeGreaterThan(10);

      const bearerInputRes = await fetch(`${baseUrl}/api/agendas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          leader: 'bupati',
          title: 'Agenda Uji Bearer Tanpa Cookie',
          starts_at: new Date().toISOString(),
          location: 'Pendopo Kabupaten',
        }),
      });
      expect(bearerInputRes.status).toBe(201);

      const httpsLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify({
          email: 'admin@simpro.local',
          password: 'Simpro#Admin2026',
        }),
      });
      expect(httpsLoginRes.status).toBe(200);
      const setCookieHeader = httpsLoginRes.headers.get('set-cookie') || '';
      expect(setCookieHeader.toLowerCase()).toContain('samesite=none');
      expect(setCookieHeader.toLowerCase()).toContain('secure');

      // 17. Hapus agenda hanya oleh Admin SIMPRO; Protokol & Ajudan ditolak (403)
      const bearerCreatedJson = (await bearerInputRes.json()) as {agenda: {id: string}};
      const bearerAgendaId = bearerCreatedJson.agenda.id;

      const protokolDeleteDenied = await apiCall(
        baseUrl,
        `/api/agendas/${bearerAgendaId}`,
        protokol.cookie,
        'DELETE'
      );
      expect(protokolDeleteDenied.status).toBe(403);

      const ajudanDeleteDenied = await apiCall(
        baseUrl,
        `/api/agendas/${bearerAgendaId}`,
        ajudanBup.cookie,
        'DELETE'
      );
      expect(ajudanDeleteDenied.status).toBe(403);

      const adminDeleteOk = await apiCall(
        baseUrl,
        `/api/agendas/${bearerAgendaId}`,
        admin.cookie,
        'DELETE'
      );
      expect(adminDeleteOk.status).toBe(200);

      const afterDeleteList = await apiCall(baseUrl, '/api/agendas', admin.cookie, 'GET');
      const remainingIds = (afterDeleteList.body.agendas as Array<{id: string}>).map((a) => a.id);
      expect(remainingIds).not.toContain(bearerAgendaId);

      const postDeleteAudit = await apiCall(baseUrl, '/api/admin/audit-logs', admin.cookie, 'GET');
      const postDeleteActions = (postDeleteAudit.body.logs as Array<{action: string}>).map(
        (l) => l.action
      );
      expect(postDeleteActions).toContain('AGENDA_DELETED');

      // 18. Pengujian Live Location REST & WebSocket RBAC
      const initialLive = await apiCall(baseUrl, '/api/live-locations', protokol.cookie, 'GET');
      expect(initialLive.status).toBe(200);
      expect((initialLive.body.locations as Array<{leader: string}>).length).toBe(2);

      // Ajudan Bupati tidak boleh mengirim live location untuk Wakil Bupati
      const crossLeaderLiveDenied = await apiCall(
        baseUrl,
        '/api/live-locations',
        ajudanBup.cookie,
        'POST',
        {
          leader: 'wakil_bupati',
          latitude: -7.45,
          longitude: 112.72,
        }
      );
      expect(crossLeaderLiveDenied.status).toBe(403);

      // Protokol tidak boleh mengirim live location (hanya lihat)
      const protokolLiveDenied = await apiCall(
        baseUrl,
        '/api/live-locations',
        protokol.cookie,
        'POST',
        {
          leader: 'bupati',
          latitude: -7.45,
          longitude: 112.72,
        }
      );
      expect(protokolLiveDenied.status).toBe(403);

      // WebSocket menerima snapshot & broadcast real-time saat Ajudan mengirim live location
      const protokolToken = protokol.body.token as string;
      const wsUpdates: Array<{type: string; location?: {leader: string; latitude: number}}> = [];
      const wsClient = new WebSocket(
        `ws://127.0.0.1:${port}/ws/live-location?token=${encodeURIComponent(protokolToken)}`
      );

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket snapshot timeout')), 4000);
        wsClient.on('message', (raw) => {
          const parsed = JSON.parse(raw.toString()) as {
            type: string;
            location?: {leader: string; latitude: number};
          };
          wsUpdates.push(parsed);
          if (parsed.type === 'live_location:snapshot') {
            clearTimeout(timeout);
            resolve();
          }
        });
        wsClient.on('error', reject);
      });

      const liveUpdateBroadcast = new Promise<{leader: string; latitude: number}>(
        (resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('WebSocket broadcast timeout')), 4000);
          wsClient.on('message', (raw) => {
            const parsed = JSON.parse(raw.toString()) as {
              type: string;
              location?: {leader: string; latitude: number};
            };
            if (parsed.type === 'live_location:update' && parsed.location) {
              clearTimeout(timeout);
              resolve(parsed.location);
            }
          });
        }
      );

      const publishOk = await apiCall(baseUrl, '/api/live-locations', ajudanBup.cookie, 'POST', {
        leader: 'bupati',
        latitude: -7.4512,
        longitude: 112.7195,
        accuracy_m: 8,
        approved_for_security: false,
        is_live_streaming: true,
      });
      expect(publishOk.status).toBe(200);

      const receivedBroadcast = await liveUpdateBroadcast;
      expect(receivedBroadcast.leader).toBe('bupati');
      expect(receivedBroadcast.latitude).toBeCloseTo(-7.4512, 4);
      wsClient.close();

      // Karena approved_for_security = false, Pengamanan tidak boleh melihat lokasi Bupati
      const pamLive = await apiCall(baseUrl, '/api/live-locations', pengamanan.cookie, 'GET');
      expect(pamLive.status).toBe(200);
      const pamLeaders = (pamLive.body.locations as Array<{leader: string}>).map((l) => l.leader);
      expect(pamLeaders).not.toContain('bupati');
      expect(pamLeaders).toContain('wakil_bupati');
    } finally {
      hub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
