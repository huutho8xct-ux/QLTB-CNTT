import express, { Router } from 'express';
import QRCode from 'qrcode';
import { authenticate } from './auth.js';
import { HttpError } from './util.js';
import { router as authRouter } from './routes/auth.js';
import { router as catalogsRouter } from './routes/catalogs.js';
import { router as usersRouter } from './routes/users.js';
import { router as devicesRouter } from './routes/devices.js';
import { router as allocationsRouter } from './routes/allocations.js';
import { router as repairsRouter } from './routes/repairs.js';
import { router as maintenanceRouter } from './routes/maintenance.js';
import { router as inventoriesRouter } from './routes/inventories.js';
import { router as disposalsRouter } from './routes/disposals.js';
import { router as licensesRouter } from './routes/licenses.js';
import { router as reportsRouter } from './routes/reports.js';
import { router as systemRouter } from './routes/system.js';

export const api = Router();

api.use(express.json({ limit: '5mb' }));

api.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Ảnh mã QR (không chứa dữ liệu nhạy cảm, chỉ mã hóa nội dung được truyền vào)
api.get('/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text) throw new HttpError(400, 'Thiếu nội dung');
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

api.use('/auth', authRouter);
api.use(authenticate);
api.use('/catalogs', catalogsRouter);
api.use('/users', usersRouter);
api.use('/devices', devicesRouter);
api.use('/allocations', allocationsRouter);
api.use('/repairs', repairsRouter);
api.use('/maintenances', maintenanceRouter);
api.use('/inventories', inventoriesRouter);
api.use('/disposals', disposalsRouter);
api.use('/licenses', licensesRouter);
api.use('/', reportsRouter);
api.use('/system', systemRouter);

api.use((_req, _res, next) => next(new HttpError(404, 'Không tìm thấy chức năng')));

// eslint-disable-next-line no-unused-vars
api.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Lỗi hệ thống, vui lòng thử lại hoặc liên hệ quản trị' : err.message });
});
