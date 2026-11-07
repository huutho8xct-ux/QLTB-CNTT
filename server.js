import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, closeDb, DB_PATH } from './src/db.js';
import { api } from './src/api.js';
import { startAutoBackup } from './src/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'");
    next();
  });

  app.use('/api', api);
  app.use('/vendor/chart', express.static(path.join(__dirname, 'node_modules/chart.js/dist'), { maxAge: '7d' }));
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  openDb();
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  const server = app.listen(PORT, HOST, () => {
    console.log('==========================================================');
    console.log(' PHẦN MỀM QUẢN LÝ THIẾT BỊ CÔNG NGHỆ THÔNG TIN (QLTB-CNTT)');
    console.log(`  Địa chỉ truy cập : http://localhost:${PORT}`);
    console.log(`  Cơ sở dữ liệu    : ${DB_PATH}`);
    console.log('  Tài khoản mặc định: admin / admin@123 (đổi ngay khi đăng nhập)');
    console.log('==========================================================');
  });
  const timer = startAutoBackup();
  const shutdown = () => {
    clearInterval(timer);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
