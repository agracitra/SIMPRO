import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import {SimproDatabase} from './server/db.ts';
import {attachLiveLocationHub} from './server/liveLocationHub.ts';
import {createApiRouter} from './server/routes.ts';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({limit: '2mb'}));

  const httpServer = http.createServer(app);
  const simproDb = new SimproDatabase();
  const liveHub = attachLiveLocationHub(httpServer, simproDb);

  app.use('/api', createApiRouter(simproDb, {onLiveLocationUpdated: liveHub.broadcastLocation}));

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output tidak ditemukan. Jalankan npm run build.');
      }
    });
  } else {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SIMPRO server & WebSocket live location berjalan pada http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server SIMPRO:', err);
  process.exit(1);
});
