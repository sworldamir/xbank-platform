import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStore, writeStore, addAudit } from './store.mjs';

const PORT = Number(process.env.PORT || 4000);
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '../dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 1_000_000) reject(new Error('Request body too large')); });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
function serveStatic(urlPath, res) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const requested = cleanPath === '/' ? '/index.html' : cleanPath;
  const candidate = path.resolve(distDir, `.${requested}`);
  if (!candidate.startsWith(distDir)) return false;
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return false;
  const ext = path.extname(candidate).toLowerCase();
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(candidate).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, app: 'xbank-demo', mode: 'simulation' });
    if (req.method === 'GET' && url.pathname === '/api/state') return sendJson(res, 200, readStore());

    if (req.method === 'POST' && url.pathname === '/api/deposits') {
      const body = await readBody(req);
      const { amount, network, txid, userId = 'XB-1001' } = body;
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 1_000_000) return sendJson(res, 400, { error: 'مبلغ واردشده معتبر نیست.' });
      if (!['BNB Smart Chain', 'Base'].includes(network)) return sendJson(res, 400, { error: 'شبکه انتخاب‌شده معتبر نیست.' });
      if (!txid || String(txid).trim().length < 8) return sendJson(res, 400, { error: 'شناسه تراکنش (TXID) را وارد کنید.' });
      const data = readStore();
      const user = data.users.find((u) => u.id === userId);
      if (!user) return sendJson(res, 404, { error: 'کاربر پیدا نشد.' });
      const normalizedTx = String(txid).trim().toLowerCase();
      if (data.deposits.some((d) => d.txid.toLowerCase() === normalizedTx)) return sendJson(res, 409, { error: 'این شناسه تراکنش قبلاً ثبت شده است.' });
      const deposit = { id: `DP-${Date.now().toString().slice(-6)}`, userId, userName: user.name, amount: numericAmount, currency: 'DAI', network, txid: String(txid).trim(), status: 'pending', createdAt: new Date().toISOString(), note: '' };
      data.deposits.unshift(deposit);
      addAudit(data, 'ثبت درخواست واریز', `${user.name} · ${numericAmount} DAI · ${network}`, 'کاربر دمو');
      writeStore(data);
      return sendJson(res, 201, { deposit, message: 'درخواست واریز ثبت شد و در صف بررسی قرار گرفت.' });
    }

    if (req.method === 'PATCH' && /^\/api\/admin\/deposits\/[^/]+$/.test(url.pathname)) {
      const body = await readBody(req);
      const { status, note = '' } = body;
      if (!['approved', 'rejected'].includes(status)) return sendJson(res, 400, { error: 'وضعیت درخواستی معتبر نیست.' });
      const id = url.pathname.split('/').at(-1);
      const data = readStore();
      const deposit = data.deposits.find((d) => d.id === id);
      if (!deposit) return sendJson(res, 404, { error: 'درخواست پیدا نشد.' });
      if (deposit.status !== 'pending') return sendJson(res, 409, { error: 'این درخواست قبلاً بررسی شده است.' });
      deposit.status = status;
      deposit.note = String(note).slice(0, 500);
      deposit.reviewedAt = new Date().toISOString();
      const user = data.users.find((u) => u.id === deposit.userId);
      if (status === 'approved' && user) {
        user.wallet.available += deposit.amount;
        user.wallet.deposited += deposit.amount;
        data.activity.unshift({ id: `LG-${Date.now()}`, userId: user.id, type: 'deposit', amount: deposit.amount, description: `Demo deposit ${deposit.id} approved`, createdAt: new Date().toISOString() });
      }
      addAudit(data, status === 'approved' ? 'تأیید واریز آزمایشی' : 'رد درخواست واریز', `${deposit.id} · ${deposit.amount} DAI · ${note || 'بدون توضیح'}`);
      writeStore(data);
      return sendJson(res, 200, { deposit, message: status === 'approved' ? 'واریز آزمایشی تأیید و به موجودی اضافه شد.' : 'درخواست واریز رد شد.' });
    }

    if (req.method === 'PUT' && url.pathname === '/api/admin/settings') {
      const body = await readBody(req);
      const data = readStore();
      if (Array.isArray(body.depositAddresses)) {
        data.settings.depositAddresses = body.depositAddresses.map((a, i) => ({ id: String(a.id || `addr-${i}`), network: String(a.network || ''), currency: 'DAI', address: String(a.address || '').trim(), active: Boolean(a.active) }));
      }
      if (body.stats && typeof body.stats === 'object') {
        for (const key of ['users', 'volume', 'projects', 'countries', 'dailyGrowth']) {
          if (body.stats[key] !== undefined && Number.isFinite(Number(body.stats[key])) && Number(body.stats[key]) >= 0) data.settings.stats[key] = Number(body.stats[key]);
        }
        if (['manual', 'calculated'].includes(body.stats.displayMode)) data.settings.stats.displayMode = body.stats.displayMode;
      }
      if (body.depositNoticeHours !== undefined) data.settings.depositNoticeHours = Math.max(1, Math.min(72, Number(body.depositNoticeHours) || 24));
      if (body.minimumWithdrawal !== undefined) data.settings.minimumWithdrawal = Math.max(0, Number(body.minimumWithdrawal) || 0);
      if (body.referralPercent !== undefined) data.settings.referralPercent = Math.max(0, Math.min(50, Number(body.referralPercent) || 0));
      addAudit(data, 'به‌روزرسانی تنظیمات', 'آدرس‌های واریز و تنظیمات عمومی تغییر کرد.');
      writeStore(data);
      return sendJson(res, 200, { settings: data.settings, message: 'تنظیمات ذخیره شد.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/projects') {
      const body = await readBody(req);
      if (!body.title?.en || !body.title?.ar || !body.title?.tr) return sendJson(res, 400, { error: 'عنوان پروژه باید به هر سه زبان وارد شود.' });
      const data = readStore();
      const project = { id: `PR-${Date.now().toString().slice(-5)}`, category: String(body.category || 'General'), title: body.title, description: body.description || { en: '', ar: '', tr: '' }, minimum: Math.max(0, Number(body.minimum) || 0), maximum: Math.max(0, Number(body.maximum) || 0), duration: String(body.duration || '90 days'), target: Math.max(0, Number(body.target) || 0), raised: 0, status: 'active', risk: String(body.risk || 'Medium'), featured: false, views: 0, likes: 0, roiLabel: 'Illustrative target' };
      data.projects.unshift(project);
      addAudit(data, 'ایجاد پروژه', `${project.id} · ${project.title.en}`);
      writeStore(data);
      return sendJson(res, 201, { project, message: 'پروژه جدید ایجاد شد.' });
    }

    if (req.method === 'PATCH' && /^\/api\/admin\/projects\/[^/]+$/.test(url.pathname)) {
      const body = await readBody(req);
      const id = url.pathname.split('/').at(-1);
      const data = readStore();
      const project = data.projects.find((p) => p.id === id);
      if (!project) return sendJson(res, 404, { error: 'پروژه پیدا نشد.' });
      const { status, minimum, maximum, target, featured } = body;
      if (status && ['active', 'upcoming', 'completed', 'paused'].includes(status)) project.status = status;
      if (minimum !== undefined) project.minimum = Math.max(0, Number(minimum) || 0);
      if (maximum !== undefined) project.maximum = Math.max(0, Number(maximum) || 0);
      if (target !== undefined) project.target = Math.max(0, Number(target) || 0);
      if (featured !== undefined) project.featured = Boolean(featured);
      addAudit(data, 'ویرایش پروژه', `${project.id} · ${project.title.en}`);
      writeStore(data);
      return sendJson(res, 200, { project, message: 'پروژه به‌روزرسانی شد.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/adjustments') {
      const body = await readBody(req);
      const { userId, amount, reason } = body;
      const value = Number(amount);
      if (!userId || !Number.isFinite(value) || value === 0 || !String(reason || '').trim()) return sendJson(res, 400, { error: 'کاربر، مبلغ غیرصفر و دلیل اصلاحیه الزامی است.' });
      const data = readStore();
      const user = data.users.find((u) => u.id === userId);
      if (!user) return sendJson(res, 404, { error: 'کاربر پیدا نشد.' });
      if (user.wallet.available + value < 0) return sendJson(res, 409, { error: 'موجودی آزاد برای این اصلاحیه کافی نیست.' });
      user.wallet.available += value;
      data.activity.unshift({ id: `LG-${Date.now()}`, userId, type: 'adjustment', amount: value, description: `Admin adjustment: ${reason}`, createdAt: new Date().toISOString() });
      addAudit(data, 'ثبت اصلاحیه موجودی دمو', `${user.name} · ${value} USD · ${reason}`);
      writeStore(data);
      return sendJson(res, 200, { user, message: 'اصلاحیه آزمایشی ثبت شد.' });
    }

    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'API endpoint not found' });
    if (serveStatic(url.pathname, res)) return;
    const indexFile = path.join(distDir, 'index.html');
    if (fs.existsSync(indexFile)) { res.writeHead(200, { 'Content-Type': mime['.html'] }); return fs.createReadStream(indexFile).pipe(res); }
    return sendJson(res, 503, { error: 'Frontend is not built. Run npm run build first.' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: error.message === 'Invalid JSON body' ? error.message : 'خطای داخلی سرور دمو.' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`XBank demo server listening on http://localhost:${PORT}`));
