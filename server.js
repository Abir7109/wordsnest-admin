import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET env var is required'); process.exit(1); }

// ── Rate Limiting ────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts. Try again later.' },
});
app.use('/api/auth/', authLimiter);

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests, please try again later' },
});
app.use('/api/ai/', aiLimiter);

const searchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Search limit reached. Try again later.' },
});
app.use('/api/ai-analyze', searchLimiter);

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many admin requests. Try again later.' },
});
app.use('/api/admin/', adminLimiter);

function safeError(res, e, context = '') {
  console.error(`[ERROR] ${context}:`, e);
  res.status(500).json({ error: 'Internal server error' });
}
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cpjeqobzdmxmjmmbunim.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SB_URL = SUPABASE_URL;
const SB_KEY = SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// FCM via direct HTTP (no Firebase Admin SDK)
let fcmAccessToken = null;
let fcmTokenExpiry = 0;
const FCM_PROJECT_ID = process.env.FCM_PROJECT_ID || 'words-nest';

async function getFcmAccessToken() {
  if (fcmAccessToken && Date.now() < fcmTokenExpiry) return fcmAccessToken;
  try {
    const envJson = process.env.FCM_SERVICE_ACCOUNT;
    if (!envJson) throw new Error('FCM_SERVICE_ACCOUNT not set');
    const sa = JSON.parse(envJson);
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      },
      sa.private_key,
      { algorithm: 'RS256' }
    );
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('assertion', assertion);
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await resp.json();
    fcmAccessToken = data.access_token;
    fcmTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return fcmAccessToken;
  } catch (e) {
    console.warn('FCM token error:', e.message);
    return null;
  }
}

async function sendFcm(token, notification, data) {
  try {
    const accessToken = await getFcmAccessToken();
    if (!accessToken) return false;
    const body = { message: { token, notification, data } };
    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    return resp.ok;
  } catch { return false; }
}

async function sendFcmMulticast(tokens, notification, data) {
  if (!tokens.length) return { successCount: 0, failureCount: 0 };
  let success = 0, failure = 0;
  for (const token of tokens) {
    const ok = await sendFcm(token, notification, data);
    if (ok) success++; else failure++;
  }
  return { successCount: success, failureCount: failure };
}

function requireSupabase(req, res, next) {
  if (!SB_KEY) return res.status(503).json({ error: 'Supabase not configured' });
  next();
}

// ── JWT Helpers ──────────────────────────────────────────────────────
function requireJwt(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization required' });
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userPhone = decoded.phone;
    req.userId = decoded.uid;
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Admin authorization required' });
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.adminId = decoded.uid;
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}

function createToken(phone, uid, role = 'user') {
  return jwt.sign({ phone, uid, role }, JWT_SECRET, { expiresIn: '7d' });
}

// ── DB Helpers ───────────────────────────────────────────────────────

async function getUserDoc(id) {
  return restSingle('users', { id: `eq.${id}` });
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getDaysAgo(n) {
  return getDayStart() - n * 86400000;
}

function formatDateLabel(ts) {
  const d = new Date(ts);
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]} ${d.getDate()}`;
}

function sanitize(str) {
  if (!str) return '';
  return String(str).replace(/<[^>]*>/g, '').trim().substring(0, 500);
}

function isPremium(user) {
  if (!user) return false;
  if (user.lifetime_free) return true;
  if (user.subscription?.active && user.subscription?.expiresAt > Date.now()) return true;
  return false;
}

// Direct REST API helpers (bypasses supabase-js client overhead)
function sbUrl(table, params) {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

async function restCount(table, extraParams = {}) {
  if (!SB_KEY) return 0;
  try {
    const url = sbUrl(table, { select: 'id', limit: '0', ...extraParams });
    const resp = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' },
    });
    const range = resp.headers.get('content-range');
    if (!range) return 0;
    return parseInt(range.split('/')[1], 10) || 0;
  } catch { return 0; }
}

async function restSelect(table, selectCols = '*', extraParams = {}) {
  if (!SB_KEY) return [];
  try {
    const url = sbUrl(table, { select: selectCols, ...extraParams });
    const resp = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    return await resp.json();
  } catch { return []; }
}

async function safeCount(table) {
  return restCount(table);
}

async function safeFilterCount(table, column, value, tsColumn, since) {
  return restCount(table, { [column]: `eq.${value}`, [tsColumn]: `gte.${new Date(since).toISOString()}` });
}

// ── REST Write Helpers ────────────────────────────────────────────────
async function restSingle(table, params = {}) {
  if (!SB_KEY) return null;
  try {
    const url = sbUrl(table, { ...params, limit: '1' });
    const resp = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/vnd.pgrst.object+json' },
    });
    if (resp.status === 406) return null;
    return await resp.json();
  } catch { return null; }
}

async function restMaybeSingle(table, params = {}) {
  if (!SB_KEY) return null;
  try {
    const url = sbUrl(table, { ...params, limit: '1' });
    const resp = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const data = await resp.json();
    return data?.length > 0 ? data[0] : null;
  } catch { return null; }
}

async function restInsert(table, body) {
  if (!SB_KEY) return null;
  const resp = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`restInsert ${table} failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  return await resp.json();
}

async function restUpdate(table, body, params = {}) {
  if (!SB_KEY) return;
  const url = sbUrl(table, params);
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`restUpdate ${table} failed: ${resp.status} ${await resp.text().catch(() => '')}`);
}

async function restDelete(table, params = {}) {
  if (!SB_KEY) return;
  const url = sbUrl(table, params);
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!resp.ok) throw new Error(`restDelete ${table} failed: ${resp.status} ${await resp.text().catch(() => '')}`);
}

async function restUpsert(table, body, conflictColumn = 'id') {
  if (!SB_KEY) return null;
  const url = sbUrl(table, { on_conflict: conflictColumn });
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`restUpsert ${table} failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  return await resp.json();
}

async function authAdminDeleteUser(uid) {
  if (!SB_KEY) return false;
  try {
    const resp = await fetch(`${SB_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    return resp.ok;
  } catch { return false; }
}

async function authAdminCreateUser(body) {
  if (!SB_KEY) return null;
  try {
    const payload = {
      email: body.email,
      password: body.password,
      data: { ...(body.user_metadata || {}), phone: body.phone || '' },
    };
    const resp = await fetch(`${SB_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    const data = JSON.parse(text);
    if (resp.ok && (data.id || data.user?.id)) {
      return { user: { id: data.id || data.user.id } };
    }
    console.error('authAdminCreateUser response:', resp.status, text);
    return { msg: (data.msg || data.error || data.error_description || `HTTP ${resp.status}`) };
  } catch (e) { console.error('authAdminCreateUser error:', e); return null; }
}

async function authGetUser(token) {
  try {
    const resp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    });
    return await resp.json();
  } catch { return null; }
}

async function checkAndUpdateDailyUsage(userId) {
  const today = getTodayStr();
  const user = await restSingle('users', { id: `eq.${userId}` });
  if (!user) return { allowed: false, remaining: 0, reason: 'User not found' };

  const sub = await restMaybeSingle('user_subscriptions', { user_id: `eq.${userId}` });
  if (sub && (sub.active || sub.lifetime_free)) return { allowed: true, remaining: -1, isPremium: true };

  if (user.cooldown_until && new Date(user.cooldown_until).getTime() > Date.now()) {
    return { allowed: false, remaining: 0, reason: 'cool_down' };
  }

  const usage = await restMaybeSingle('daily_usage', { user_id: `eq.${userId}`, date: `eq.${today}` });
  const count = usage?.count || 0;

  if (count >= 10) {
    const cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await restUpdate('users', { cooldown_until: cooldownUntil }, { id: `eq.${userId}` });
    // Increment rate-limit hit counter for admin visibility
    await restUpdate('users', { rate_limit_hits: (user.rate_limit_hits || 0) + 1 }, { id: `eq.${userId}` });
    return { allowed: false, remaining: 0, reason: 'limit_reached' };
  }

  await restUpsert('daily_usage', { user_id: userId, date: today, count: count + 1 }, 'user_id,date');
  await restUpdate('users', { last_active: new Date().toISOString() }, { id: `eq.${userId}` });

  return { allowed: true, remaining: 9 - count, isPremium: false };
}

function countByDay(docs, field = 'timestamp') {
  const dayMap = {};
  for (const d of docs) {
    const ts = d[field] ? new Date(d[field]).getTime() : 0;
    if (!ts) continue;
    const day = getDayStart(ts);
    dayMap[day] = (dayMap[day] || 0) + 1;
  }
  return dayMap;
}

// ── Health ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', supabase: !!SB_KEY }));
app.get('/api/server-time', (req, res) => res.json({ serverTime: Date.now() }));
app.get('/api/ping-keep-alive', (req, res) => res.json({ pong: Date.now() }));

// ── Dashboard ────────────────────────────────────────────────────────
const dashCache = { data: null, ts: 0, TTL: 120000 };

app.get('/api/dashboard', requireSupabase, requireAdmin, async (req, res) => {
  try {
    if (dashCache.data && Date.now() - dashCache.ts < dashCache.TTL) {
      return res.json(dashCache.data);
    }

    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgoIso = new Date(getDaysAgo(7)).toISOString();
    const yesterdayIso = new Date(getDaysAgo(1)).toISOString();

    const results = await Promise.all([
      restCount('users'),
      restCount('search_events'),
      restCount('installs'),
      restCount('users', { last_active: `gte.${dayAgo}` }),
      restCount('users', { created_at: `gte.${todayStart}` }),
      restCount('search_events', { timestamp: `gte.${todayStart}` }),
      restCount('users', { created_at: `lte.${weekAgoIso}` }),
      restCount('users', { last_active: `gte.${yesterdayIso}`, created_at: `lte.${weekAgoIso}` }),
      restCount('saved_words'),
      restCount('quiz_attempts'),
    ]);

    const [users, searches, installs, activeUsers, newUsersToday, searchesToday, usersBeforeWeek, retained, words, quizzes] = results;

    const engagementRate = users > 0 ? Math.round((activeUsers / users) * 100) : 0;
    const retentionRate = usersBeforeWeek > 0 ? Math.round((retained / usersBeforeWeek) * 100) : 0;

    const [wordsTodayCount, quizzesTodayCount, savedTypesData, savedWordsData, searchWordsData, quizScoresData] = await Promise.all([
      restCount('saved_words', { timestamp: `gte.${todayStart}` }).catch(() => 0),
      restCount('quiz_attempts', { timestamp: `gte.${todayStart}` }).catch(() => 0),
      restSelect('saved_words', 'type', { limit: '2000' }),
      restSelect('saved_words', 'word', { limit: '2000' }),
      restSelect('search_events', 'word', { timestamp: `gte.${weekAgoIso}`, limit: '50000' }),
      restSelect('quiz_attempts', 'score', { limit: '1000' }),
    ]);

    const typeDist = {};
    for (const w of savedTypesData || []) { if (w.type) typeDist[w.type] = (typeDist[w.type] || 0) + 1; }
    const wordFreq = {};
    for (const w of savedWordsData || []) { const wl = w.word?.toLowerCase(); if (wl) wordFreq[wl] = (wordFreq[wl] || 0) + 1; }
    const scores = (quizScoresData || []).map(q => q.score).filter(s => s !== null && s !== undefined);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const payload = {
      users, activeUsers, searches, words, quizzes,
      newUsersToday, dailyActiveUsers: activeUsers,
      totalInstalls: installs, searchesToday,
      wordsToday: wordsTodayCount, quizzesToday: quizzesTodayCount,
      averageQuizScore: avgScore,
      uniqueWordsSaved: Object.keys(wordFreq).length,
      topWordType: Object.entries(typeDist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
      engagementRate, retentionRate,
    };

    dashCache.data = payload;
    dashCache.ts = Date.now();
    res.json(payload);
  } catch (e) { safeError(res, e, 'dashboard'); }
});

app.get('/api/dashboard/timeline', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const sinceTs = new Date(getDaysAgo(6)).toISOString();
    const days = 7;

    const [usersAll, searchesAll, activeUsers] = await Promise.all([
      restSelect('users', 'created_at', { created_at: `gte.${sinceTs}` }),
      restSelect('search_events', 'timestamp', { timestamp: `gte.${sinceTs}` }),
      restSelect('users', 'last_active', { last_active: `gte.${sinceTs}` }),
    ]);

    const usersByDay = countByDay(usersAll.map(d => ({ timestamp: d.created_at })));
    const searchesByDay = countByDay(searchesAll.map(d => ({ timestamp: d.timestamp })));
    const activeByDay = countByDay(activeUsers.map(d => ({ timestamp: d.last_active })));

    const timeline = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayTs = getDaysAgo(i);
      timeline.push({
        date: new Date(dayTs).toISOString().split('T')[0],
        label: formatDateLabel(dayTs),
        users: activeByDay[dayTs] || 0,
        activeUsers: activeByDay[dayTs] || 0,
        searches: searchesByDay[dayTs] || 0,
        words: 0, quizzes: 0, newUsers: usersByDay[dayTs] || 0,
      });
    }
    res.json({ timeline });
  } catch { res.json({ timeline: [] }); }
});

app.get('/api/dashboard/top-words', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSelect('saved_words', 'word,count', { limit: '2000' });
    const freq = {};
    for (const w of data || []) { const wl = w.word?.toLowerCase(); if (wl) freq[wl] = (freq[wl] || 0) + 1; }
    const topWords = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    res.json({ topWords });
  } catch { res.json({ topWords: [] }); }
});
app.get('/api/dashboard/top-searches', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const data = await restSelect('search_events', 'word', { timestamp: `gte.${weekAgo}`, limit: '50000' });
    const freq = {};
    for (const s of data || []) { const w = s.word?.toLowerCase(); if (w) freq[w] = (freq[w] || 0) + 1; }
    const topSearches = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    res.json({ topSearches });
  } catch { res.json({ topSearches: [] }); }
});
app.get('/api/dashboard/word-types', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSelect('saved_words', 'type', { limit: '2000' });
    const dist = {};
    for (const w of data || []) { if (w.type) dist[w.type] = (dist[w.type] || 0) + 1; }
    const distribution = Object.entries(dist).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    res.json({ distribution });
  } catch { res.json({ distribution: [] }); }
});

app.get('/api/dashboard/recent-activity', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const users = await restSelect('users', 'id,username,created_at', { order: 'created_at.desc', limit: '5' });
    const activities = (users || []).map(u => ({
      type: 'user_signup', userId: u.id,
      username: u.username || 'Unknown',
      timestamp: new Date(u.created_at).getTime(),
    }));
    res.json({ activities });
  } catch { res.json({ activities: [] }); }
});

// ── Users ────────────────────────────────────────────────────────────
app.get('/api/users', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const [users, subs, wordCounts, quizCounts] = await Promise.all([
      restSelect('users', '*', { order: 'last_active.desc', limit: '100' }),
      restSelect('user_subscriptions', '*', { limit: '5000' }),
      restSelect('saved_words', 'user_id', { limit: '50000' }),
      restSelect('quiz_attempts', 'user_id', { limit: '50000' }),
    ]);
    const subMap = {};
    for (const s of subs || []) subMap[s.user_id] = { plan: s.plan, active: s.active, lifetimeFree: s.lifetime_free, expiresAt: s.expires_at, dailyUsage: s.daily_usage };
    const wc = {}; for (const w of wordCounts || []) wc[w.user_id] = (wc[w.user_id] || 0) + 1;
    const qc = {}; for (const q of quizCounts || []) qc[q.user_id] = (qc[q.user_id] || 0) + 1;
    const enriched = (users || []).map(u => ({
      uid: u.id, ...u, subscription: subMap[u.id] || { plan: 'free', active: false, lifetimeFree: false },
      lastActive: new Date(u.last_active).getTime(), wordCount: wc[u.id] || 0, quizCount: qc[u.id] || 0,
      banned: u.status === 'banned', coolDownUntil: u.cooldown_until ? new Date(u.cooldown_until).getTime() : null,
      rateLimitHits: u.rate_limit_hits || 0, deviceName: u.device_name, created_at: u.created_at,
    }));
    res.json({ users: enriched });
  } catch (e) { safeError(res, e, 'users-list'); }
});

app.delete('/api/users/:identifier', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { identifier } = req.params;
    const user = await restMaybeSingle('users', { id: `eq.${identifier}` });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.fcm_token) {
      await sendFcm(user.fcm_token, { title: 'Account Deleted', body: 'Your account has been permanently deleted.' }, { type: 'force_logout' });
    }

    await authAdminDeleteUser(identifier);
    res.json({ success: true, message: 'User permanently deleted.' });
  } catch (e) { safeError(res, e, 'users-delete'); }
});

app.get('/api/users/stats/aggregate', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const [total, active, statusData, newToday, newWeek, newMonth, countsByVersion] = await Promise.all([
      safeCount('users'),
      safeFilterCount('users', 'status', 'active', 'last_active', getDaysAgo(1)),
      (async () => {
        const activeC = await restCount('users', { status: 'eq.active' });
        const inactiveC = await restCount('users', { status: 'eq.inactive' });
        return { active: activeC, inactive: inactiveC };
      })(),
      safeFilterCount('users', 'status', 'active', 'created_at', getDayStart()),
      safeFilterCount('users', 'status', 'active', 'created_at', getDaysAgo(7)),
      safeFilterCount('users', 'status', 'active', 'created_at', getDaysAgo(30)),
      (async () => {
        try {
          const data = await restSelect('users', 'app_version', { limit: '50000' });
          const counts = {};
          for (const u of data || []) { const v = u.app_version || 'unknown'; counts[v] = (counts[v] || 0) + 1; }
          return counts;
        } catch { return {}; }
      })(),
    ]);

    res.json({ total, active, statusBreakdown: statusData, newUsersToday: newToday, newUsersThisWeek: newWeek, newUsersThisMonth: newMonth, byAppVersion: countsByVersion });
  } catch (e) { safeError(res, e, 'users-stats-aggregate'); }
});

app.get('/api/users/:phone', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    let user = await restSingle('users', { id: `eq.${sanitize(phone)}` });
    if (!user) user = await restMaybeSingle('users', { phone: `eq.${sanitize(phone)}` });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const uid = user.id;
    const [wordsData, quizzesData, searchData] = await Promise.all([
      restSelect('saved_words', '*', { user_id: `eq.${uid}`, order: 'timestamp.desc', limit: '100' }),
      restSelect('quiz_attempts', '*', { user_id: `eq.${uid}`, order: 'timestamp.desc', limit: '50' }),
      restSelect('search_history', '*', { user_id: `eq.${uid}`, order: 'timestamp.desc', limit: '50' }),
    ]);
    const sub = await restMaybeSingle('user_subscriptions', { user_id: `eq.${uid}` }) || {};

    res.json({
      profile: { uid, ...user, subscription: { plan: sub.plan, active: sub.active, lifetimeFree: sub.lifetime_free, expiresAt: sub.expires_at ? new Date(sub.expires_at).getTime() : null, dailyUsage: sub.daily_usage }, banned: user.status === 'banned', coolDownUntil: user.cooldown_until ? new Date(user.cooldown_until).getTime() : null, rateLimitHits: user.rate_limit_hits || 0, deviceName: user.device_name, lastActive: new Date(user.last_active).getTime(), createdAt: new Date(user.created_at).getTime() },
      words: (wordsData || []).map(w => ({ id: w.id, ...w })),
      quizzes: (quizzesData || []).map(q => ({ id: q.id, ...q })),
      searchHistory: (searchData || []).map(s => ({ id: s.id, ...s })),
    });
  } catch (e) { safeError(res, e, 'users-detail'); }
});

// ── Saved Words ──────────────────────────────────────────────────────
app.get('/api/words', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSelect('saved_words', '*', { order: 'timestamp.desc', limit: '200' });
    res.json({ words: data || [] });
  } catch (e) { safeError(res, e, 'words-list'); }
});

app.delete('/api/words/:id', requireSupabase, async (req, res) => {
  try {
    await restDelete('saved_words', { id: `eq.${req.params.id}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'words-delete'); }
});

app.get('/api/words/delete/:id', requireSupabase, requireAdmin, async (req, res) => {
  try {
    await restDelete('saved_words', { id: `eq.${req.params.id}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'words-delete'); }
});

app.get('/api/words/stats', requireSupabase, async (req, res) => {
  try {
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const total = await safeCount('saved_words');
    const todayC = await restCount('saved_words', { timestamp: `gte.${todayStart}` });
    const weekC = await restCount('saved_words', { timestamp: `gte.${weekAgo}` });
    let typeDist = {}, topWords = [], uniqueWords = 0;
    try {
      const data = await restSelect('saved_words', 'type', { limit: '2000' });
      for (const w of data || []) { if (w.type) typeDist[w.type] = (typeDist[w.type] || 0) + 1; }
    } catch {}
    try {
      const data = await restSelect('saved_words', 'word,type', { limit: '2000' });
      const freq = {};
      for (const w of data || []) { const wl = w.word?.toLowerCase(); if (wl) { freq[wl] = (freq[wl] || 0) + 1; } }
      uniqueWords = Object.keys(freq).length;
      topWords = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    } catch {}
    res.json({ total, today: todayC, thisWeek: weekC, uniqueWords, typeDistribution: Object.entries(typeDist).map(([type, count]) => ({ type, count })), topWords });
  } catch (e) { safeError(res, e, 'words-stats'); }
});

// ── Searches ─────────────────────────────────────────────────────────
app.get('/api/searches', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSelect('search_events', '*', { order: 'timestamp.desc', limit: '200' });
    res.json({ searches: data || [] });
  } catch (e) { safeError(res, e, 'searches-list'); }
});

app.delete('/api/searches/:id', requireSupabase, async (req, res) => {
  try {
    await restDelete('search_events', { id: `eq.${req.params.id}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'searches-delete'); }
});

app.get('/api/searches/stats', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const total = await safeCount('search_events');
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const todayC = await restCount('search_events', { timestamp: `gte.${todayStart}` });
    const weekC = await restCount('search_events', { timestamp: `gte.${weekAgo}` });
    let topWords = [];
    try {
      const data = await restSelect('search_events', 'word', { timestamp: `gte.${weekAgo}`, limit: '50000' });
      const freq = {};
      for (const s of data || []) { const w = s.word?.toLowerCase(); if (w) freq[w] = (freq[w] || 0) + 1; }
      topWords = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    } catch {}
    res.json({ total, today: todayC, thisWeek: weekC, uniqueWords: topWords.length, topWords });
  } catch (e) { safeError(res, e, 'searches-stats'); }
});

// ── Quizzes ──────────────────────────────────────────────────────────
app.get('/api/quizzes', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSelect('quiz_attempts', '*,users!inner(username,email)', { order: 'timestamp.desc', limit: '200' });
    res.json({ quizzes: data || [] });
  } catch (e) { safeError(res, e, 'quizzes-list'); }
});

app.delete('/api/quizzes/:id', requireSupabase, requireAdmin, async (req, res) => {
  try {
    await restDelete('quiz_attempts', { id: `eq.${req.params.id}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'quizzes-delete'); }
});

app.get('/api/quizzes/stats', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const total = await safeCount('quiz_attempts');
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const todayC = await restCount('quiz_attempts', { timestamp: `gte.${todayStart}` });
    const weekC = await restCount('quiz_attempts', { timestamp: `gte.${weekAgo}` });
    let scores = [];
    try {
      const data = await restSelect('quiz_attempts', 'score', { limit: '1000' });
      scores = (data || []).map(q => q.score).filter(s => s !== null && s !== undefined);
    } catch {}
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const highest = scores.length > 0 ? Math.max(...scores) : 0;
    const lowest = scores.length > 0 ? Math.min(...scores) : 0;
    const participants = await restCount('quiz_attempts', { select: 'user_id' });
    const scoreDist = {};
    for (const s of scores) { const r = s >= 80 ? '80-100' : s >= 60 ? '60-79' : s >= 40 ? '40-59' : '0-39'; scoreDist[r] = (scoreDist[r] || 0) + 1; }
    res.json({ total, today: todayC, thisWeek: weekC, averageScore: avg, highestScore: highest, lowestScore: lowest, totalParticipants: participants, scoreDistribution: Object.entries(scoreDist).map(([range, count]) => ({ range, count })) });
  } catch (e) { safeError(res, e, 'quizzes-stats'); }
});

// ── Leaderboard ──────────────────────────────────────────────────────
app.get('/api/leaderboard', requireSupabase, async (req, res) => {
  try {
    const users = await restSelect('users', 'id,username,emoji,leaderboard_streak,leaderboard_manual_score', { limit: '5000' });
    const searches = await restSelect('search_events', 'user_id', { limit: '50000' });
    const words = await restSelect('saved_words', 'user_id', { limit: '50000' });
    const quizzes = await restSelect('quiz_attempts', 'user_id,score', { limit: '50000' });

    const searchCounts = {}, wordCounts = {}, quizScores = {};
    for (const s of searches || []) searchCounts[s.user_id] = (searchCounts[s.user_id] || 0) + 1;
    for (const w of words || []) wordCounts[w.user_id] = (wordCounts[w.user_id] || 0) + 1;
    for (const q of quizzes || []) {
      if (!quizScores[q.user_id]) quizScores[q.user_id] = 0;
      quizScores[q.user_id] += q.score;
    }

    const entries = (users || []).map(u => {
      const s = searchCounts[u.id] || 0;
      const score = Math.min(s, 5) * 2 + (quizScores[u.id] || 0) + (u.leaderboard_streak || 0) * 3 + (u.leaderboard_manual_score || 0);
      return {
        uid: u.id, userId: u.id, name: u.username, emoji: u.emoji || '🌱',
        score, words: wordCounts[u.id] || 0, quiz: quizScores[u.id] || 0,
        streak: u.leaderboard_streak || 0, computedScore: score,
        searches: s, isAdmin: false, email: '',
      };
    }).sort((a, b) => b.score - a.score).slice(0, 100);

    const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));
    res.json({ leaderboard: ranked });
  } catch (e) { safeError(res, e, 'leaderboard'); }
});

// Admin leaderboard (same, different route)
app.get('/api/leaderboard/admin', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const resp = await fetch(`${req.protocol}://${req.get('host')}/api/leaderboard`);
    const data = await resp.json();
    res.json(data);
  } catch (e) { safeError(res, e, 'leaderboard-admin'); }
});

app.post('/api/leaderboard/update', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { userId, manualScore, streak } = req.body;
    const updates = {};
    if (manualScore !== undefined) updates.leaderboard_manual_score = manualScore;
    if (streak !== undefined) updates.leaderboard_streak = streak;
    await restUpdate('users', updates, { id: `eq.${userId}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'leaderboard-update'); }
});

app.put('/api/admin/leaderboard/:uid', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const { manualScore, streak } = req.body;
    const updates = {};
    if (manualScore !== undefined) updates.leaderboard_manual_score = manualScore;
    if (streak !== undefined) updates.leaderboard_streak = streak;
    await restUpdate('users', updates, { id: `eq.${uid}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'leaderboard-admin-update'); }
});

// ── App Config ───────────────────────────────────────────────────────
app.get('/api/app-config', requireSupabase, async (req, res) => {
  try {
    const data = await restSingle('app_config', { id: `eq.1` });
    if (!data) return res.json({});
    res.json({
      isAppAlive: data.is_app_alive ?? true,
      underMaintenance: data.under_maintenance ?? false,
      maintenanceTitle: data.maintenance_title || '',
      maintenanceMessage: data.maintenance_message || '',
      maintenanceEstimatedTime: data.maintenance_estimated_time || '',
      forceUpdate: data.force_update ?? false,
      softUpdate: data.soft_update ?? false,
      currentVersion: data.current_version || '',
      minRequiredVersion: data.min_required_version || '',
      updateUrl: data.update_url || '',
      updateMessage: data.update_message || '',
      dailyQuizLimit: data.daily_quiz_limit ?? 3,
      dailyWordLimit: data.daily_word_limit ?? 10,
      enableNotifications: data.enable_notifications ?? true,
      enableLeaderboard: data.enable_leaderboard ?? true,
      enableBackup: data.enable_backup ?? false,
      adsEnabled: data.ads_enabled ?? false,
      apiEndpoint: data.api_endpoint || '',
      featureFlags: data.feature_flags || {},
      aiProvider: data.ai_provider || 'groq',
      aiModel: data.ai_model || 'llama-3.3-70b-versatile',
      aiGeminiModel: data.ai_gemini_model || 'gemini-2.0-flash',
      aiEnabled: data.ai_enabled ?? true,
    });
  } catch (e) { safeError(res, e, 'app-config-get'); }
});

app.post('/api/app-config', requireSupabase, requireAdmin, async (req, res) => {
  try {
    await restUpdate('app_config', req.body, { id: `eq.1` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'app-config-update'); }
});

// ── Notifications ────────────────────────────────────────────────────
app.post('/api/notifications/send', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { title, message, targetUserId } = req.body;
    if (targetUserId) {
      const user = await restSingle('users', { id: `eq.${targetUserId}` });
      if (!user?.fcm_token) return res.status(400).json({ error: 'User has no FCM token' });
      await sendFcm(user.fcm_token, { title, body: message }, { type: 'admin_notification' });
      await restInsert('global_notifications', { title, message, sentAt: new Date().toISOString(), success: true, sentCount: 1, deliveredCount: 1 });
    } else {
      const users = await restSelect('users', 'fcm_token', { status: 'eq.active', fcm_token: 'not.is.null' });
      const tokens = (users || []).map(u => u.fcm_token).filter(Boolean);
      const result = await sendFcmMulticast(tokens, { title, body: message }, { type: 'admin_notification' });
      await restInsert('global_notifications', {
        title, message, sentAt: new Date().toISOString(), success: true,
        sentCount: tokens.length, deliveredCount: result.successCount,
      });
    }
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'notifications-send'); }
});

app.get('/api/notifications', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSelect('global_notifications', '*', { order: 'sent_at.desc', limit: '50' });
    res.json({ notifications: data || [] });
  } catch (e) { safeError(res, e, 'notifications-list'); }
});

// ── Experiences ──────────────────────────────────────────────────────
app.get('/api/experiences', requireSupabase, async (req, res) => {
  try {
    const data = await restSelect('experiences', '*', { order: 'timestamp.desc', limit: '50' });
    res.json({ experiences: data || [] });
  } catch (e) { safeError(res, e, 'experiences-list'); }
});

app.post('/api/experiences', requireSupabase, requireAdmin, async (req, res) => {
  try {
    await restInsert('experiences', { ...req.body, timestamp: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'experiences-create'); }
});

app.delete('/api/admin/experiences/:id', requireSupabase, requireAdmin, async (req, res) => {
  try {
    await restDelete('experiences', { id: `eq.${req.params.id}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'experiences-delete'); }
});

// ── FCM Token Registration ──────────────────────────────────────────
app.post('/api/register-fcm', requireSupabase, async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    await restUpdate('users', { fcm_token: fcmToken }, { id: `eq.${userId}` });
    await restUpdate('installs', { fcm_token: fcmToken }, { user_id: `eq.${userId}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'register-fcm'); }
});

// ── Auth ─────────────────────────────────────────────────────────────
app.post('/api/auth/exchange-token', requireSupabase, async (req, res) => {
  try {
    const { supabaseToken } = req.body;
    if (!supabaseToken) return res.status(400).json({ error: 'Supabase token required' });

    const user = await authGetUser(supabaseToken);
    if (!user?.id) return res.status(401).json({ error: 'Invalid token' });

    const uid = user.id;
    const email = user.email || '';
    const phone = user.phone || uid;

    const existing = await getUserDoc(uid);
    if (!existing) {
      const now = new Date().toISOString();
      await restUpsert('users', {
        id: uid, email, phone, username: email.split('@')[0] || uid,
        status: 'active', created_at: now, last_active: now,
      });
    } else {
      await restUpdate('users', { last_active: new Date().toISOString() }, { id: `eq.${uid}` });
    }
    await restUpsert('user_subscriptions',
      { user_id: uid, plan: 'free', active: false, lifetime_free: false },
      'user_id'
    );

    const token = createToken(phone, uid);
    const username = existing?.username || email.split('@')[0] || uid;
    res.json({ success: true, token, uid, email, phone, username, isNewUser: !existing });
  } catch (e) { safeError(res, e, 'auth-exchange'); }
});

// Phone + password registration (legacy)
app.post('/api/auth/register', requireSupabase, async (req, res) => {
  try {
    const { phone, username, password, deviceName } = req.body;
    if (!phone || !username || !password) return res.status(400).json({ error: 'Phone, username, and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const cleanPhone = sanitize(phone);
    const cleanUsername = sanitize(username);

    const existing = await restMaybeSingle('users', { phone: `eq.${cleanPhone}` });
    if (existing) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await restUpdate('users', {
        username: cleanUsername, password_hash: hashedPassword,
        device_name: sanitize(deviceName || ''), last_active: new Date().toISOString(),
      }, { id: `eq.${existing.id}` });

      const token = createToken(cleanPhone, existing.id);
      return res.json({ success: true, phone: cleanPhone, username: cleanUsername, token, uid: existing.id });
    }

    const uid = crypto.randomUUID();
    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(password, 10);

    await restInsert('users', {
      id: uid,
      phone: cleanPhone, username: cleanUsername, password_hash: hashedPassword,
      device_name: sanitize(deviceName || ''), status: 'active',
      created_at: now, last_active: now, app_version: req.body.appVersion || '2.0.0',
    });

    await restUpsert('user_subscriptions',
      { user_id: uid, plan: 'free', active: false, lifetime_free: false },
      'user_id'
    );

    const token = createToken(cleanPhone, uid);
    console.log(`[REGISTER] Created user ${uid} (${cleanPhone})`);
    res.json({ success: true, phone: cleanPhone, username: cleanUsername, token, uid });
  } catch (e) { console.error('[REGISTER] Error:', e?.message || e); res.status(500).json({ error: e?.message || 'Registration failed' }); }
});

// Legacy phone sign-in
app.post('/api/auth/phone-signin', requireSupabase, async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });

    const cleanPhone = sanitize(phone);
    const user = await restSingle('users', { phone: `eq.${cleanPhone}` });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash || '');
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await restUpdate('users', { last_active: new Date().toISOString() }, { id: `eq.${user.id}` });
    const token = createToken(cleanPhone, user.id);
    res.json({ success: true, token, username: user.username, uid: user.id });
  } catch (e) { safeError(res, e, 'phone-signin'); }
});

// ── Subscription ─────────────────────────────────────────────────────
app.post('/api/subscribe', requireSupabase, requireJwt, async (req, res) => {
  try {
    const { trxId } = req.body;
    if (!trxId?.trim()) return res.status(400).json({ error: 'Transaction ID is required' });

    const cleanTrxId = sanitize(trxId);
    const userId = req.userId;

    const user = await restSingle('users', { id: `eq.${userId}` });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existingPay = await restMaybeSingle('user_payments', { trx_id: `eq.${cleanTrxId}` });
    if (existingPay) return res.status(409).json({ error: 'This Transaction ID has already been submitted' });

    await restInsert('user_payments', {
      user_id: userId, trx_id: cleanTrxId, amount: 100, date: new Date().toISOString(),
      verified: false,
    });
    await restUpdate('users', { last_active: new Date().toISOString() }, { id: `eq.${userId}` });

    res.json({ success: true, message: 'Payment submitted. Awaiting admin verification.' });
  } catch (e) { safeError(res, e, 'subscribe'); }
});

app.get('/api/subscription/status', requireSupabase, requireJwt, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await restSingle('users', { id: `eq.${userId}` });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sub = user.user_subscriptions || {};
    const premium = sub.active || sub.lifetime_free;

    const usage = await restMaybeSingle('daily_usage', { user_id: `eq.${userId}`, date: `eq.${getTodayStr()}` });
    const dailyCount = usage?.count || 0;
    const inCooldown = user.cooldown_until && new Date(user.cooldown_until).getTime() > Date.now();

    res.json({
      plan: sub.plan || 'free', active: premium, lifetimeFree: sub.lifetime_free || false,
      expiresAt: sub.expires_at ? new Date(sub.expires_at).getTime() : null,
      dailyRemaining: inCooldown ? 0 : (premium ? -1 : (10 - dailyCount)),
      dailyUsed: dailyCount, dailyLimit: premium ? -1 : 10,
      username: user.username || '', status: user.status || 'active',
      coolDownUntil: user.cooldown_until ? new Date(user.cooldown_until).getTime() : null,
      serverTime: Date.now(),
    });
  } catch (e) { safeError(res, e, 'subscription-status'); }
});

app.post('/api/admin/login', requireSupabase, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const resp = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!data.user || !data.access_token) return res.status(401).json({ error: 'Invalid credentials' });

    const ADMIN_EMAIL = 'rahikulmakhtum147@gmail.com';
    if (data.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Not authorized as admin' });

    const token = jwt.sign({ role: 'admin', uid: data.user.id, email: data.user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user: { id: data.user.id, email: data.user.email } });
  } catch (e) { safeError(res, e, 'admin-login'); }
});

// ── Admin Endpoints ──────────────────────────────────────────────────
app.put('/api/admin/users/:phone/lifetime-free', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const { grant } = req.body;
    const user = await restSingle('users', { phone: `eq.${sanitize(phone)}` });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await restUpsert('user_subscriptions', {
      user_id: user.id, plan: grant ? 'lifetime' : 'free',
      active: !!grant, lifetime_free: !!grant,
      expires_at: null, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: grant ? new Date().toISOString() : null,
    }, 'user_id');
    await restUpdate('users', { last_active: new Date().toISOString() }, { id: `eq.${user.id}` });

    if (grant) {
      const u = await restSingle('users', { id: `eq.${user.id}` });
      if (u?.fcm_token) {
        await sendFcm(u.fcm_token, { title: '🌟 Lifetime Free Granted!', body: 'Congratulations! You now have lifetime free access.' }, { type: 'subscription_update' });
      }
    }
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'admin-lifetime-free'); }
});

app.put('/api/admin/users/:phone/ban', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const { ban } = req.body;
    const user = await restSingle('users', { phone: `eq.${sanitize(phone)}` });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await restUpdate('users', { status: ban ? 'banned' : 'active', last_active: new Date().toISOString() }, { id: `eq.${user.id}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'admin-ban'); }
});

app.put('/api/admin/users/:phone/cooldown', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const { cooldownMinutes, remove, durationMs } = req.body;
    const user = await restSingle('users', { phone: `eq.${sanitize(phone)}` });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (remove || cooldownMinutes === null || cooldownMinutes <= 0) {
      await restUpdate('users', { cooldown_until: null }, { id: `eq.${user.id}` });
      await restUpsert('daily_usage', { user_id: user.id, date: getTodayStr(), count: 0 }, 'user_id,date');
    } else {
      const minutes = durationMs ? Math.ceil(durationMs / 60000) : (cooldownMinutes || 60);
      const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await restUpdate('users', { cooldown_until: until }, { id: `eq.${user.id}` });
    }
    res.json({ success: true, serverTime: Date.now() });
  } catch (e) { safeError(res, e, 'admin-cooldown'); }
});

app.get('/api/admin/payments', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSelect('user_payments', '*,users(username,device_name)', { order: 'date.desc' });
    res.json({ payments: data || [] });
  } catch (e) { safeError(res, e, 'admin-payments'); }
});

app.post('/api/admin/verify-payment', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { trxId } = req.body;
    const cleanTrx = sanitize(trxId);

    const payment = await restSingle('user_payments', { trx_id: `eq.${cleanTrx}`, select: '*,users!inner(id,fcm_token)' });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const userId = payment.user_id;

    await restUpdate('user_payments', {
      verified: true, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: new Date().toISOString(),
    }, { trx_id: `eq.${cleanTrx}` });

    await restUpsert('user_subscriptions', {
      user_id: userId, plan: 'lifetime', active: true, lifetime_free: true,
      expires_at: null, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: new Date().toISOString(),
    }, 'user_id');

    await restUpdate('users', { last_active: new Date().toISOString() }, { id: `eq.${userId}` });

    const user = await restSingle('users', { id: `eq.${userId}` });
    if (user?.fcm_token) {
      await sendFcm(user.fcm_token, { title: '✅ Payment Verified!', body: 'Your subscription is now active. Thank you!' }, { type: 'payment_verified' });
    }

    res.json({ success: true });
  } catch (e) { safeError(res, e, 'admin-verify-payment'); }
});

// ── Reports ──────────────────────────────────────────────────────────
app.get('/api/reports', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSelect('reports', '*', { order: 'timestamp.desc', limit: '100' });
    res.json({ reports: data || [] });
  } catch (e) { safeError(res, e, 'reports-list'); }
});

app.post('/api/reports', requireSupabase, async (req, res) => {
  try {
    await restInsert('reports', {
      message: req.body.message, username: req.body.username || '',
      userId: req.body.userId || '', appVersion: req.body.appVersion || 'unknown',
      timestamp: new Date().toISOString(), status: 'unread',
    });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'reports-create'); }
});

app.put('/api/admin/reports/:id/read', requireSupabase, requireAdmin, async (req, res) => {
  try {
    await restUpdate('reports', { status: 'read' }, { id: `eq.${req.params.id}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'reports-mark-read'); }
});

app.delete('/api/admin/reports/:id', requireSupabase, requireAdmin, async (req, res) => {
  try {
    await restDelete('reports', { id: `eq.${req.params.id}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'reports-delete'); }
});

// ── AI Analyze ───────────────────────────────────────────────────────
app.post('/api/ai-analyze', requireSupabase, requireJwt, async (req, res) => {
  try {
    const { word } = req.body;
    if (!word) return res.status(400).json({ error: 'Word required' });

    const userId = req.userId;
    const limit = await checkAndUpdateDailyUsage(userId);
    if (!limit.allowed) {
      return res.status(429).json({ error: limit.reason === 'cool_down' ? 'Cooling down. Try again later.' : 'Daily limit reached', remaining: 0, ...limit });
    }

    // Call Groq/Gemini AI (same logic as before - uses AI provider from config)
    // [AI processing code remains unchanged - external API calls not affected by migration]
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;

    let config = { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiGeminiModel: 'gemini-2.0-flash', aiEnabled: true };
    try {
      const d = await restSingle('app_config', { id: `eq.1`, select: 'ai_provider,ai_model,ai_gemini_model,ai_enabled' });
      if (d) config = { ...config, aiProvider: d.ai_provider, aiModel: d.ai_model, aiGeminiModel: d.ai_gemini_model, aiEnabled: d.ai_enabled };
    } catch {}

    if (!config.aiEnabled) return res.status(503).json({ error: 'AI features disabled' });

    const prompt = `Analyze the English word "${word}" and return ONLY valid JSON (no markdown, no code block). Format: { "word": "...", "type": "Noun|Verb|Adjective|Adverb|Preposition|Conjunction|Pronoun|Interjection", "definition": "...", "phonetic": "/.../", "synonyms": "comma,separated", "antonyms": "comma,separated", "simpleSentence": "...", "complexSentence": "...", "compoundSentence": "..." }`;

    let aiResult = null;
    if (config.aiProvider === 'gemini' && GEMINI_API_KEY) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.aiGeminiModel}:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        aiResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch {}
    }

    if (!aiResult && (GROQ_API_KEY || GROQ_API_KEY_2)) {
      const apiKey = (Math.random() > 0.5 && GROQ_API_KEY_2) ? GROQ_API_KEY_2 : GROQ_API_KEY;
      try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.aiModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
          }),
        });
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content || '';
        aiResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch {}
    }

    if (!aiResult) return res.status(502).json({ error: 'AI analysis failed' });

    // Log search event
    await restInsert('search_events', { user_id: userId, word, timestamp: new Date().toISOString() });
    await restInsert('search_history', { user_id: userId, word, timestamp: new Date().toISOString() });

    res.json({
      ...aiResult, _meta: { dailyRemaining: limit.remaining, isPremium: limit.isPremium || false },
    });
  } catch (e) { safeError(res, e, 'ai-analyze'); }
});

app.post('/api/ai/generate-quiz', requireSupabase, async (req, res) => {
  try {
    const { count = 5, difficulty = 'medium' } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;

    let config = { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiGeminiModel: 'gemini-2.0-flash', aiEnabled: true };
    try {
      const d = await restSingle('app_config', { id: `eq.1`, select: 'ai_provider,ai_model,ai_gemini_model,ai_enabled' });
      if (d) config = { ...config, aiProvider: d.ai_provider, aiModel: d.ai_model, aiGeminiModel: d.ai_gemini_model, aiEnabled: d.ai_enabled };
    } catch {}
    if (!config.aiEnabled) return res.status(503).json({ error: 'AI features disabled' });

    const prompt = `Generate ${count} ${difficulty} English vocabulary quiz questions. Return ONLY valid JSON (no markdown, no code block). Format: { "questions": [{ "word": "...", "question": "...", "options": ["a","b","c","d"], "correctIndex": 0, "hint": "...", "difficulty": "${difficulty}" }] }. Make questions test word meanings, synonyms, antonyms, or usage. Ensure correctIndex points to the right answer in options.`;

    let aiResult = null;
    if (config.aiProvider === 'gemini' && GEMINI_API_KEY) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.aiGeminiModel}:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        aiResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch {}
    }

    if (!aiResult && (GROQ_API_KEY || GROQ_API_KEY_2)) {
      const apiKey = (Math.random() > 0.5 && GROQ_API_KEY_2) ? GROQ_API_KEY_2 : GROQ_API_KEY;
      try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.aiModel, messages: [{ role: 'user', content: prompt }], temperature: 0.7 }),
        });
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content || '';
        aiResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch {}
    }

    if (!aiResult || !Array.isArray(aiResult.questions)) return res.status(502).json({ error: 'AI generation failed' });

    res.json({ success: true, questions: aiResult.questions });
  } catch (e) { safeError(res, e, 'ai-generate-quiz'); }
});

app.post('/api/generate', requireSupabase, requireJwt, async (req, res) => {
  try {
    const { type, prompt: userPrompt } = req.body;
    const userId = req.userId;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    let config = { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiEnabled: true };
    try {
      const d = await restSingle('app_config', { id: `eq.1`, select: 'ai_provider,ai_model,ai_enabled' });
      if (d) config = { ...config, aiProvider: d.ai_provider, aiModel: d.ai_model, aiEnabled: d.ai_enabled };
    } catch {}
    if (!config.aiEnabled) return res.status(503).json({ error: 'AI features disabled' });

    if (!GROQ_API_KEY) return res.status(503).json({ error: 'AI not configured' });

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.aiModel, messages: [{ role: 'user', content: userPrompt }], temperature: 0.7 }),
    });
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || '';

    res.json({ result: text });
  } catch (e) { safeError(res, e, 'generate'); }
});

// ── User Word Endpoints (Android app) ────────────────────────────────
app.post('/api/user/words/save', requireSupabase, requireJwt, async (req, res) => {
  try {
    const userId = req.userId;
    const { word, type, definition, phonetic, synonyms, antonyms, simpleSentence, complexSentence, compoundSentence } = req.body;
    if (!word) return res.status(400).json({ error: 'Word required' });

    await restUpsert('saved_words', {
      user_id: userId, word: word.toLowerCase(), type: type || 'Noun',
      definition: definition || '', phonetic: phonetic || '',
      synonyms: synonyms || '', antonyms: antonyms || '',
      simple_sentence: simpleSentence || '', complex_sentence: complexSentence || '',
      compound_sentence: compoundSentence || '',
      timestamp: new Date().toISOString(),
    }, 'user_id,word');
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'user-words-save'); }
});

app.delete('/api/user/words/:word', requireSupabase, requireJwt, async (req, res) => {
  try {
    await restDelete('saved_words', { user_id: `eq.${req.userId}`, word: `eq.${req.params.word.toLowerCase()}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'user-words-delete'); }
});

app.get('/api/user/words', requireSupabase, requireJwt, async (req, res) => {
  try {
    const data = await restSelect('saved_words', '*', { user_id: `eq.${req.userId}`, order: 'timestamp.desc', limit: '200' });
    res.json({ words: data || [] });
  } catch (e) { safeError(res, e, 'user-words-list'); }
});

app.get('/api/user/daily-usage', requireSupabase, requireJwt, async (req, res) => {
  try {
    const user = await restSingle('users', { id: `eq.${req.userId}` });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sub = await restMaybeSingle('user_subscriptions', { user_id: `eq.${req.userId}` }) || {};
    const premium = sub.active || sub.lifetime_free;
    const usage = await restMaybeSingle('daily_usage', { user_id: `eq.${req.userId}`, date: `eq.${getTodayStr()}` });
    const dailyCount = usage?.count || 0;
    const inCooldown = user.cooldown_until && new Date(user.cooldown_until).getTime() > Date.now();
    res.json({
      dailyRemaining: inCooldown ? 0 : (premium ? -1 : (10 - dailyCount)),
      dailyUsed: dailyCount, dailyLimit: premium ? -1 : 10,
      isPremium: premium, plan: sub.plan || 'free',
      coolDownUntil: user.cooldown_until ? new Date(user.cooldown_until).getTime() : null,
      serverTime: Date.now(),
    });
  } catch (e) { safeError(res, e, 'user-daily-usage'); }
});

// ── Quiz Pool ────────────────────────────────────────────────────────
app.post('/api/quiz-pool/publish', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'Questions array required' });

    // Delete existing pool
    await restDelete('quiz_pool', { id: `not.eq.00000000-0000-0000-0000-000000000000` });
    const now = new Date().toISOString();
    const records = questions.map((q, i) => ({
      word: q.word || null, question: q.question, options: q.options, correct_index: q.correctIndex,
      hint: q.hint || null, difficulty: q.difficulty || 'medium', created_at: now, index: i,
    }));
    if (records.length) await restInsert('quiz_pool', records);
    res.json({ success: true, count: records.length });
  } catch (e) { safeError(res, e, 'quiz-pool-publish'); }
});

app.get('/api/quiz-pool', requireSupabase, async (req, res) => {
  try {
    const data = await restSelect('quiz_pool', '*', { order: 'created_at.desc', limit: '10' });
    res.json({ questions: data || [] });
  } catch (e) { safeError(res, e, 'quiz-pool'); }
});

app.get('/api/quiz-pool/status', requireSupabase, async (req, res) => {
  try {
    const data = await restSelect('quiz_pool', 'word,created_at', { order: 'created_at.desc', limit: '40' });
    const pool = data || [];
    res.json({ hasQuiz: pool.length > 0, count: pool.length, generatedAt: pool[0]?.created_at || null, generatedWords: [...new Set(pool.map(q => q.word).filter(Boolean))] });
  } catch (e) { safeError(res, e, 'quiz-pool-status'); }
});

// ── AI Notification Agent Config ─────────────────────────────────────
app.get('/api/ai-notification-agent', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const data = await restSingle('ai_notification_agent', { id: `eq.1` });
    res.json(data || {});
  } catch { res.json({}); }
});

app.post('/api/ai-notification-agent', requireSupabase, requireAdmin, async (req, res) => {
  try {
    await restUpdate('ai_notification_agent', {
      prompt: req.body.prompt, enabled: req.body.enabled, interval_minutes: req.body.intervalMinutes,
      time_of_day: req.body.timeOfDay, updated_at: new Date().toISOString(),
      last_sent_at: req.body.lastSentAt, next_send_at: req.body.nextSendAt,
    }, { id: `eq.1` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'ai-notification-agent-post'); }
});

// ── AI Notification Scheduler (called by cron) ───────────────────────
app.post('/api/ai-notification-tick', requireSupabase, async (req, res) => {
  try {
    const agent = await restSingle('ai_notification_agent', { id: `eq.1` });
    if (!agent || !agent.enabled) return res.json({ skipped: true, reason: 'disabled' });

    const now = Date.now();
    const nextSend = agent.next_send_at ? new Date(agent.next_send_at).getTime() : 0;
    if (nextSend > now) return res.json({ skipped: true, reason: 'not yet' });

    const users = await restSelect('users', 'fcm_token', { status: 'eq.active', fcm_token: 'not.is.null' });
    const tokens = (users || []).map(u => u.fcm_token).filter(Boolean);
    if (!tokens.length) return res.json({ skipped: true, reason: 'no users' });

    const recentSearches = await restSelect('search_events', 'word', { timestamp: `gte.${new Date(now - 3600000).toISOString()}` });
    const recentWords = [...new Set((recentSearches || []).map(s => s.word?.toLowerCase()).filter(Boolean))];

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    let message = 'Time to learn some new words! 📚';
    if (GROQ_API_KEY && agent.prompt) {
      try {
        const context = recentWords.length ? `Recent words users searched: ${recentWords.slice(0, 5).join(', ')}. ` : '';
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: `${agent.prompt}\n\n${context}Keep it under 100 characters.` }],
            temperature: 0.7, max_tokens: 100,
          }),
        });
        const data = await resp.json();
        message = data?.choices?.[0]?.message?.content || message;
      } catch {}
    }

    const result = await sendFcmMulticast(tokens, { title: '📖 Words Nest', body: message }, { type: 'ai_notification' });

    const notifId = `ai_${now}`;
    await restInsert('global_notifications', {
      id: notifId, title: 'AI Notification', message,
      target: 'ai_automation', sentAt: new Date(now).toISOString(),
      success: true, sentCount: tokens.length, deliveredCount: result.successCount,
      aiGenerated: true, aiPrompt: agent.prompt,
    });

    const interval = (agent.interval_minutes || 60) * 60 * 1000;
    await restUpdate('ai_notification_agent', {
      last_sent_at: new Date(now).toISOString(),
      next_send_at: new Date(now + interval).toISOString(),
    }, { id: `eq.1` });

    res.json({ success: true, sent: result.successCount, failed: result.failureCount });
  } catch (e) { safeError(res, e, 'ai-notification-tick'); }
});

// ── iOS Waitlist ─────────────────────────────────────────────────────
app.get('/api/waitlist/count', requireSupabase, async (req, res) => {
  try {
    const count = await safeCount('waitlist_ios');
    res.json({ count });
  } catch (e) { safeError(res, e, 'waitlist-count'); }
});

app.post('/api/waitlist/join', requireSupabase, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const existing = await restMaybeSingle('waitlist_ios', { email: `eq.${email.toLowerCase()}` });
    if (existing) return res.status(409).json({ error: 'Already on waitlist' });

    await restInsert('waitlist_ios', { email: email.toLowerCase(), created_at: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'waitlist-join'); }
});

// ── Android App Notifications (per-user) ─────────────────────────────
app.get('/api/notifications/:userId', requireSupabase, async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await restSelect('user_notifications', '*', { user_id: `eq.${userId}`, order: 'created_at.desc', limit: '20' });
    res.json({ notifications: data || [] });
  } catch (e) { safeError(res, e, 'notifications-user'); }
});

app.put('/api/notifications/:userId/read/:notificationId', requireSupabase, async (req, res) => {
  try {
    await restUpdate('user_notifications', { is_read: true }, { id: `eq.${req.params.notificationId}`, user_id: `eq.${req.params.userId}` });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'notifications-mark-read'); }
});

// ── Install Analytics ────────────────────────────────────────────────
app.get('/api/installs/stats', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const total = await safeCount('installs');
    const users = await restSelect('users', 'status', { limit: '50000' });
    const active = (users || []).filter(u => u.status === 'active').length;
    res.json({ totalInstalls: total, activeUsers: active });
  } catch (e) { safeError(res, e, 'installs-stats'); }
});

// ── Static Files ─────────────────────────────────────────────────────
// Frontend path aliases (admin panel uses different paths than server routes)
const apiHost = `http://localhost:${PORT}`;
function proxy(req, res, targetUrl, method = 'POST') {
  fetch(targetUrl, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) })
    .then(r => r.json().then(d => res.json(d)).catch(() => res.status(r.status).json({})))
    .catch(e => { console.error('[ERROR] proxy:', e); res.status(500).json({ error: 'Internal server error' }); });
}
app.get('/api/admin/notifications', requireSupabase, requireAdmin, (req, res) => {
  fetch(`${apiHost}/api/notifications`).then(r => r.json()).then(d => res.json(d)).catch(e => res.json({ notifications: [] }));
});
app.post('/api/admin/send-notification', requireSupabase, requireAdmin, (req, res) => proxy(req, res, `${apiHost}/api/notifications/send`));
app.get('/api/admin/leaderboard', requireSupabase, requireAdmin, (req, res) => {
  fetch(`${apiHost}/api/leaderboard/admin`).then(r => r.json()).then(d => res.json(d)).catch(e => res.json({ leaderboard: [] }));
});
app.put('/api/reports/:id/status', requireSupabase, requireAdmin, async (req, res) => {
  try { await restUpdate('reports', { status: 'read' }, { id: `eq.${req.params.id}` }); res.json({ success: true }); } catch (e) { safeError(res, e, 'reports-status'); }
});
app.delete('/api/reports/:id', requireSupabase, requireAdmin, async (req, res) => {
  try { await restDelete('reports', { id: `eq.${req.params.id}` }); res.json({ success: true }); } catch (e) { safeError(res, e, 'reports-delete'); }
});
app.put('/api/admin/payments/:trxId/verify', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const trxId = req.params.trxId;
    const payment = await restSingle('user_payments', { trx_id: `eq.${sanitize(trxId)}`, select: '*,users!inner(id,fcm_token)' });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const userId = payment.user_id;
    await restUpdate('user_payments', { verified: true, verified_by: req.headers['x-admin-id'] || 'admin', verified_at: new Date().toISOString() }, { trx_id: `eq.${sanitize(trxId)}` });
    await restUpsert('user_subscriptions', { user_id: userId, plan: 'lifetime', active: true, lifetime_free: true, expires_at: null, verified_by: req.headers['x-admin-id'] || 'admin', verified_at: new Date().toISOString() }, 'user_id');
    await restUpdate('users', { last_active: new Date().toISOString() }, { id: `eq.${userId}` });
    const user = await restSingle('users', { id: `eq.${userId}` });
    if (user?.fcm_token) await sendFcm(user.fcm_token, { title: '✅ Payment Verified!', body: 'Your subscription is now active. Thank you!' }, { type: 'payment_verified' });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'payment-verify'); }
});
app.get('/api/users/stats', requireSupabase, requireAdmin, async (req, res) => {
  try {
    const [total, active, statusData, newToday, newWeek, newMonth, countsByVersion] = await Promise.all([
      safeCount('users'),
      safeFilterCount('users', 'status', 'active', 'last_active', getDaysAgo(1)),
      (async () => { const a = await restCount('users', { status: 'eq.active' }); const i = await restCount('users', { status: 'eq.inactive' }); return { active: a, inactive: i }; })(),
      safeFilterCount('users', 'status', 'active', 'created_at', getDayStart()),
      safeFilterCount('users', 'status', 'active', 'created_at', getDaysAgo(7)),
      safeFilterCount('users', 'status', 'active', 'created_at', getDaysAgo(30)),
      (async () => { try { const d = await restSelect('users', 'app_version', { limit: '50000' }); const c = {}; for (const u of d || []) { const v = u.app_version || 'unknown'; c[v] = (c[v] || 0) + 1; } return c; } catch { return {}; } })(),
    ]);
    res.json({ total, active, statusBreakpoint: statusData, newToday, thisWeek: newWeek, thisMonth: newMonth, byVersion: countsByVersion });
  } catch (e) { safeError(res, e, 'users-stats'); }
});
app.get('/api/ai/notification-agent-config', requireSupabase, requireAdmin, (req, res) => {
  fetch(`${apiHost}/api/ai-notification-agent`).then(r => r.json()).then(d => res.json(d)).catch(e => res.json({}));
});
app.post('/api/ai/notification-agent-config', requireSupabase, requireAdmin, (req, res) => proxy(req, res, `${apiHost}/api/ai-notification-agent`));

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
