import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from './db.mjs';
import { marketFeed } from './market.mjs';
import { assertPasswordPolicy, cookieOptions, hashPassword, parseCookies, randomToken, sha256, verifyPassword } from './security.mjs';

const PORT = Number(process.env.PORT || 4000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SECURE_COOKIES = NODE_ENV === 'production';
const SESSION_DAYS = 7;
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '../dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4000').split(',').map((x) => x.trim()).filter(Boolean));
const loginAttempts = new Map();
const RATE_LIMIT_BUCKET_CAP = 25_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
}, 60_000).unref?.();

const id = () => crypto.randomUUID();
const publicRef = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const moneyToMinor = (value, allowZero = false) => {
  const text = String(value ?? '').trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw new Error('Enter a valid amount with up to two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const result = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if ((!allowZero && result <= 0n) || (allowZero && result < 0n) || result > 100_000_000_000n) throw new Error('Amount is outside the permitted range.');
  return result.toString();
};
const toMoney = (minor) => Number(BigInt(minor || 0)) / 100;
const isEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function sendJson(res, status, value, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extraHeaders,
  });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 64 * 1024) {
        reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch { reject(Object.assign(new Error('Invalid JSON body.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function setCookies(res, sessionToken, csrfToken) {
  const sessionCookie = cookieOptions('xb_session', sessionToken, { httpOnly: true, maxAge: SESSION_DAYS * 86400 });
  const csrfCookie = cookieOptions('xb_csrf', csrfToken, { httpOnly: false, maxAge: SESSION_DAYS * 86400 });
  res.setHeader('Set-Cookie', [sessionCookie, csrfCookie]);
}
function clearSessionCookie(res) {
  const session = cookieOptions('xb_session', '', { httpOnly: true, maxAge: 0 });
  const csrf = cookieOptions('xb_csrf', '', { httpOnly: false, maxAge: 0 });
  res.setHeader('Set-Cookie', [session, csrf]);
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = allowedOrigins.has(origin);
  if (!allowed) throw Object.assign(new Error('Origin is not allowed.'), { status: 403 });
}

async function checkCsrf(req, session = null) {
  checkOrigin(req);
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies.xb_csrf || '';
  const headerToken = String(req.headers['x-csrf-token'] || '');
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length || !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    throw Object.assign(new Error('CSRF validation failed. Refresh the page and retry.'), { status: 403 });
  }
  if (session && session.csrf_hash !== sha256(headerToken)) {
    throw Object.assign(new Error('Session security token is invalid. Refresh the page and retry.'), { status: 403 });
  }
}

async function getSession(req) {
  const token = parseCookies(req.headers.cookie).xb_session;
  if (!token) return null;
  const tokenHash = sha256(token);
  const result = await pool.query(`SELECT s.id AS session_id, s.csrf_hash, s.expires_at,
      u.id, u.public_id, u.username, u.email, u.display_name, u.country, u.locale,
      u.role, u.account_status, u.email_verified_at, u.identity_status, u.referral_code,
      u.referred_by, u.points, u.level, u.birth_date, u.province, u.wallet_address, u.wallet_network, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.account_status = 'active'`, [tokenHash]);
  if (!result.rowCount) return null;
  return result.rows[0];
}

function requireAuth(session) {
  if (!session) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  return session;
}
function requireRole(session, roles = ['admin']) {
  requireAuth(session);
  if (!roles.includes(session.role)) throw Object.assign(new Error('You do not have permission to perform this action.'), { status: 403 });
  return session;
}

function rateLimit(key, limit = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  if (loginAttempts.size > RATE_LIMIT_BUCKET_CAP) {
    for (const [bucket, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(bucket);
    if (loginAttempts.size > RATE_LIMIT_BUCKET_CAP) throw Object.assign(new Error('Authentication temporarily busy. Try again later.'), { status: 503 });
  }
  const record = loginAttempts.get(key);
  if (!record || record.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  record.count += 1;
  if (record.count > limit) throw Object.assign(new Error('Too many attempts. Please try again later.'), { status: 429 });
}

async function audit(client, actorUserId, action, detail, req) {
  await client.query(`INSERT INTO audit_logs(id, actor_user_id, action, detail, ip_address, user_agent)
    VALUES($1,$2,$3,$4,$5,$6)`, [id(), actorUserId || null, action, String(detail || '').slice(0, 2000), req.socket.remoteAddress || null, String(req.headers['user-agent'] || '').slice(0, 500)]);
}

async function createLedger(client, { transactionType, description, createdBy, idempotencyKey, lines, metadata = {} }) {
  const debit = lines.reduce((sum, line) => sum + BigInt(line.debitMinor || 0), 0n);
  const credit = lines.reduce((sum, line) => sum + BigInt(line.creditMinor || 0), 0n);
  if (debit <= 0n || debit !== credit || lines.length < 2) throw new Error('Ledger transaction is not balanced.');
  const transactionId = id();
  const reference = publicRef('TX');
  await client.query(`INSERT INTO ledger_transactions(id,reference,transaction_type,description,idempotency_key,metadata,created_by)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, [transactionId, reference, transactionType, description, idempotencyKey || null, JSON.stringify(metadata), createdBy || null]);
  let lineNumber = 0;
  for (const line of lines) {
    lineNumber += 1;
    await client.query(`INSERT INTO ledger_entries(transaction_id,line_number,account_code,user_id,currency,debit_minor,credit_minor)
      VALUES($1,$2,$3,$4,'DAI',$5,$6)`, [transactionId, lineNumber, line.accountCode, line.userId || null, String(line.debitMinor || 0), String(line.creditMinor || 0)]);
  }
  return { id: transactionId, reference };
}

async function setting(key, fallback = null) {
  const result = await pool.query('SELECT value FROM app_settings WHERE key=$1', [key]);
  return result.rowCount ? result.rows[0].value : fallback;
}
async function featureEnabled(name) {
  if (process.env.FINANCIAL_OPERATIONS_ENABLED !== 'true') return false;
  if (NODE_ENV === 'production' && !process.env.LEGAL_COMPLIANCE_APPROVAL_ID) return false;
  const flags = await setting('financial_products_enabled', {});
  return flags?.[name] === true;
}

async function sendPlatformEmail({ to, subject, text }) {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw Object.assign(new Error(`SMTP is not configured (${missing.join(', ')}).`), { status: 503 });
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
}

async function createSession(req, res, userId) {
  const sessionToken = randomToken(48);
  const csrfToken = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await pool.query(`INSERT INTO sessions(id,user_id,token_hash,csrf_hash,ip_address,user_agent,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id(), userId, sha256(sessionToken), sha256(csrfToken), req.socket.remoteAddress || null, String(req.headers['user-agent'] || '').slice(0, 500), expiresAt]);
  setCookies(res, sessionToken, csrfToken);
  return { csrfToken };
}

function publicUser(row) {
  return {
    id: row.public_id,
    internalId: row.id,
    username: row.username,
    name: row.display_name,
    email: row.email,
    country: row.country,
    locale: row.locale,
    birthDate: row.birth_date || '',
    province: row.province || '',
    walletAddress: row.wallet_address || '',
    walletNetwork: row.wallet_network || '',
    role: row.role,
    status: row.account_status,
    identityStatus: row.identity_status,
    emailVerified: Boolean(row.email_verified_at),
    joinedAt: row.created_at,
    level: Number(row.level || 1),
    points: Number(row.points || 0),
    referralCode: row.referral_code,
    referralCount: Number(row.referral_count || 0),
    wallet: row.wallet || { available: 0, invested: 0, locked: 0, profit: 0, bonus: 0, withdrawn: 0, deposited: 0 },
  };
}

function mapWallet(row) {
  return {
    available: toMoney(row.available_minor),
    invested: toMoney(row.invested_minor),
    locked: toMoney(row.locked_minor),
    profit: toMoney(row.profit_minor),
    bonus: toMoney(row.bonus_minor),
    withdrawalPending: toMoney(row.withdrawal_pending_minor),
    withdrawn: toMoney(row.withdrawn_total_minor),
    deposited: toMoney(row.deposited_total_minor),
  };
}

async function stateFor(session) {
  // Support agents never receive the global financial/user dataset.
  const isAdmin = ['admin', 'finance'].includes(session.role);
  const usersQuery = isAdmin
    ? `SELECT u.*, (SELECT COUNT(*) FROM users r WHERE r.referred_by=u.id) AS referral_count,
        w.available_minor,w.invested_minor,w.locked_minor,w.profit_minor,w.bonus_minor,w.withdrawal_pending_minor,w.withdrawn_total_minor,w.deposited_total_minor
       FROM users u LEFT JOIN wallets w ON w.user_id=u.id AND w.currency='DAI' ORDER BY u.created_at DESC LIMIT 1000`
    : `SELECT u.*, (SELECT COUNT(*) FROM users r WHERE r.referred_by=u.id) AS referral_count,
        w.available_minor,w.invested_minor,w.locked_minor,w.profit_minor,w.bonus_minor,w.withdrawal_pending_minor,w.withdrawn_total_minor,w.deposited_total_minor
       FROM users u LEFT JOIN wallets w ON w.user_id=u.id AND w.currency='DAI' WHERE u.id=$1`;
  const usersResult = await pool.query(usersQuery, isAdmin ? [] : [session.id]);
  const users = usersResult.rows.map((row) => publicUser({ ...row, wallet: mapWallet(row) }));
  const userIds = isAdmin ? null : [session.id];
  const depositsResult = await pool.query(`SELECT d.*, u.public_id AS user_public_id, u.display_name AS user_name
    FROM deposit_requests d JOIN users u ON u.id=d.user_id ${isAdmin ? '' : 'WHERE d.user_id=$1'} ORDER BY d.created_at DESC LIMIT 500`, userIds || []);
  const withdrawalsResult = await pool.query(`SELECT w.*, u.public_id AS user_public_id, u.display_name AS user_name
    FROM withdrawal_requests w JOIN users u ON u.id=w.user_id ${isAdmin ? '' : 'WHERE w.user_id=$1'} ORDER BY w.created_at DESC LIMIT 500`, userIds || []);
  const investmentsResult = await pool.query(`SELECT i.*, p.public_id AS project_public_id, p.title AS project_title
    FROM investments i JOIN projects p ON p.id=i.project_id ${isAdmin ? '' : 'WHERE i.user_id=$1'} ORDER BY i.created_at DESC LIMIT 500`, userIds || []);
  const projectsResult = await pool.query('SELECT * FROM projects ORDER BY featured DESC, created_at DESC');
  const ledgerActivityResult = await pool.query(`SELECT le.id, le.user_id, le.debit_minor, le.credit_minor, lt.reference, lt.transaction_type, lt.description, lt.created_at
    FROM ledger_entries le JOIN ledger_transactions lt ON lt.id=le.transaction_id
    WHERE le.account_code='customer_available_liability' AND le.user_id ${isAdmin ? 'IS NOT NULL' : '= $1'} ORDER BY lt.created_at DESC LIMIT 500`, userIds || []);
  const addressesResult = await pool.query(`SELECT id,network,chain_id,currency,address,token_contract,active FROM deposit_addresses ${isAdmin ? '' : 'WHERE active=TRUE'} ORDER BY created_at`);
  const auditResult = isAdmin ? await pool.query('SELECT a.*,u.display_name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 250') : { rows: [] };
  const settingsResult = await pool.query('SELECT key,value FROM app_settings');
  const missionResult = await pool.query(`SELECT id,code,title,description,points,mission_type,one_time,active FROM missions ${isAdmin ? '' : 'WHERE active=TRUE'} ORDER BY created_at`);
  const missionProgressResult = await pool.query(`SELECT m.code,um.status,um.completed_at FROM user_missions um JOIN missions m ON m.id=um.mission_id WHERE um.user_id=$1`, [session.id]);
  const entitlementsResult = await pool.query(`SELECT e.public_id,e.entitlement_type,e.percentage,e.status,e.legal_reference,e.created_at,p.title AS project_title FROM project_entitlements e JOIN projects p ON p.id=e.project_id ${isAdmin ? '' : 'WHERE e.user_id=$1'} ORDER BY e.created_at DESC LIMIT 500`, userIds || []);
  const referralRewardsResult = await pool.query(`SELECT rr.amount_minor,rr.currency,rr.status,rr.created_at,u.public_id AS referred_user_id,u.display_name AS referred_user_name FROM referral_rewards rr JOIN users u ON u.id=rr.referred_user_id ${isAdmin ? '' : 'WHERE rr.referrer_user_id=$1'} ORDER BY rr.created_at DESC LIMIT 500`, userIds || []);
  const supportTicketsResult = await pool.query(`SELECT t.public_id,t.subject,t.message,t.status,t.priority,t.created_at,t.updated_at,u.public_id AS user_public_id,u.display_name AS user_name,
      COALESCE((SELECT json_agg(json_build_object('body',r.body,'author',au.display_name,'createdAt',r.created_at) ORDER BY r.created_at) FROM support_ticket_replies r JOIN users au ON au.id=r.author_user_id WHERE r.ticket_id=t.id),'[]'::json) AS replies
      FROM support_tickets t JOIN users u ON u.id=t.user_id ${isAdmin ? '' : 'WHERE t.user_id=$1'} ORDER BY t.created_at DESC LIMIT 250`, userIds || []);
  const distributionsResult = await pool.query(`SELECT d.public_id,d.amount_minor,d.currency,d.source_reference,d.status,d.created_at,
      e.user_id,u.public_id AS user_public_id,u.display_name AS user_name,p.title AS project_title
      FROM project_distributions d JOIN project_entitlements e ON e.id=d.entitlement_id
      JOIN users u ON u.id=e.user_id JOIN projects p ON p.id=e.project_id
      ${isAdmin ? '' : 'WHERE e.user_id=$1'} ORDER BY d.created_at DESC LIMIT 500`, userIds || []);
  const loanApplicationsResult = await pool.query(`SELECT la.*,u.public_id AS user_public_id,u.display_name AS user_name
      FROM loan_applications la JOIN users u ON u.id=la.user_id
      ${isAdmin ? '' : 'WHERE la.user_id=$1'} ORDER BY la.created_at DESC LIMIT 500`, userIds || []);
  const lotteryRoundsResult = await pool.query(`SELECT lr.*,
      COUNT(le.id)::int AS entry_rows,
      COALESCE(SUM(le.ticket_count),0)::int AS total_tickets,
      COUNT(DISTINCT le.user_id)::int AS participant_count,
      COALESCE(SUM(le.ticket_count) FILTER (WHERE le.user_id=$1),0)::int AS user_tickets
      FROM lottery_rounds lr LEFT JOIN lottery_entries le ON le.round_id=lr.id
      GROUP BY lr.id ORDER BY lr.starts_at DESC LIMIT 100`, [session.id]);
  const projectEngagementResult = await pool.query(`SELECT p.id,
      (SELECT COALESCE(SUM(v.view_count),0)::int FROM project_views v WHERE v.project_id=p.id) AS views,
      (SELECT COUNT(*)::int FROM project_reactions r WHERE r.project_id=p.id AND r.reaction='like') AS likes,
      (SELECT COUNT(*)::int FROM project_reactions r WHERE r.project_id=p.id AND r.reaction='dislike') AS dislikes
      ,(SELECT reaction FROM project_reactions ur WHERE ur.project_id=p.id AND ur.user_id=$1) AS user_reaction
    FROM projects p`, [session.id]);
  const settingsMap = Object.fromEntries(settingsResult.rows.map((r) => [r.key, r.value]));
  const platformMetricsResult = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM users WHERE account_status='active' AND role='customer') AS total_users,
      COALESCE((SELECT SUM(deposited_total_minor) FROM wallets WHERE currency='DAI'),0)::text AS total_deposited_minor,
      COALESCE((SELECT SUM(available_minor) FROM wallets WHERE currency='DAI'),0)::text AS total_available_minor,
      COALESCE((SELECT SUM(invested_minor) FROM wallets WHERE currency='DAI'),0)::text AS total_invested_minor,
      COALESCE((SELECT SUM(locked_minor) FROM wallets WHERE currency='DAI'),0)::text AS total_locked_minor,
      COALESCE((SELECT SUM(withdrawn_total_minor) FROM wallets WHERE currency='DAI'),0)::text AS total_withdrawn_minor,
      (SELECT COUNT(DISTINCT NULLIF(country,''))::int FROM users WHERE account_status='active' AND role='customer') AS total_countries`);
  const platformMetrics = platformMetricsResult.rows[0];
  const statsUsers = Number(platformMetrics.total_users || 0);
  return {
    users,
    metrics: { totalUsers: Number(platformMetrics.total_users || 0), totalDeposited: toMoney(platformMetrics.total_deposited_minor), totalAvailable: toMoney(platformMetrics.total_available_minor), totalInvested: toMoney(platformMetrics.total_invested_minor), totalLocked: toMoney(platformMetrics.total_locked_minor), totalWithdrawn: toMoney(platformMetrics.total_withdrawn_minor) },
    deposits: depositsResult.rows.map((d) => ({ id: d.public_id, userId: d.user_public_id, userName: d.user_name, amount: toMoney(d.amount_minor), currency: d.currency, network: d.network, txid: d.txid, depositAddress: d.deposit_address_snapshot, tokenContract: d.token_contract_snapshot, chainId: d.chain_id, status: d.status, note: d.note, createdAt: d.created_at, reviewedAt: d.reviewed_at })),
    withdrawals: withdrawalsResult.rows.map((w) => ({ id: w.public_id, userId: w.user_public_id, userName: w.user_name, amount: toMoney(w.amount_minor), currency: w.currency, network: w.network, address: w.destination_address, status: w.status, txid: w.payout_txid, note: w.note, createdAt: w.created_at })),
    investments: investmentsResult.rows.map((i) => ({ id: i.public_id, userId: users.find((u) => u.internalId === i.user_id)?.id || '', projectId: i.project_public_id, projectTitle: i.project_title, amount: toMoney(i.amount_minor), status: i.status, date: i.created_at, expected: 0, realized: 0 })),
    projects: projectsResult.rows.map((p) => { const engagement = projectEngagementResult.rows.find((x) => x.id === p.id) || {}; return { id: p.public_id, internalId: p.id, category: p.category, title: p.title, description: p.description, minimum: toMoney(p.minimum_minor), maximum: toMoney(p.maximum_minor), duration: p.duration, target: toMoney(p.target_minor), raised: toMoney(p.raised_minor), status: p.status, risk: p.risk, featured: p.featured, views: p.views_override === null || p.views_override === undefined ? Number(engagement.views || 0) : Number(p.views_override), viewsOverride:p.views_override, actualViews: Number(engagement.views || 0), likes: Number(engagement.likes || 0), dislikes: Number(engagement.dislikes || 0), investmentsEnabled: p.investments_enabled, complianceStatus: p.compliance_status, userReaction: engagement.user_reaction || null }; }),
    activity: ledgerActivityResult.rows.map((a) => ({ id: String(a.id), userId: users.find((u) => u.internalId === a.user_id)?.id || '', type: a.transaction_type, amount: toMoney(a.credit_minor) - toMoney(a.debit_minor), description: `${a.reference} · ${a.description}`, createdAt: a.created_at })),
    missions: missionResult.rows.map((m) => ({ id: m.id, code: m.code, title: m.title, description: m.description, points: m.points, type: m.mission_type, oneTime: m.one_time, active: m.active })),
    userMissions: missionProgressResult.rows.map((m) => ({ code: m.code, status: m.status, completedAt: m.completed_at })),
    entitlements: entitlementsResult.rows.map((e) => ({ id: e.public_id, type: e.entitlement_type, percentage: Number(e.percentage), status: e.status, legalReference: e.legal_reference, projectTitle: e.project_title, createdAt: e.created_at })),
    referralRewards: referralRewardsResult.rows.map((r) => ({ amount: toMoney(r.amount_minor), currency: r.currency, status: r.status, createdAt: r.created_at, referredUserId: r.referred_user_id, referredUserName: r.referred_user_name })),
    supportTickets: supportTicketsResult.rows.map((t) => ({ id: t.public_id, subject: t.subject, message: t.message, status: t.status, priority: t.priority, createdAt: t.created_at, updatedAt: t.updated_at, userId: t.user_public_id, userName: t.user_name, replies: t.replies || [] })),
    loanApplications: loanApplicationsResult.rows.map((x) => ({ id:x.public_id, userId:x.user_public_id, userName:x.user_name, collateral:toMoney(x.collateral_minor), requested:toMoney(x.requested_minor), termMonths:Number(x.term_months), status:x.status, createdAt:x.created_at })),
    lotteryRounds: lotteryRoundsResult.rows.map((x) => ({ id:x.public_id, title:x.title, entryPrice:toMoney(x.entry_price_minor), prizeAmount:toMoney(x.prize_amount_minor), startsAt:x.starts_at, endsAt:x.ends_at, status:x.status, complianceStatus:x.compliance_status, participants:Number(x.participant_count), totalTickets:Number(x.total_tickets), userTickets:Number(x.user_tickets) })),
    distributions: distributionsResult.rows.map((x) => ({ id:x.public_id, userId:x.user_public_id, userName:x.user_name, projectTitle:x.project_title, amount:toMoney(x.amount_minor), currency:x.currency, sourceReference:x.source_reference, status:x.status, createdAt:x.created_at })),
    auditLogs: auditResult.rows.map((a) => ({ id: a.id, actor: a.actor || 'سیستم', action: a.action, detail: a.detail, createdAt: a.created_at })),
    settings: {
      depositAddresses: addressesResult.rows,
      depositNoticeHours: Number(settingsMap.deposit_notice_hours ?? 24),
      minimumWithdrawal: toMoney(settingsMap.minimum_withdrawal_minor ?? 2000),
      referralPercent: Number(settingsMap.referral_percent ?? 10),
      levelThresholds: Array.isArray(settingsMap.level_thresholds) ? settingsMap.level_thresholds : [{ level: 1, points: 0 }],
      stats: (() => {
        const manual = settingsMap.homepage_stats?.manual || {};
        const mode = settingsMap.homepage_stats?.mode || 'calculated';
        return mode === 'manual'
          ? { users: Number(manual.users || 0), volume: Number(manual.volume || 0), projects: Number(manual.projects || 0), countries: Number(manual.countries || 0), dailyGrowth: Number(manual.dailyGrowth || 0), displayMode: 'manual' }
          : { users: Number(statsUsers), volume: toMoney(platformMetrics.total_deposited_minor), projects: Number(projectsResult.rowCount), countries: Number(platformMetrics.total_countries || 0), dailyGrowth: 0, displayMode: 'calculated' };
      })(),
      syntheticDemoData: Boolean(settingsMap.xbank_synthetic_seed?.version),
      financialProductsEnabled: settingsMap.financial_products_enabled || {},
      financialOperationsReady: process.env.FINANCIAL_OPERATIONS_ENABLED === 'true' && (NODE_ENV !== 'production' || Boolean(process.env.LEGAL_COMPLIANCE_APPROVAL_ID)),
    },
  };
}

async function requireFinancialAccess(session, feature) {
  requireAuth(session);
  if (!await featureEnabled(feature)) throw Object.assign(new Error('این قابلیت تا زمان تکمیل بررسی حقوقی، تأیید ارائه‌دهنده خدمات و فعال‌سازی امن غیرفعال است.'), { status: 423 });
  if (!session.email_verified_at || session.identity_status !== 'verified') throw Object.assign(new Error('تأیید ایمیل و احراز هویت برای این عملیات الزامی است.'), { status: 403 });
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;
  const cookies = parseCookies(req.headers.cookie);
  let session = null;
  if (cookies.xb_session) session = await getSession(req);

  if (method === 'GET' && pathname === '/api/health') {
    await pool.query('SELECT 1');
    return sendJson(res, 200, { ok: true, app: 'xbank-platform', database: 'connected', mode: 'secured-financial-products-gated' });
  }
  if (method === 'GET' && pathname === '/api/auth/csrf') {
    const token = cookies.xb_csrf || randomToken(32);
    return sendJson(res, 200, { csrfToken: token }, { 'Set-Cookie': cookieOptions('xb_csrf', token, { httpOnly: false, maxAge: SESSION_DAYS * 86400 }) });
  }
  if (method === 'GET' && pathname === '/api/auth/me') {
    if (!session) return sendJson(res, 401, { error: 'Authentication required.' });
    const wallet = await pool.query("SELECT * FROM wallets WHERE user_id=$1 AND currency='DAI'", [session.id]);
    const row = { ...session, wallet: wallet.rowCount ? mapWallet(wallet.rows[0]) : undefined };
    return sendJson(res, 200, { user: publicUser(row) });
  }

  if (method === 'POST' && (pathname === '/api/auth/register' || pathname === '/api/auth/login')) {
    await checkCsrf(req, null);
    const ipKey = req.socket.remoteAddress || 'unknown';
    rateLimit(`${pathname}:${ipKey}`, pathname.endsWith('login') ? 8 : 5);
    const body = await readBody(req);
    if (pathname.endsWith('register')) {
      const displayName = String(body.name || '').trim().replace(/\s+/g, ' ');
      const email = String(body.email || '').trim().toLowerCase();
      const username = String(body.username || email.split('@')[0]).trim().toLowerCase();
      const password = String(body.password || '');
      const country = String(body.country || '').trim().slice(0, 100);
      const locale = ['en', 'ar', 'tr'].includes(body.locale) ? body.locale : 'en';
      if (displayName.length < 2 || displayName.length > 100 || !isEmail(email)) return sendJson(res, 400, { error: 'نام و ایمیل معتبر الزامی است.' });
      if (!/^[a-z0-9_.-]{3,32}$/.test(username)) return sendJson(res, 400, { error: 'نام کاربری باید ۳ تا ۳۲ کاراکتر باشد.' });
      try { assertPasswordPolicy(password); } catch (error) { return sendJson(res, 400, { error: error.message }); }
      const requireEmailVerification = NODE_ENV === 'production' && process.env.EMAIL_VERIFICATION_REQUIRED === 'true';
      if (requireEmailVerification && (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.MAIL_FROM || !process.env.PUBLIC_BASE_URL)) {
        return sendJson(res, 503, { error: 'Email verification is required but SMTP is not configured. Contact the platform operator.' });
      }
      const passwordHash = await hashPassword(password);
      const verificationToken = requireEmailVerification ? randomToken(40) : null;
      const userId = id();
      const publicId = publicRef('XB');
      const referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();
      let referredBy = null;
      if (body.referralCode) {
        const referral = await pool.query('SELECT id FROM users WHERE referral_code=$1 AND account_status=\'active\'', [String(body.referralCode).trim().toUpperCase()]);
        referredBy = referral.rows[0]?.id || null;
      }
      try {
        await withTransaction(async (client) => {
          await client.query(`INSERT INTO users(id,public_id,username,email,password_hash,display_name,country,locale,role,account_status,email_verified_at,referral_code,referred_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'customer','active',$9,$10,$11)`, [userId, publicId, username, email, passwordHash, displayName, country, locale, NODE_ENV === 'production' && process.env.EMAIL_VERIFICATION_REQUIRED === 'true' ? null : new Date(), referralCode, referredBy]);
          await client.query("INSERT INTO wallets(user_id,currency) VALUES($1,'DAI')", [userId]);
          if (verificationToken) await client.query(`INSERT INTO email_verification_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '24 hours')`, [id(), userId, sha256(verificationToken)]);
          await audit(client, userId, 'ثبت‌نام کاربر', `ایجاد حساب ${publicId}`, req);
        });
      } catch (error) {
        if (error.code === '23505') return sendJson(res, 409, { error: 'ایمیل یا نام کاربری قبلاً ثبت شده است.' });
        throw error;
      }
      let verificationSent = false;
      if (verificationToken) {
        const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
        const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
        try {
          await sendPlatformEmail({ to: email, subject: 'Verify your XBank email', text: `Verify your XBank account within 24 hours: ${verifyUrl}` });
          verificationSent = true;
        } catch (mailError) {
          console.error('Verification email could not be sent:', mailError.message);
        }
      }
      const createdSession = await createSession(req, res, userId);
      const result = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
      return sendJson(res, 201, { user: publicUser(result.rows[0]), csrfToken: createdSession.csrfToken, message: verificationToken ? (verificationSent ? 'Account created. Check your email to verify your address.' : 'Account created, but the verification email could not be sent. Use the resend verification action in your profile.') : 'حساب کاربری ایجاد شد.' });
    }

    const identity = String(body.identity || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!identity || !password) return sendJson(res, 400, { error: 'نام کاربری/ایمیل و گذرواژه الزامی است.' });
    const userResult = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1) LIMIT 1', [identity]);
    const user = userResult.rows[0];
    const valid = user && user.account_status === 'active' && await verifyPassword(password, user.password_hash);
    const staffRole = user && ['admin', 'finance', 'support'].includes(user.role);
    if (!valid || (body.adminOnly && !staffRole) || (!body.adminOnly && staffRole)) {
      await pool.query('INSERT INTO audit_logs(id,actor_user_id,action,detail,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,$6)', [id(), user?.id || null, 'ورود ناموفق', `شناسه ورود: ${identity.slice(0, 100)}`, req.socket.remoteAddress || null, String(req.headers['user-agent'] || '').slice(0, 500)]);
      return sendJson(res, 401, { error: staffRole ? 'برای ورود کارکنان از مسیر خصوصی مدیریت استفاده کنید.' : 'اطلاعات ورود معتبر نیست یا دسترسی مدیر ندارید.' });
    }
    const createdSession = await createSession(req, res, user.id);
    await pool.query('UPDATE users SET updated_at=NOW() WHERE id=$1', [user.id]);
    return sendJson(res, 200, { user: publicUser(user), csrfToken: createdSession.csrfToken, message: 'ورود موفق بود.' });
  }
  if (method === 'POST' && pathname === '/api/auth/logout') {
    await checkCsrf(req, session);
    if (session) await pool.query('DELETE FROM sessions WHERE id=$1', [session.session_id]);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }
  if (pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(method)) await checkCsrf(req, session);
  }

  if (method === 'POST' && pathname === '/api/auth/verify-email') {
    const body = await readBody(req);
    const token = String(body.token || '');
    if (token.length < 32 || token.length > 256) return sendJson(res, 400, { error: 'Verification link is invalid.' });
    const result = await withTransaction(async (client) => {
      const tokenRow = await client.query(`SELECT id,user_id FROM email_verification_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE`, [sha256(token)]);
      if (!tokenRow.rowCount) throw Object.assign(new Error('Verification link is invalid or expired.'), { status: 400 });
      await client.query('UPDATE users SET email_verified_at=NOW(),updated_at=NOW() WHERE id=$1', [tokenRow.rows[0].user_id]);
      await client.query('UPDATE email_verification_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL', [tokenRow.rows[0].user_id]);
      await audit(client, tokenRow.rows[0].user_id, 'تأیید ایمیل', 'Email address verified using a single-use token.', req);
      return { ok: true };
    });
    return sendJson(res, 200, { ...result, message: 'Email verified successfully. You can now sign in.' });
  }

  if (method === 'POST' && pathname === '/api/auth/verification/resend') {
    requireAuth(session);
    rateLimit(`verification-resend:${session.id}`, 3, 60 * 60 * 1000);
    if (session.email_verified_at) return sendJson(res, 200, { message: 'Your email is already verified.' });
    const token = randomToken(40);
    await withTransaction(async (client) => {
      await client.query('UPDATE email_verification_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL', [session.id]);
      await client.query(`INSERT INTO email_verification_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '24 hours')`, [id(), session.id, sha256(token)]);
    });
    const verifyUrl = `${String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
    try {
      await sendPlatformEmail({ to: session.email, subject: 'Verify your XBank email', text: `Verify your XBank account within 24 hours: ${verifyUrl}` });
    } catch (mailError) {
      console.error('Verification resend failed:', mailError.message);
      return sendJson(res, 503, { error: 'Verification email could not be sent. Contact the platform operator.' });
    }
    return sendJson(res, 200, { message: 'A new verification link has been sent.' });
  }

  if (method === 'POST' && pathname === '/api/auth/password/forgot') {
    const body = await readBody(req);
    const identity = String(body.identity || '').trim().toLowerCase().slice(0, 254);
    rateLimit(`password-forgot:${req.socket.remoteAddress || 'unknown'}`, 5, 60 * 60 * 1000);
    if (identity) {
      const user = await pool.query("SELECT id,email FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1) LIMIT 1", [identity]);
      if (user.rowCount) {
        const token = randomToken(40);
        await withTransaction(async (client) => {
          await client.query('UPDATE password_reset_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL', [user.rows[0].id]);
          await client.query(`INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 minutes')`, [id(), user.rows[0].id, sha256(token)]);
          await audit(client, user.rows[0].id, 'درخواست بازیابی گذرواژه', 'Password reset requested.', req);
        });
        const resetUrl = `${String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
        if (NODE_ENV !== 'production') {
          return sendJson(res, 200, { message: 'If the account exists, a reset link has been created.', developmentResetUrl: resetUrl });
        }
        try { await sendPlatformEmail({ to: user.rows[0].email, subject: 'Reset your XBank password', text: `Reset your password within 30 minutes: ${resetUrl}` }); }
        catch (mailError) { console.error('Password reset email failed:', mailError.message); }
      }
    }
    return sendJson(res, 200, { message: 'If the account exists, password reset instructions will be sent to its registered email.' });
  }

  if (method === 'POST' && pathname === '/api/auth/password/reset') {
    const body = await readBody(req);
    const token = String(body.token || '');
    const password = String(body.password || '');
    try { assertPasswordPolicy(password); } catch (error) { return sendJson(res, 400, { error: error.message }); }
    if (token.length < 32 || token.length > 256) return sendJson(res, 400, { error: 'Reset token is invalid.' });
    const passwordHash = await hashPassword(password);
    await withTransaction(async (client) => {
      const tokenRow = await client.query(`SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE`, [sha256(token)]);
      if (!tokenRow.rowCount) throw Object.assign(new Error('Reset link is invalid or expired.'), { status: 400 });
      await client.query('UPDATE users SET password_hash=$2,updated_at=NOW() WHERE id=$1', [tokenRow.rows[0].user_id,passwordHash]);
      await client.query('UPDATE password_reset_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL', [tokenRow.rows[0].user_id]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [tokenRow.rows[0].user_id]);
      await audit(client, tokenRow.rows[0].user_id, 'تغییر گذرواژه', 'Password changed using a single-use reset token.', req);
    });
    clearSessionCookie(res);
    return sendJson(res, 200, { message: 'Password changed. Please sign in with your new password.' });
  }

  if (method === 'GET' && pathname === '/api/market/tickers') return sendJson(res, 200, marketFeed.snapshot());
  if (method === 'GET' && pathname === '/api/market/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const publish = (snapshot) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(snapshot)}\n\n`); };
    publish(marketFeed.snapshot());
    marketFeed.on('update', publish);
    const heartbeat = setInterval(() => publish(marketFeed.snapshot()), 5000);
    res.on('close', () => { clearInterval(heartbeat); marketFeed.off('update', publish); });
    return;
  }

  if (method === 'GET' && pathname === '/api/state') {
    requireAuth(session);
    return sendJson(res, 200, await stateFor(session));
  }

  if (method === 'POST' && pathname === '/api/deposits') {
    requireAuth(session);
    await requireFinancialAccess(session, 'deposits');
    const body = await readBody(req);
    const amountMinor = moneyToMinor(body.amount);
    const network = String(body.network || '');
    const txid = String(body.txid || '').trim().toLowerCase();
    if (!['BNB Smart Chain', 'Base'].includes(network) || !/^0x[a-fA-F0-9]{64}$/.test(txid)) return sendJson(res, 400, { error: 'شبکه یا شناسه تراکنش EVM معتبر نیست؛ TXID باید 0x و ۶۴ رقم هگزادسیمال داشته باشد.' });
    const addr = await pool.query('SELECT id,address,token_contract,chain_id FROM deposit_addresses WHERE network=$1 AND currency=\'DAI\' AND active=TRUE LIMIT 1', [network]);
    if (!addr.rowCount || !/^0x[a-fA-F0-9]{40}$/.test(addr.rows[0].token_contract || '')) return sendJson(res, 409, { error: 'آدرس و قرارداد توکن DAI برای این شبکه هنوز توسط مدیریت پیکربندی نشده است.' });
    const depositId = id();
    const ref = publicRef('DP');
    try {
      await withTransaction(async (client) => {
        await client.query(`INSERT INTO deposit_requests(id,public_id,user_id,amount_minor,network,chain_id,txid,deposit_address_snapshot,token_contract_snapshot)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [depositId, ref, session.id, amountMinor, network, addr.rows[0].chain_id, txid, addr.rows[0].address, addr.rows[0].token_contract]);
        await audit(client, session.id, 'ثبت درخواست واریز', `${ref} · ${toMoney(amountMinor)} DAI`, req);
      });
    } catch (error) {
      if (error.code === '23505') return sendJson(res, 409, { error: 'این شناسه تراکنش قبلاً ثبت شده است.' });
      throw error;
    }
    return sendJson(res, 201, { deposit: { id: ref, status: 'pending' }, message: 'درخواست واریز برای بررسی مدیریت ثبت شد.' });
  }

  const reviewDepositMatch = pathname.match(/^\/api\/admin\/deposits\/([^/]+)$/);
  if (method === 'PATCH' && reviewDepositMatch) {
    requireRole(session, ['admin', 'finance']);
    const body = await readBody(req);
    const status = String(body.status || '');
    const note = String(body.note || '').trim().slice(0, 1000);
    if (!['approved', 'rejected'].includes(status)) return sendJson(res, 400, { error: 'وضعیت درخواست معتبر نیست.' });
    if (status === 'approved' && body.confirmedExternalSettlement !== true) return sendJson(res, 400, { error: 'برای تأیید، ابتدا بررسی تسویه خارجی را صریحاً تأیید کنید.' });
    if (status === 'approved' && body.verifiedAmount === undefined) return sendJson(res, 400, { error: 'مبلغ واقعی دریافت‌شده پس از بررسی زنجیره را وارد کنید.' });
    let response;
    try {
      response = await withTransaction(async (client) => {
        const d = await client.query(`SELECT d.*,u.display_name FROM deposit_requests d JOIN users u ON u.id=d.user_id WHERE d.public_id=$1 FOR UPDATE`, [reviewDepositMatch[1]]);
        if (!d.rowCount) throw Object.assign(new Error('درخواست پیدا نشد.'), { status: 404 });
        const deposit = d.rows[0];
        if (status === 'approved') {
          const verifiedMinor = moneyToMinor(body.verifiedAmount);
          if (verifiedMinor !== String(deposit.amount_minor)) throw Object.assign(new Error('مبلغ تأییدشده با مبلغ درخواست یکسان نیست. درخواست را رد کنید یا آن را جداگانه بررسی کنید.'), { status: 409 });
          if (!/^0x[a-fA-F0-9]{64}$/.test(deposit.txid)) throw Object.assign(new Error('شناسه تراکنش ذخیره‌شده قالب معتبر EVM ندارد.'), { status: 409 });
        }
        if (deposit.status !== 'pending') throw Object.assign(new Error('این درخواست قبلاً بررسی شده است.'), { status: 409 });
        let ledger = null;
        if (status === 'approved') {
          ledger = await createLedger(client, {
            transactionType: 'deposit', description: `Manual verified deposit ${deposit.public_id}`, createdBy: session.id,
            idempotencyKey: `deposit:${deposit.id}`,
            lines: [
              { accountCode: 'external_settlement_asset', debitMinor: deposit.amount_minor },
              { accountCode: 'customer_available_liability', userId: deposit.user_id, creditMinor: deposit.amount_minor },
            ], metadata: { depositId: deposit.id, network: deposit.network, txid: deposit.txid, verifiedAmountMinor: String(body.verifiedAmount), manualExternalSettlementConfirmation: true },
          });
          await client.query(`UPDATE wallets SET available_minor=available_minor+$2,deposited_total_minor=deposited_total_minor+$2,updated_at=NOW() WHERE user_id=$1 AND currency='DAI'`, [deposit.user_id, deposit.amount_minor]);
          const referral = await client.query('SELECT referred_by FROM users WHERE id=$1', [deposit.user_id]);
          if (referral.rows[0]?.referred_by) {
            const percent = await client.query("SELECT value FROM app_settings WHERE key='referral_percent'");
            const pct = Number(percent.rows[0]?.value ?? 0);
            const rewardMinor = (BigInt(deposit.amount_minor) * BigInt(Math.max(0, Math.min(50, Math.round(pct * 100)))) / 10000n).toString();
            await client.query(`INSERT INTO referral_rewards(id,referrer_user_id,referred_user_id,source_deposit_id,amount_minor,status)
              VALUES($1,$2,$3,$4,$5,'pending_compliance') ON CONFLICT DO NOTHING`, [id(), referral.rows[0].referred_by, deposit.user_id, deposit.id, rewardMinor]);
          }
        }
        await client.query(`UPDATE deposit_requests SET status=$2,note=$3,reviewed_by=$4,reviewed_at=NOW(),ledger_transaction_id=$5 WHERE id=$1`, [deposit.id, status, note, session.id, ledger?.id || null]);
        await audit(client, session.id, status === 'approved' ? 'تأیید واریز پس از بررسی دستی' : 'رد درخواست واریز', `${deposit.public_id} · ${toMoney(deposit.amount_minor)} DAI · ${note}`, req);
        return { id: deposit.public_id, status, ledgerReference: ledger?.reference || null };
      });
    } catch (error) { if (error.status) throw error; if (error.code === '23505') throw Object.assign(new Error('شناسه تراکنش یا ثبت دفترکل تکراری است.'), { status: 409 }); throw error; }
    return sendJson(res, 200, { deposit: response, message: status === 'approved' ? 'واریز تأیید و در دفتر کل ثبت شد.' : 'درخواست رد شد.' });
  }

  if (method === 'POST' && pathname === '/api/withdrawals') {
    requireAuth(session);
    await requireFinancialAccess(session, 'withdrawals');
    const body = await readBody(req);
    const amountMinor = moneyToMinor(body.amount);
    const network = String(body.network || '');
    const address = String(body.address || '').trim();
    if (!['BNB Smart Chain', 'Base'].includes(network) || !/^0x[a-fA-F0-9]{40}$/.test(address)) return sendJson(res, 400, { error: 'شبکه یا آدرس کیف پول مقصد معتبر نیست.' });
    const minSetting = await setting('minimum_withdrawal_minor', 2000);
    if (BigInt(amountMinor) < BigInt(minSetting)) return sendJson(res, 400, { error: `حداقل مبلغ برداشت ${toMoney(minSetting)} DAI است.` });
    const ref = publicRef('WD');
    const withdrawal = await withTransaction(async (client) => {
      const wallet = await client.query("SELECT available_minor FROM wallets WHERE user_id=$1 AND currency='DAI' FOR UPDATE", [session.id]);
      if (!wallet.rowCount || BigInt(wallet.rows[0].available_minor) < BigInt(amountMinor)) throw Object.assign(new Error('موجودی قابل برداشت کافی نیست.'), { status: 409 });
      const reserve = await createLedger(client, { transactionType: 'withdrawal_reserve', description: `Reserve withdrawal ${ref}`, createdBy: session.id, idempotencyKey: `withdrawal-reserve:${ref}`, lines: [
        { accountCode: 'customer_available_liability', userId: session.id, debitMinor: amountMinor },
        { accountCode: 'customer_withdrawal_payable', userId: session.id, creditMinor: amountMinor },
      ] });
      await client.query(`UPDATE wallets SET available_minor=available_minor-$2,withdrawal_pending_minor=withdrawal_pending_minor+$2,updated_at=NOW() WHERE user_id=$1 AND currency='DAI'`, [session.id, amountMinor]);
      const inserted = await client.query(`INSERT INTO withdrawal_requests(id,public_id,user_id,amount_minor,network,destination_address,ledger_reserve_id)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id(), ref, session.id, amountMinor, network, address, reserve.id]);
      await audit(client, session.id, 'ثبت درخواست برداشت', `${ref} · ${toMoney(amountMinor)} DAI`, req);
      return inserted.rows[0];
    });
    return sendJson(res, 201, { withdrawal: { id: withdrawal.public_id, status: withdrawal.status }, message: 'درخواست برداشت ثبت شد و برای بررسی ارسال گردید.' });
  }

  const reviewWithdrawalMatch = pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)$/);
  if (method === 'PATCH' && reviewWithdrawalMatch) {
    requireRole(session, ['admin', 'finance']);
    const body = await readBody(req);
    const status = String(body.status || '');
    const note = String(body.note || '').trim().slice(0, 1000);
    if (!['approved', 'paid', 'rejected'].includes(status)) return sendJson(res, 400, { error: 'وضعیت باید approved، paid یا rejected باشد.' });
    if (status === 'paid' && !/^0x[a-fA-F0-9]{64}$/.test(String(body.payoutTxid || '').trim())) return sendJson(res, 400, { error: 'شناسه تراکنش پرداخت باید 0x به‌علاوه ۶۴ رقم هگزادسیمال باشد.' });
    const row = await withTransaction(async (client) => {
      const result = await client.query('SELECT * FROM withdrawal_requests WHERE public_id=$1 FOR UPDATE', [reviewWithdrawalMatch[1]]);
      if (!result.rowCount) throw Object.assign(new Error('درخواست برداشت پیدا نشد.'), { status: 404 });
      const w = result.rows[0];
      if (!['pending', 'approved'].includes(w.status)) throw Object.assign(new Error('این درخواست قبلاً نهایی شده است.'), { status: 409 });
      if (status === 'approved') {
        if (w.status !== 'pending') throw Object.assign(new Error('درخواست قبلاً تأیید شده است.'), { status: 409 });
        await client.query("UPDATE withdrawal_requests SET status='approved',note=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$1", [w.id, note, session.id]);
        await audit(client, session.id, 'تأیید درخواست برداشت', `${w.public_id} · ${note}`, req);
        return { id: w.public_id, status: 'approved', ledgerReference: null };
      }
      let settlement = null;
      if (status === 'paid') {
        if (w.status !== 'approved') throw Object.assign(new Error('ابتدا درخواست برداشت را تأیید کنید.'), { status: 409 });
        settlement = await createLedger(client, { transactionType: 'withdrawal_paid', description: `Manual payout ${w.public_id}`, createdBy: session.id, idempotencyKey: `withdrawal-paid:${w.id}`, metadata: { payoutTxid: String(body.payoutTxid).trim(), manualPayoutConfirmation: true }, lines: [
          { accountCode: 'customer_withdrawal_payable', userId: w.user_id, debitMinor: w.amount_minor },
          { accountCode: 'external_settlement_asset', creditMinor: w.amount_minor },
        ] });
        await client.query(`UPDATE wallets SET withdrawal_pending_minor=withdrawal_pending_minor-$2,withdrawn_total_minor=withdrawn_total_minor+$2,updated_at=NOW() WHERE user_id=$1 AND currency='DAI'`, [w.user_id, w.amount_minor]);
      } else {
        await createLedger(client, { transactionType: 'withdrawal_release', description: `Release rejected withdrawal ${w.public_id}`, createdBy: session.id, idempotencyKey: `withdrawal-release:${w.id}`, lines: [
          { accountCode: 'customer_withdrawal_payable', userId: w.user_id, debitMinor: w.amount_minor },
          { accountCode: 'customer_available_liability', userId: w.user_id, creditMinor: w.amount_minor },
        ] });
        await client.query(`UPDATE wallets SET available_minor=available_minor+$2,withdrawal_pending_minor=withdrawal_pending_minor-$2,updated_at=NOW() WHERE user_id=$1 AND currency='DAI'`, [w.user_id, w.amount_minor]);
      }
      await client.query(`UPDATE withdrawal_requests SET status=$2,payout_txid=$3,note=$4,reviewed_by=$5,reviewed_at=NOW(),ledger_settlement_id=$6 WHERE id=$1`, [w.id, status, status === 'paid' ? String(body.payoutTxid).trim() : null, note, session.id, settlement?.id || null]);
      await audit(client, session.id, status === 'paid' ? 'ثبت پرداخت برداشت' : 'رد و آزادسازی برداشت', `${w.public_id} · ${note}`, req);
      return { id: w.public_id, status, ledgerReference: settlement?.reference || null };
    });
    return sendJson(res, 200, { withdrawal: row, message: status === 'approved' ? 'درخواست برداشت تأیید شد و در انتظار پرداخت است.' : status === 'paid' ? 'پرداخت دستی ثبت شد.' : 'درخواست رد شد و مبلغ رزروشده آزاد شد.' });
  }

  if (method === 'POST' && pathname === '/api/investments') {
    requireAuth(session);
    await requireFinancialAccess(session, 'investments');
    const body = await readBody(req);
    const projectId = String(body.projectId || '');
    const amountMinor = moneyToMinor(body.amount);
    const result = await withTransaction(async (client) => {
      const p = await client.query('SELECT * FROM projects WHERE public_id=$1 FOR UPDATE', [projectId]);
      if (!p.rowCount) throw Object.assign(new Error('پروژه پیدا نشد.'), { status: 404 });
      const project = p.rows[0];
      if (project.status !== 'active' || !project.investments_enabled || project.compliance_status !== 'approved') throw Object.assign(new Error('این پروژه برای سرمایه‌گذاری فعال و تأییدشده نیست.'), { status: 423 });
      if (BigInt(amountMinor) < BigInt(project.minimum_minor) || (BigInt(project.maximum_minor) > 0n && BigInt(amountMinor) > BigInt(project.maximum_minor))) throw Object.assign(new Error('مبلغ خارج از محدوده مجاز پروژه است.'), { status: 400 });
      if (BigInt(project.target_minor) > 0n && BigInt(project.raised_minor) + BigInt(amountMinor) > BigInt(project.target_minor)) throw Object.assign(new Error('ظرفیت تأمین مالی پروژه با این مبلغ تکمیل می‌شود یا از هدف عبور می‌کند.'), { status: 409 });
      const wallet = await client.query("SELECT available_minor FROM wallets WHERE user_id=$1 AND currency='DAI' FOR UPDATE", [session.id]);
      if (!wallet.rowCount || BigInt(wallet.rows[0].available_minor) < BigInt(amountMinor)) throw Object.assign(new Error('موجودی آزاد کافی نیست.'), { status: 409 });
      const ref = publicRef('IN');
      const ledger = await createLedger(client, { transactionType: 'investment_allocation', description: `Investment allocation ${ref}`, createdBy: session.id, idempotencyKey: `investment:${ref}`, lines: [
        { accountCode: 'customer_available_liability', userId: session.id, debitMinor: amountMinor },
        { accountCode: 'customer_invested_liability', userId: session.id, creditMinor: amountMinor },
      ] });
      const investmentId = id();
      await client.query(`INSERT INTO investments(id,public_id,user_id,project_id,amount_minor,ledger_transaction_id)
        VALUES($1,$2,$3,$4,$5,$6)`, [investmentId, ref, session.id, project.id, amountMinor, ledger.id]);
      await client.query(`UPDATE wallets SET available_minor=available_minor-$2,invested_minor=invested_minor+$2,updated_at=NOW() WHERE user_id=$1 AND currency='DAI'`, [session.id, amountMinor]);
      await client.query('UPDATE projects SET raised_minor=raised_minor+$2,updated_at=NOW() WHERE id=$1', [project.id, amountMinor]);
      await audit(client, session.id, 'ثبت سرمایه‌گذاری', `${ref} · ${toMoney(amountMinor)} DAI`, req);
      return { id: ref, amount: toMoney(amountMinor), status: 'active' };
    });
    return sendJson(res, 201, { investment: result, message: 'سرمایه‌گذاری ثبت شد.' });
  }

  const projectViewMatch = pathname.match(/^\/api\/projects\/([^/]+)\/view$/);
  if (method === 'POST' && projectViewMatch) {
    requireAuth(session);
    const project = await pool.query('SELECT id FROM projects WHERE public_id=$1', [projectViewMatch[1]]);
    if (!project.rowCount) return sendJson(res, 404, { error: 'پروژه پیدا نشد.' });
    await pool.query(`INSERT INTO project_views(user_id,project_id) VALUES($1,$2)
      ON CONFLICT(user_id,project_id) DO UPDATE SET last_viewed_at=NOW(),view_count=project_views.view_count+1`, [session.id, project.rows[0].id]);
    return sendJson(res, 200, { ok: true });
  }

  const projectReactionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/reaction$/);
  if (method === 'PUT' && projectReactionMatch) {
    requireAuth(session);
    const body = await readBody(req);
    const reaction = String(body.reaction || '');
    if (!['like','dislike','clear'].includes(reaction)) return sendJson(res, 400, { error: 'واکنش معتبر نیست.' });
    const project = await pool.query('SELECT id FROM projects WHERE public_id=$1', [projectReactionMatch[1]]);
    if (!project.rowCount) return sendJson(res, 404, { error: 'پروژه پیدا نشد.' });
    if (reaction === 'clear') await pool.query('DELETE FROM project_reactions WHERE user_id=$1 AND project_id=$2', [session.id, project.rows[0].id]);
    else await pool.query(`INSERT INTO project_reactions(user_id,project_id,reaction) VALUES($1,$2,$3)
      ON CONFLICT(user_id,project_id) DO UPDATE SET reaction=EXCLUDED.reaction,updated_at=NOW()`, [session.id, project.rows[0].id, reaction]);
    return sendJson(res, 200, { ok: true, reaction });
  }

  const missionClaimMatch = pathname.match(/^\/api\/missions\/([^/]+)\/claim$/);
  if (method === 'POST' && missionClaimMatch) {
    requireAuth(session);
    const result = await withTransaction(async (client) => {
      const missionResult = await client.query('SELECT * FROM missions WHERE code=$1 AND active=TRUE FOR UPDATE', [missionClaimMatch[1]]);
      if (!missionResult.rowCount) throw Object.assign(new Error('این مأموریت فعال نیست.'), { status: 404 });
      const mission = missionResult.rows[0];
      const current = await client.query('SELECT status FROM user_missions WHERE user_id=$1 AND mission_id=$2 FOR UPDATE', [session.id, mission.id]);
      if (current.rows[0]?.status === 'completed') throw Object.assign(new Error('این مأموریت قبلاً تکمیل شده است؛ امتیاز دوباره تعلق نمی‌گیرد.'), { status: 409 });
      let eligible = false;
      switch (mission.mission_type) {
        case 'complete_profile': {
          const u = await client.query(`SELECT birth_date,country,province,wallet_address,wallet_network FROM users WHERE id=$1`, [session.id]);
          const profile = u.rows[0];
          eligible = Boolean(profile?.birth_date && profile.country && profile.province && profile.wallet_address && ['BNB Smart Chain','Base'].includes(profile.wallet_network));
          break;
        }
        case 'verify_email': {
          const account = await client.query('SELECT email_verified_at FROM users WHERE id=$1', [session.id]);
          eligible = Boolean(account.rows[0]?.email_verified_at);
          break;
        }
        case 'view_3_projects': {
          const views = await client.query('SELECT COUNT(*)::int AS count FROM project_views WHERE user_id=$1', [session.id]);
          eligible = Number(views.rows[0]?.count || 0) >= 3;
          break;
        }
        case 'first_deposit': {
          const deposits = await client.query("SELECT 1 FROM deposit_requests WHERE user_id=$1 AND status='approved' LIMIT 1", [session.id]);
          eligible = deposits.rowCount > 0;
          break;
        }
        case 'first_investment': {
          const investments = await client.query('SELECT 1 FROM investments WHERE user_id=$1 LIMIT 1', [session.id]);
          eligible = investments.rowCount > 0;
          break;
        }
        case 'manual_review': {
          const existing = await client.query('SELECT id,status FROM user_missions WHERE user_id=$1 AND mission_id=$2 FOR UPDATE', [session.id, mission.id]);
          if (existing.rowCount && existing.rows[0].status !== 'rejected') {
            throw Object.assign(new Error(existing.rows[0].status === 'pending' ? 'درخواست این مأموریت در انتظار بررسی است.' : 'این مأموریت قبلاً تکمیل شده است.'), { status: 409 });
          }
          if (existing.rowCount) {
            await client.query(`UPDATE user_missions SET status='pending',completed_at=NULL,reviewed_by=NULL,review_note='',created_at=NOW() WHERE id=$1`, [existing.rows[0].id]);
          } else {
            await client.query(`INSERT INTO user_missions(id,user_id,mission_id,status) VALUES($1,$2,$3,'pending')`, [id(), session.id, mission.id]);
          }
          await audit(client, session.id, 'درخواست بررسی مأموریت', `${mission.code} · resubmitted=${existing.rowCount > 0}`, req);
          return { code: mission.code, status: 'pending', pointsAwarded: 0, message: 'درخواست برای بررسی مدیریت ارسال شد.' };
        }
        default: throw Object.assign(new Error('نوع مأموریت پشتیبانی نمی‌شود.'), { status: 423 });
      }
      if (!eligible) throw Object.assign(new Error('شرط تکمیل این مأموریت هنوز احراز نشده است.'), { status: 409 });
      const claimed = await client.query(`INSERT INTO user_missions(id,user_id,mission_id,status,completed_at)
        VALUES($1,$2,$3,'completed',NOW()) ON CONFLICT(user_id,mission_id) DO NOTHING RETURNING id`, [id(), session.id, mission.id]);
      if (!claimed.rowCount) throw Object.assign(new Error('این مأموریت قبلاً ثبت شده و امتیاز آن دوباره تعلق نمی‌گیرد.'), { status: 409 });
      const updatedUser = await client.query('UPDATE users SET points=points+$2,updated_at=NOW() WHERE id=$1 RETURNING points,level', [session.id, mission.points]);
      const levels = await client.query("SELECT value FROM app_settings WHERE key='level_thresholds'");
      const rules = Array.isArray(levels.rows[0]?.value) ? levels.rows[0].value : [{ level: 1, points: 0 }];
      const eligibleLevels = rules.filter((rule) => Number.isInteger(Number(rule.level)) && Number.isFinite(Number(rule.points)) && Number(updatedUser.rows[0].points) >= Number(rule.points));
      const nextLevel = eligibleLevels.length ? Math.max(...eligibleLevels.map((rule) => Number(rule.level))) : Number(updatedUser.rows[0].level);
      await client.query('UPDATE users SET level=$2 WHERE id=$1', [session.id, Math.min(100, Math.max(1, nextLevel))]);
      await audit(client, session.id, 'تکمیل مأموریت', `${mission.code} · ${mission.points} points`, req);
      return { code: mission.code, pointsAwarded: mission.points, totalPoints: Number(updatedUser.rows[0].points), level: Math.min(100, Math.max(1, nextLevel)) };
    });
    return sendJson(res, 200, { mission: result, message: result.status === 'pending' ? result.message : 'مأموریت تکمیل شد و امتیاز آن ثبت گردید.' });
  }

  if (method === 'POST' && pathname === '/api/support/tickets') {
    requireAuth(session);
    const body = await readBody(req);
    const subject = String(body.subject || '').trim().slice(0, 150);
    const message = String(body.message || '').trim().slice(0, 5000);
    if (subject.length < 4 || message.length < 10) return sendJson(res, 400, { error: 'موضوع و متن درخواست معتبر نیست.' });
    const ref = publicRef('SP');
    await withTransaction(async (client) => {
      await client.query('INSERT INTO support_tickets(id,public_id,user_id,subject,message) VALUES($1,$2,$3,$4,$5)', [id(), ref, session.id, subject, message]);
      await audit(client, session.id, 'ثبت تیکت پشتیبانی', ref, req);
    });
    return sendJson(res, 201, { ticket: { id: ref, status: 'open' }, message: 'درخواست پشتیبانی ثبت شد.' });
  }

  if (method === 'PUT' && pathname === '/api/profile') {
    requireAuth(session);
    const body = await readBody(req);
    const displayName = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const country = String(body.country || '').trim().slice(0, 100);
    const province = String(body.province || '').trim().slice(0, 100);
    const birthDate = String(body.birthDate || '').trim();
    const walletAddress = String(body.walletAddress || '').trim();
    const walletNetwork = String(body.walletNetwork || '').trim();
    const locale = ['en', 'ar', 'tr'].includes(body.locale) ? body.locale : session.locale;
    if (displayName.length < 2) return sendJson(res, 400, { error: 'نام معتبر نیست.' });
    if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`)))) return sendJson(res, 400, { error: 'تاریخ تولد معتبر نیست.' });
    if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return sendJson(res, 400, { error: 'آدرس کیف پول EVM معتبر نیست.' });
    if (walletAddress && !['BNB Smart Chain','Base'].includes(walletNetwork)) return sendJson(res, 400, { error: 'شبکه کیف پول را انتخاب کنید.' });
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET display_name=$2,country=$3,province=$4,birth_date=$5,wallet_address=$6,wallet_network=$7,locale=$8,updated_at=NOW() WHERE id=$1', [session.id, displayName, country, province, birthDate || null, walletAddress, walletNetwork, locale]);
      await audit(client, session.id, 'ویرایش پروفایل', 'اطلاعات پروفایل به‌روزرسانی شد.', req);
    });
    return sendJson(res, 200, { message: 'پروفایل ذخیره شد.' });
  }

  if (pathname.startsWith('/api/admin/')) requireRole(session, ['admin', 'finance', 'support']);

  const identityMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/identity$/);
  if (method === 'PATCH' && identityMatch) {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    const identityStatus = String(body.status || '');
    if (!['pending','verified','rejected'].includes(identityStatus)) return sendJson(res, 400, { error: 'وضعیت احراز هویت معتبر نیست.' });
    const result = await withTransaction(async (client) => {
      const updated = await client.query('UPDATE users SET identity_status=$2,updated_at=NOW() WHERE public_id=$1 RETURNING id,display_name', [identityMatch[1], identityStatus]);
      if (!updated.rowCount) throw Object.assign(new Error('کاربر پیدا نشد.'), { status: 404 });
      await audit(client, session.id, 'تغییر وضعیت احراز هویت', `${updated.rows[0].display_name} · ${identityStatus}`, req);
      return updated.rows[0];
    });
    return sendJson(res, 200, { message: 'وضعیت احراز هویت ذخیره شد.', user: result });
  }

  const userStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (method === 'PATCH' && userStatusMatch) {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    const status = String(body.status || '');
    if (!['active','suspended','closed'].includes(status)) return sendJson(res, 400, { error: 'وضعیت حساب معتبر نیست.' });
    const result = await withTransaction(async (client) => {
      const target = await client.query('SELECT id,public_id,display_name,role FROM users WHERE public_id=$1 FOR UPDATE', [userStatusMatch[1]]);
      if (!target.rowCount) throw Object.assign(new Error('کاربر پیدا نشد.'), { status: 404 });
      if (target.rows[0].id === session.id || target.rows[0].role !== 'customer') throw Object.assign(new Error('تغییر وضعیت حساب کارکنان یا حساب خود مدیر از این مسیر مجاز نیست.'), { status: 403 });
      await client.query('UPDATE users SET account_status=$2,updated_at=NOW() WHERE id=$1', [target.rows[0].id,status]);
      if (status !== 'active') await client.query('DELETE FROM sessions WHERE user_id=$1', [target.rows[0].id]);
      await audit(client,session.id,'تغییر وضعیت حساب کاربر',`${target.rows[0].display_name} · ${status}`,req);
      return { id:target.rows[0].public_id,status,name:target.rows[0].display_name };
    });
    return sendJson(res,200,{ user:result,message:'وضعیت حساب کاربر به‌روزرسانی شد.' });
  }

  const referralReportMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/referrals$/);
  if (method === 'GET' && referralReportMatch) {
    requireRole(session, ['admin', 'finance']);
    const root = await pool.query('SELECT id,public_id FROM users WHERE public_id=$1', [referralReportMatch[1]]);
    if (!root.rowCount) return sendJson(res, 404, { error: 'کاربر پیدا نشد.' });
    const tree = await pool.query(`WITH RECURSIVE referral_tree AS (
      SELECT u.id,u.public_id,u.display_name,u.email,u.country,u.level,u.points,u.account_status,u.created_at,1 AS depth,ARRAY[u.id] AS path
      FROM users u WHERE u.referred_by=$1
      UNION ALL
      SELECT child.id,child.public_id,child.display_name,child.email,child.country,child.level,child.points,child.account_status,child.created_at,parent.depth+1,parent.path||child.id
      FROM users child JOIN referral_tree parent ON child.referred_by=parent.id
      WHERE parent.depth<10 AND NOT child.id=ANY(parent.path)
    )
    SELECT rt.*,COALESCE(w.deposited_total_minor,0)::text AS deposited_minor,COALESCE(w.available_minor,0)::text AS available_minor,
      (SELECT COUNT(*)::int FROM users sub WHERE sub.referred_by=rt.id) AS direct_referrals
    FROM referral_tree rt LEFT JOIN wallets w ON w.user_id=rt.id AND w.currency='DAI'
    ORDER BY rt.depth,rt.created_at DESC LIMIT 5000`, [root.rows[0].id]);
    return sendJson(res, 200, { root: root.rows[0].public_id, count: tree.rowCount, referrals: tree.rows.map((r) => ({ id:r.public_id,name:r.display_name,email:r.email,country:r.country,level:r.level,points:Number(r.points),status:r.account_status,depth:r.depth,directReferrals:r.direct_referrals,deposited:toMoney(r.deposited_minor),available:toMoney(r.available_minor),joinedAt:r.created_at })) });
  }

  if (method === 'GET' && pathname === '/api/admin/support') {
    requireRole(session, ['admin', 'support']);
    const result = await pool.query(`SELECT t.*,u.public_id,u.display_name,u.email,
      COALESCE((SELECT json_agg(json_build_object('body',r.body,'author',au.display_name,'createdAt',r.created_at) ORDER BY r.created_at) FROM support_ticket_replies r JOIN users au ON au.id=r.author_user_id WHERE r.ticket_id=t.id),'[]'::json) AS replies
      FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 500`);
    return sendJson(res, 200, { tickets: result.rows });
  }

  const supportReplyMatch = pathname.match(/^\/api\/admin\/support\/([^/]+)\/replies$/);
  if (method === 'POST' && supportReplyMatch) {
    requireRole(session, ['admin','support']);
    const body = await readBody(req);
    const message = String(body.message || '').trim().slice(0, 5000);
    const status = ['open','in_progress','resolved','closed'].includes(body.status) ? body.status : 'in_progress';
    if (message.length < 2) return sendJson(res, 400, { error: 'متن پاسخ الزامی است.' });
    const result = await withTransaction(async (client) => {
      const ticket = await client.query('SELECT id,public_id FROM support_tickets WHERE public_id=$1 FOR UPDATE', [supportReplyMatch[1]]);
      if (!ticket.rowCount) throw Object.assign(new Error('تیکت پیدا نشد.'), { status: 404 });
      await client.query('INSERT INTO support_ticket_replies(id,ticket_id,author_user_id,body) VALUES($1,$2,$3,$4)', [id(), ticket.rows[0].id, session.id, message]);
      await client.query(`UPDATE support_tickets SET status=$2,assigned_to=$3,updated_at=NOW(),closed_at=CASE WHEN $2='closed' THEN NOW() ELSE NULL END WHERE id=$1`, [ticket.rows[0].id, status, session.id]);
      await audit(client, session.id, 'پاسخ به تیکت پشتیبانی', `${ticket.rows[0].public_id} · ${status}`, req);
      return { id: ticket.rows[0].public_id, status };
    });
    return sendJson(res, 200, { ticket: result, message: 'پاسخ ثبت شد.' });
  }

  if (method === 'GET' && pathname === '/api/admin/missions/pending') {
    requireRole(session, ['admin']);
    const result = await pool.query(`SELECT um.id,m.code,m.title,m.points,u.public_id AS user_id,u.display_name,u.email,um.created_at
      FROM user_missions um JOIN missions m ON m.id=um.mission_id JOIN users u ON u.id=um.user_id
      WHERE um.status='pending' ORDER BY um.created_at ASC LIMIT 500`);
    return sendJson(res, 200, { requests: result.rows.map((r) => ({ id:r.id,code:r.code,title:r.title,points:r.points,userId:r.user_id,userName:r.display_name,email:r.email,createdAt:r.created_at })) });
  }
  const missionReviewMatch = pathname.match(/^\/api\/admin\/missions\/([^/]+)\/users\/([^/]+)$/);
  if (method === 'PATCH' && missionReviewMatch) {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    const status = String(body.status || '');
    if (!['completed','rejected'].includes(status)) return sendJson(res, 400, { error: 'وضعیت بررسی معتبر نیست.' });
    const result = await withTransaction(async (client) => {
      const row = await client.query(`SELECT um.id,um.status,m.id AS mission_id,m.code,m.points,u.id AS user_id,u.display_name
        FROM user_missions um JOIN missions m ON m.id=um.mission_id JOIN users u ON u.id=um.user_id
        WHERE m.code=$1 AND u.public_id=$2 FOR UPDATE OF um`, [missionReviewMatch[1],missionReviewMatch[2]]);
      if (!row.rowCount || row.rows[0].status !== 'pending') throw Object.assign(new Error('درخواست در انتظار بررسی پیدا نشد یا قبلاً نهایی شده است.'), { status: 409 });
      const reviewNote = String(body.note || '').trim().slice(0, 1000);
      await client.query(`UPDATE user_missions SET status=$2,completed_at=CASE WHEN $2='completed' THEN NOW() ELSE NULL END,reviewed_by=$3,review_note=$4 WHERE id=$1`, [row.rows[0].id,status,session.id,reviewNote]);
      let awarded = 0;
      if (status === 'completed') {
        const updated = await client.query('UPDATE users SET points=points+$2,updated_at=NOW() WHERE id=$1 RETURNING points,level', [row.rows[0].user_id,row.rows[0].points]);
        const levels = await client.query("SELECT value FROM app_settings WHERE key='level_thresholds'");
        const rules = Array.isArray(levels.rows[0]?.value) ? levels.rows[0].value : [{level:1,points:0}];
        const eligible = rules.filter((rule) => Number.isInteger(Number(rule.level)) && Number.isFinite(Number(rule.points)) && Number(updated.rows[0].points) >= Number(rule.points));
        const nextLevel = eligible.length ? Math.max(...eligible.map((rule) => Number(rule.level))) : Number(updated.rows[0].level);
        await client.query('UPDATE users SET level=$2 WHERE id=$1',[row.rows[0].user_id,Math.min(100,Math.max(1,nextLevel))]);
        awarded = Number(row.rows[0].points);
      }
      await audit(client,session.id,'بررسی دستی مأموریت',`${row.rows[0].code} · ${row.rows[0].display_name} · ${status} · ${reviewNote}`,req);
      return {status,pointsAwarded:awarded};
    });
    return sendJson(res,200,{request:result,message:result.status==='completed'?'مأموریت تأیید و امتیاز ثبت شد.':'درخواست مأموریت رد شد.'});
  }

  if (method === 'POST' && pathname === '/api/admin/missions') {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    const code = String(body.code || '').trim().toLowerCase();
    const missionType = String(body.type || 'manual_review');
    const allowedTypes = ['complete_profile','verify_email','view_3_projects','first_deposit','first_investment','manual_review'];
    const points = Number(body.points);
    if (!/^[a-z0-9_]{3,60}$/.test(code) || !allowedTypes.includes(missionType) || !Number.isInteger(points) || points < 0 || points > 100000 || !body.title?.en || !body.title?.ar || !body.title?.tr) return sendJson(res, 400, { error: 'اطلاعات مأموریت معتبر نیست.' });
    const created = await withTransaction(async (client) => {
      const result = await client.query(`INSERT INTO missions(id,code,title,description,points,mission_type,active,one_time)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8) RETURNING code,points,active`, [id(), code, JSON.stringify(body.title), JSON.stringify(body.description || {}), points, missionType, Boolean(body.active), true]);
      await audit(client, session.id, 'ایجاد مأموریت', `${code} · ${points} points`, req);
      return result.rows[0];
    });
    return sendJson(res, 201, { mission: created, message: 'مأموریت ایجاد شد.' });
  }

  const missionAdminMatch = pathname.match(/^\/api\/admin\/missions\/([^/]+)$/);
  if (method === 'PATCH' && missionAdminMatch) {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    const points = body.points === undefined ? null : Number(body.points);
    if (points !== null && (!Number.isInteger(points) || points < 0 || points > 100000)) return sendJson(res, 400, { error: 'امتیاز معتبر نیست.' });
    const updated = await withTransaction(async (client) => {
      const row = await client.query('SELECT * FROM missions WHERE code=$1 FOR UPDATE', [missionAdminMatch[1]]);
      if (!row.rowCount) throw Object.assign(new Error('مأموریت پیدا نشد.'), { status: 404 });
      const m = row.rows[0];
      const title = body.title || m.title;
      if (!title.en || !title.ar || !title.tr) throw Object.assign(new Error('عنوان هر سه زبان الزامی است.'), { status: 400 });
      const result = await client.query(`UPDATE missions SET title=$2::jsonb,description=$3::jsonb,points=$4,active=$5,one_time=$6 WHERE id=$1 RETURNING code,points,active`, [m.id, JSON.stringify(title), JSON.stringify(body.description ?? m.description), points ?? m.points, body.active === undefined ? m.active : Boolean(body.active), true]);
      await audit(client, session.id, 'به‌روزرسانی مأموریت', `${m.code} · ${result.rows[0].points} points`, req);
      return result.rows[0];
    });
    return sendJson(res, 200, { mission: updated, message: 'مأموریت به‌روزرسانی شد.' });
  }

  if (method === 'GET' && pathname === '/api/admin/reconciliation') {
    requireRole(session, ['admin','finance']);
    const result = await pool.query(`SELECT u.public_id,u.display_name,w.currency,
      w.available_minor::text AS wallet_available,
      COALESCE(SUM(le.credit_minor-le.debit_minor) FILTER (WHERE le.account_code='customer_available_liability'),0)::text AS ledger_available,
      w.invested_minor::text AS wallet_invested,
      COALESCE(SUM(le.credit_minor-le.debit_minor) FILTER (WHERE le.account_code='customer_invested_liability'),0)::text AS ledger_invested,
      w.withdrawal_pending_minor::text AS wallet_withdrawal_pending,
      COALESCE(SUM(le.credit_minor-le.debit_minor) FILTER (WHERE le.account_code='customer_withdrawal_payable'),0)::text AS ledger_withdrawal_pending
      FROM wallets w JOIN users u ON u.id=w.user_id LEFT JOIN ledger_entries le ON le.user_id=u.id AND le.currency=w.currency
      GROUP BY u.public_id,u.display_name,w.currency,w.available_minor,w.invested_minor,w.withdrawal_pending_minor
      HAVING w.available_minor <> COALESCE(SUM(le.credit_minor-le.debit_minor) FILTER (WHERE le.account_code='customer_available_liability'),0)
        OR w.invested_minor <> COALESCE(SUM(le.credit_minor-le.debit_minor) FILTER (WHERE le.account_code='customer_invested_liability'),0)
        OR w.withdrawal_pending_minor <> COALESCE(SUM(le.credit_minor-le.debit_minor) FILTER (WHERE le.account_code='customer_withdrawal_payable'),0)
      ORDER BY u.public_id LIMIT 1000`);
    return sendJson(res, 200, { mismatches: result.rows, count: result.rowCount, reconciled: result.rowCount === 0 });
  }

  if (method === 'POST' && pathname === '/api/admin/entitlements') {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    const percentage = Number(body.percentage);
    const type = String(body.type || 'revenue_share');
    const legalReference = String(body.legalReference || '').trim().slice(0,200);
    if (!['equity','revenue_share','contractual_bonus'].includes(type) || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100 || legalReference.length < 4) return sendJson(res,400,{error:'نوع حق، درصد و مرجع حقوقی معتبر الزامی است.'});
    const created = await withTransaction(async(client)=>{
      const user = await client.query('SELECT id,display_name FROM users WHERE public_id=$1',[String(body.userId||'')]);
      const project = await client.query('SELECT id,title FROM projects WHERE public_id=$1',[String(body.projectId||'')]);
      if(!user.rowCount || !project.rowCount) throw Object.assign(new Error('کاربر یا پروژه پیدا نشد.'),{status:404});
      const publicId=publicRef('ENT');
      await client.query(`INSERT INTO project_entitlements(id,public_id,user_id,project_id,entitlement_type,percentage,status,legal_reference,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8)`,[id(),publicId,user.rows[0].id,project.rows[0].id,type,percentage,legalReference,session.id]);
      await audit(client,session.id,'ایجاد پیش‌نویس حق پروژه',`${publicId} · ${user.rows[0].display_name} · ${type} · ${percentage}%`,req);
      return {id:publicId,status:'draft'};
    });
    return sendJson(res,201,{entitlement:created,message:'پیش‌نویس حق پروژه ایجاد شد؛ این ثبت به‌تنهایی مالکیت یا حق پرداخت ایجاد نمی‌کند.'});
  }

  if (method === 'POST' && pathname === '/api/admin/projects') {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    if (!body.title?.en || !body.title?.ar || !body.title?.tr) return sendJson(res, 400, { error: 'عنوان پروژه باید به هر سه زبان وارد شود.' });
    const min = moneyToMinor(String(body.minimum ?? '0'), true);
    const max = body.maximum ? moneyToMinor(String(body.maximum), true) : '0';
    const target = body.target ? moneyToMinor(String(body.target), true) : '0';
    const ref = publicRef('PR');
    const result = await withTransaction(async (client) => {
      const inserted = await client.query(`INSERT INTO projects(id,public_id,category,title,description,minimum_minor,maximum_minor,target_minor,duration,status,risk,created_by)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,'upcoming',$10,$11) RETURNING *`, [id(), ref, String(body.category || 'General'), JSON.stringify(body.title), JSON.stringify(body.description || {}), min, max, target, String(body.duration || '').slice(0, 80), String(body.risk || 'Unrated'), session.id]);
      await audit(client, session.id, 'ایجاد پروژه', `${ref} · ${body.title.en}`, req);
      return inserted.rows[0];
    });
    return sendJson(res, 201, { project: { id: result.public_id, title: result.title }, message: 'پروژه ایجاد شد و تا زمان بررسی در وضعیت upcoming باقی می‌ماند.' });
  }

  const projectMatch = pathname.match(/^\/api\/admin\/projects\/([^/]+)$/);
  if (method === 'PATCH' && projectMatch) {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    const result = await withTransaction(async (client) => {
      const row = await client.query('SELECT * FROM projects WHERE public_id=$1 FOR UPDATE', [projectMatch[1]]);
      if (!row.rowCount) throw Object.assign(new Error('پروژه پیدا نشد.'), { status: 404 });
      const project = row.rows[0];
      const status = ['active','upcoming','completed','paused'].includes(body.status) ? body.status : project.status;
      const compliance = ['not_reviewed','under_review','approved','rejected'].includes(body.complianceStatus) ? body.complianceStatus : project.compliance_status;
      const investmentsEnabled = body.investmentsEnabled === true && compliance === 'approved' && process.env.FINANCIAL_OPERATIONS_ENABLED === 'true';
      const min = body.minimum === undefined ? project.minimum_minor : moneyToMinor(String(body.minimum), true);
      const max = body.maximum === undefined ? project.maximum_minor : (Number(body.maximum) === 0 ? '0' : moneyToMinor(String(body.maximum)));
      const target = body.target === undefined ? project.target_minor : (Number(body.target) === 0 ? '0' : moneyToMinor(String(body.target)));
      const viewsOverride = body.viewsOverride === undefined ? project.views_override : (body.viewsOverride === null || body.viewsOverride === '' ? null : Number(body.viewsOverride));
      if (viewsOverride !== null && (!Number.isInteger(viewsOverride) || viewsOverride < 0 || viewsOverride > 1000000000)) throw Object.assign(new Error('تعداد بازدید دستی باید عدد صحیح بین صفر تا یک میلیارد باشد.'), { status: 400 });
      const updated = await client.query(`UPDATE projects SET status=$2,compliance_status=$3,investments_enabled=$4,minimum_minor=$5,maximum_minor=$6,target_minor=$7,featured=$8,views_override=$9,updated_at=NOW()
        WHERE id=$1 RETURNING *`, [project.id, status, compliance, investmentsEnabled, min, max, target, Boolean(body.featured), viewsOverride]);
      await audit(client, session.id, 'به‌روزرسانی پروژه', `${project.public_id} · ${status} · compliance=${compliance}`, req);
      return updated.rows[0];
    });
    return sendJson(res, 200, { project: { id: result.public_id, status: result.status, complianceStatus: result.compliance_status, investmentsEnabled: result.investments_enabled }, message: 'پروژه به‌روزرسانی شد.' });
  }

  if (method === 'PUT' && pathname === '/api/admin/settings') {
    requireRole(session, ['admin']);
    const body = await readBody(req);
    await withTransaction(async (client) => {
      if (Array.isArray(body.depositAddresses)) {
        for (const address of body.depositAddresses) {
          const network = String(address.network || '');
          const value = String(address.address || '').trim();
          if (!['BNB Smart Chain','Base'].includes(network)) throw Object.assign(new Error('شبکه آدرس معتبر نیست.'), { status: 400 });
          const tokenContract = String(address.token_contract || '').trim();
          const chainId = network === 'BNB Smart Chain' ? 56 : 8453;
          if (address.active && (!/^0x[a-fA-F0-9]{40}$/.test(value) || !/^0x[a-fA-F0-9]{40}$/.test(tokenContract))) throw Object.assign(new Error('برای فعال‌سازی، آدرس مقصد و قرارداد رسمی توکن باید هر دو آدرس معتبر EVM باشند.'), { status: 400 });
          if (!value) continue;
          if (Boolean(address.active)) await client.query('UPDATE deposit_addresses SET active=FALSE WHERE network=$1', [network]);
          await client.query(`INSERT INTO deposit_addresses(id,network,chain_id,currency,address,token_contract,active,created_by)
            VALUES($1,$2,$3,'DAI',$4,$5,$6,$7) ON CONFLICT(network,address) DO UPDATE SET chain_id=EXCLUDED.chain_id,token_contract=EXCLUDED.token_contract,active=EXCLUDED.active,created_by=EXCLUDED.created_by`, [crypto.randomUUID(), network, chainId, value, tokenContract, Boolean(address.active), session.id]);
        }
      }
      if (body.depositNoticeHours !== undefined) {
        const hours = Number(body.depositNoticeHours);
        if (!Number.isInteger(hours) || hours < 1 || hours > 72) throw Object.assign(new Error('زمان بررسی باید بین ۱ تا ۷۲ ساعت باشد.'), { status: 400 });
        await client.query("INSERT INTO app_settings(key,value,updated_by) VALUES('deposit_notice_hours',$1::jsonb,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()", [JSON.stringify(hours), session.id]);
      }
      if (body.minimumWithdrawal !== undefined) {
        const minor = moneyToMinor(String(body.minimumWithdrawal), true);
        await client.query("INSERT INTO app_settings(key,value,updated_by) VALUES('minimum_withdrawal_minor',$1::jsonb,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()", [JSON.stringify(minor), session.id]);
      }
      if (body.referralPercent !== undefined) {
        const pct = Number(body.referralPercent);
        if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw Object.assign(new Error('درصد رفرال باید بین صفر تا ۵۰ باشد.'), { status: 400 });
        await client.query("INSERT INTO app_settings(key,value,updated_by) VALUES('referral_percent',$1::jsonb,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()", [JSON.stringify(pct), session.id]);
      }
      if (body.levelThresholds !== undefined) {
        if (!Array.isArray(body.levelThresholds) || body.levelThresholds.length < 1 || body.levelThresholds.length > 100) throw Object.assign(new Error('قواعد سطح‌بندی باید آرایه‌ای با ۱ تا ۱۰۰ سطح باشند.'), { status: 400 });
        const cleaned = body.levelThresholds.map((item) => ({ level:Number(item.level), points:Number(item.points) })).sort((a,b)=>a.level-b.level);
        const seen = new Set();
        for (const rule of cleaned) {
          if (!Number.isInteger(rule.level) || rule.level < 1 || rule.level > 100 || !Number.isSafeInteger(rule.points) || rule.points < 0 || seen.has(rule.level)) throw Object.assign(new Error('هر سطح باید یکتا و بین ۱ تا ۱۰۰ و امتیاز آن عدد صحیح نامنفی باشد.'), { status: 400 });
          seen.add(rule.level);
        }
        if (cleaned[0].level !== 1 || cleaned[0].points !== 0) throw Object.assign(new Error('قانون سطح ۱ با صفر امتیاز باید تعریف شود.'), { status: 400 });
        for (let index=1; index<cleaned.length; index++) if (cleaned[index].points <= cleaned[index-1].points) throw Object.assign(new Error('امتیاز لازم برای سطح‌های بالاتر باید به‌صورت صعودی افزایش یابد.'), { status: 400 });
        await client.query("INSERT INTO app_settings(key,value,updated_by) VALUES('level_thresholds',$1::jsonb,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()", [JSON.stringify(cleaned),session.id]);
        await client.query(`WITH rules AS (
          SELECT (item->>'level')::INTEGER AS level, (item->>'points')::BIGINT AS points
          FROM jsonb_array_elements($1::jsonb) AS item
        ), recalculated AS (
          SELECT u.id, COALESCE(MAX(r.level) FILTER (WHERE u.points >= r.points),1) AS level
          FROM users u CROSS JOIN rules r GROUP BY u.id
        )
        UPDATE users u SET level=LEAST(100,GREATEST(1,r.level)),updated_at=NOW()
        FROM recalculated r WHERE u.id=r.id AND u.level<>r.level`, [JSON.stringify(cleaned)]);
      }
      if (body.stats && typeof body.stats === 'object') {
        const current = await client.query("SELECT value FROM app_settings WHERE key='homepage_stats'");
        const merged = { ...(current.rows[0]?.value || {}), mode: ['manual','calculated'].includes(body.stats.displayMode) ? body.stats.displayMode : 'calculated', manual: {} };
        for (const key of ['users','volume','projects','countries','dailyGrowth']) {
          const value = Number(body.stats[key]);
          if (Number.isFinite(value) && value >= 0) merged.manual[key] = value;
        }
        await client.query("INSERT INTO app_settings(key,value,updated_by) VALUES('homepage_stats',$1::jsonb,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()", [JSON.stringify(merged), session.id]);
      }
      if (body.financialProductsEnabled && typeof body.financialProductsEnabled === 'object') {
        if (process.env.FINANCIAL_OPERATIONS_ENABLED !== 'true' || (NODE_ENV === 'production' && !process.env.LEGAL_COMPLIANCE_APPROVAL_ID)) {
          const requestedOn = Object.values(body.financialProductsEnabled).some(Boolean);
          if (requestedOn) throw Object.assign(new Error('فعال‌سازی مالی از طریق پنل کافی نیست؛ ابتدا پیکربندی محیطی و تأیید حقوقی لازم را فراهم کنید.'), { status: 423 });
        }
        const flags = {};
        for (const key of ['deposits','withdrawals','investments','loans','lottery','referral_rewards']) flags[key] = Boolean(body.financialProductsEnabled[key]);
        await client.query("INSERT INTO app_settings(key,value,updated_by) VALUES('financial_products_enabled',$1::jsonb,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()", [JSON.stringify(flags), session.id]);
      }
      await audit(client, session.id, 'به‌روزرسانی تنظیمات سایت', 'تنظیمات عمومی و آدرس‌های دریافت بررسی شد.', req);
    });
    return sendJson(res, 200, { message: 'تنظیمات ذخیره شد.' });
  }

  if (method === 'POST' && pathname === '/api/admin/adjustments') {
    requireRole(session, ['admin', 'finance']);
    const body = await readBody(req);
    const userPublicId = String(body.userId || '');
    const amountText = String(body.amount || '');
    const reason = String(body.reason || '').trim().slice(0, 1000);
    const evidenceReference = String(body.evidenceReference || '').trim().slice(0, 200);
    if (NODE_ENV === 'production' && process.env.ALLOW_MANUAL_LEDGER_ADJUSTMENTS !== 'true') return sendJson(res, 423, { error: 'اصلاح دستی دفترکل در محیط عملیاتی غیرفعال است؛ مسیر اصلاح رسمی و دو مرحله‌ای لازم است.' });
    const negative = amountText.startsWith('-');
    const amountMinor = moneyToMinor(negative ? amountText.slice(1) : amountText);
    if (reason.length < 8 || evidenceReference.length < 4) return sendJson(res, 400, { error: 'دلیل و مرجع مستند اصلاحیه الزامی هستند.' });
    const result = await withTransaction(async (client) => {
      const user = await client.query('SELECT id,display_name FROM users WHERE public_id=$1 FOR UPDATE', [userPublicId]);
      if (!user.rowCount) throw Object.assign(new Error('کاربر پیدا نشد.'), { status: 404 });
      const wallet = await client.query("SELECT available_minor FROM wallets WHERE user_id=$1 AND currency='DAI' FOR UPDATE", [user.rows[0].id]);
      if (negative && BigInt(wallet.rows[0].available_minor) < BigInt(amountMinor)) throw Object.assign(new Error('موجودی آزاد برای کاهش کافی نیست.'), { status: 409 });
      const ledger = await createLedger(client, { transactionType: 'admin_adjustment', description: `Admin adjustment: ${reason}`, createdBy: session.id, idempotencyKey: publicRef('ADJ'), metadata: { evidenceReference }, lines: negative ? [
        { accountCode: 'customer_available_liability', userId: user.rows[0].id, debitMinor: amountMinor },
        { accountCode: 'admin_adjustment_clearing', creditMinor: amountMinor },
      ] : [
        { accountCode: 'admin_adjustment_clearing', debitMinor: amountMinor },
        { accountCode: 'customer_available_liability', userId: user.rows[0].id, creditMinor: amountMinor },
      ] });
      await client.query(`UPDATE wallets SET available_minor=available_minor ${negative ? '-' : '+'} $2,updated_at=NOW() WHERE user_id=$1 AND currency='DAI'`, [user.rows[0].id, amountMinor]);
      await audit(client, session.id, 'ثبت اصلاحیه مالی', `${user.rows[0].display_name} · ${negative ? '-' : '+'}${toMoney(amountMinor)} DAI · ${reason} · Ref: ${evidenceReference}`, req);
      return { ledgerReference: ledger.reference };
    });
    return sendJson(res, 200, { ...result, message: 'اصلاحیه مالی در دفتر کل ثبت شد.' });
  }

  if (pathname.startsWith('/api/loans') || pathname.startsWith('/api/lottery')) {
    requireAuth(session);
    return sendJson(res, 423, { error: 'وام و قرعه‌کشی تا زمان تأیید حقوقی، مجوزهای لازم و تصویب مدل اقتصادی غیرفعال هستند.' });
  }

  if (pathname.startsWith('/api/admin/')) return sendJson(res, 404, { error: 'Admin endpoint not found.' });
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'API endpoint not found.' });
  return null;
}

function serveStatic(urlPath, res) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const requested = cleanPath === '/' ? '/index.html' : cleanPath;
  const candidate = path.resolve(distDir, `.${requested}`);
  if ((candidate !== distDir && !candidate.startsWith(`${distDir}${path.sep}`)) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return false;
  const ext = path.extname(candidate).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" });
  fs.createReadStream(candidate).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const result = await handleApi(req, res, url);
      if (result !== null || res.writableEnded || res.headersSent) return;
    }
    if (serveStatic(url.pathname, res)) return;
    const indexFile = path.join(distDir, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" });
      return fs.createReadStream(indexFile).pipe(res);
    }
    return sendJson(res, 503, { error: 'Frontend is not built. In development, use Vite on port 5173.' });
  } catch (error) {
    if (error.code === '23505') return sendJson(res, 409, { error: 'این رکورد قبلاً ثبت شده است.' });
    console.error(error);
    return sendJson(res, error.status || 500, { error: error.status ? error.message : 'خطای داخلی سرور.' });
  }
});

async function start() {
  await pool.query('SELECT 1');
  marketFeed.start();
  server.listen(PORT, '0.0.0.0', () => console.log(`XBank API listening on http://localhost:${PORT} (${NODE_ENV})`));
}

start().catch((error) => {
  console.error('XBank startup failed:', error.message);
  process.exit(1);
});

async function shutdown() {
  marketFeed.stop();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
