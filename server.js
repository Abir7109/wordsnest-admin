import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { Client, Databases, Query } from 'node-appwrite';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

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
const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

if (!APPWRITE_PROJECT_ID || !APPWRITE_API_KEY || !APPWRITE_DATABASE_ID) {
  console.error('FATAL: Appwrite PROJECT_ID, API_KEY, and DATABASE_ID env vars required');
  process.exit(1);
}

const appwriteClient = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);

const db = new Databases(appwriteClient);
const DB_ID = APPWRITE_DATABASE_ID;

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
  return true;
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

// ── Appwrite DB Helpers ──────────────────────────────────────────────

// Helper to convert Appwrite doc to plain object (strip $ prefixes)
function cleanDoc(doc) {
  if (!doc) return null;
  const { $id, $createdAt, $updatedAt, $permissions, $collectionId, $databaseId, ...rest } = doc;
  return { id: $id, createdAt: $createdAt, updatedAt: $updatedAt, ...rest };
}

function cleanDocs(docs) {
  return docs.map(d => cleanDoc(d));
}

async function awGet(coll, id) {
  try {
    const doc = await db.getDocument(DB_ID, coll, id);
    return cleanDoc(doc);
  } catch { return null; }
}

async function awFind(coll, queries = []) {
  try {
    const res = await db.listDocuments(DB_ID, coll, [...queries, Query.limit(1)]);
    return res.documents.length > 0 ? cleanDoc(res.documents[0]) : null;
  } catch { return null; }
}

async function awList(coll, queries = []) {
  try {
    // Extract any caller-specified limit from queries
    const limitIdx = queries.findIndex(q => q.startsWith('limit('));
    const callerLimit = limitIdx >= 0 ? parseInt(queries.splice(limitIdx, 1)[0].replace(/^limit\((\d+)\)$/, '$1')) : 0;
    const pageSize = callerLimit > 0 ? Math.min(callerLimit, 100) : 100;
    const maxDocs = callerLimit > 0 ? callerLimit : Infinity;

    let allDocs = [];
    let offset = 0;
    while (allDocs.length < maxDocs) {
      const res = await db.listDocuments(DB_ID, coll, [...queries, Query.limit(pageSize), Query.offset(offset)]);
      allDocs = allDocs.concat(res.documents);
      if (res.documents.length < pageSize) break;
      offset += pageSize;
    }
    return cleanDocs(allDocs.slice(0, maxDocs === Infinity ? allDocs.length : maxDocs));
  } catch { return []; }
}

async function awCount(coll, queries = []) {
  try {
    const res = await db.listDocuments(DB_ID, coll, [...queries, Query.limit(1)]);
    return res.total;
  } catch { return 0; }
}

async function awCreate(coll, id, data) {
  try {
    return cleanDoc(await db.createDocument(DB_ID, coll, id, data));
  } catch { return null; }
}

async function awUpdate(coll, id, data) {
  try {
    return cleanDoc(await db.updateDocument(DB_ID, coll, id, data));
  } catch { return null; }
}

async function awDelete(coll, id) {
  try {
    await db.deleteDocument(DB_ID, coll, id);
    return true;
  } catch { return false; }
}

async function awUpsert(coll, id, data) {
  try {
    return await awCreate(coll, id, data);
  } catch (e) {
    if (e.code === 409) {
      return await awUpdate(coll, id, data);
    }
    throw e;
  }
}

async function awGetUser(id) {
  return awGet('users', id);
}

async function checkDailyUsage(userId) {
  return { allowed: true, remaining: -1, isPremium: true, count: 0 };
}

async function incrementDailyUsage(userId) {
  // No-op — unlimited for all users
}

// ── Health ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', appwrite: true }));
app.get('/api/server-time', (req, res) => res.json({ serverTime: Date.now() }));
app.get('/api/ping-keep-alive', (req, res) => res.json({ pong: Date.now() }));

// ── Dashboard ────────────────────────────────────────────────────────

app.get('/api/dashboard', requireAdmin, async (req, res) => {
  try {
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgoIso = new Date(getDaysAgo(7)).toISOString();
    const yesterdayIso = new Date(getDaysAgo(1)).toISOString();

    const results = await Promise.all([
      awCount('users'),
      awCount('search_events'),
      awCount('installs'),
      awCount('users', [Query.greaterThan('last_active', dayAgo)]),
      awCount('users', [Query.greaterThan('created_at', todayStart)]),
      awCount('search_events', [Query.greaterThan('timestamp', todayStart)]),
      awCount('users', [Query.lessThan('created_at', weekAgoIso)]),
      awCount('users', [Query.greaterThan('last_active', yesterdayIso), Query.lessThan('created_at', weekAgoIso)]),
      awCount('saved_words'),
      awCount('quiz_attempts'),
    ]);

    const [users, searches, installs, activeUsers, newUsersToday, searchesToday, usersBeforeWeek, retained, words, quizzes] = results;

    const engagementRate = users > 0 ? Math.round((activeUsers / users) * 100) : 0;
    const retentionRate = usersBeforeWeek > 0 ? Math.round((retained / usersBeforeWeek) * 100) : 0;

    const [wordsTodayCount, quizzesTodayCount, savedTypesData, savedWordsData, quizScoresData] = await Promise.all([
      awCount('saved_words', [Query.greaterThan('timestamp', todayStart)]).catch(() => 0),
      awCount('quiz_attempts', [Query.greaterThan('timestamp', todayStart)]).catch(() => 0),
      awList('saved_words', [Query.limit(2000)]),
      awList('saved_words', [Query.limit(2000)]),
      awList('quiz_attempts', [Query.limit(1000)]),
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

    res.json(payload);
  } catch (e) { safeError(res, e, 'dashboard'); }
});

app.get('/api/dashboard/timeline', requireAdmin, async (req, res) => {
  try {
    const sinceTs = new Date(getDaysAgo(6)).toISOString();
    const days = 7;

    const [usersAll, searchesAll, activeUsers] = await Promise.all([
      awList('users', [Query.greaterThan('created_at', sinceTs)]),
      awList('search_events', [Query.greaterThan('timestamp', sinceTs)]),
      awList('users', [Query.greaterThan('last_active', sinceTs)]),
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

app.get('/api/dashboard/top-words', requireAdmin, async (req, res) => {
  try {
    const data = await awList('saved_words', [Query.limit(2000)]);
    const freq = {};
    for (const w of data || []) { const wl = w.word?.toLowerCase(); if (wl) freq[wl] = (freq[wl] || 0) + 1; }
    const topWords = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    res.json({ topWords });
  } catch { res.json({ topWords: [] }); }
});
app.get('/api/dashboard/top-searches', requireAdmin, async (req, res) => {
  try {
    const data = await awList('search_events', [Query.orderDesc('timestamp'), Query.limit(50000)]);
    const freq = {};
    for (const s of data || []) { const w = s.word?.toLowerCase(); if (w) freq[w] = (freq[w] || 0) + 1; }
    const topSearches = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    res.json({ topSearches });
  } catch { res.json({ topSearches: [] }); }
});
app.get('/api/dashboard/word-types', requireAdmin, async (req, res) => {
  try {
    const data = await awList('saved_words', [Query.limit(2000)]);
    const dist = {};
    for (const w of data || []) { if (w.type) dist[w.type] = (dist[w.type] || 0) + 1; }
    const distribution = Object.entries(dist).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    res.json({ distribution });
  } catch { res.json({ distribution: [] }); }
});

app.get('/api/dashboard/recent-activity', requireAdmin, async (req, res) => {
  try {
    const users = await awList('users', [Query.orderDesc('created_at'), Query.limit(5)]);
    const activities = (users || []).map(u => ({
      type: 'user_signup', userId: u.id,
      username: u.username || 'Unknown',
      timestamp: new Date(u.created_at).getTime(),
    }));
    res.json({ activities });
  } catch { res.json({ activities: [] }); }
});

// ── Users ────────────────────────────────────────────────────────────
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const [users, subs, wordCounts, quizCounts, usageRecords] = await Promise.all([
      awList('users', [Query.orderDesc('last_active'), Query.limit(100)]),
      awList('user_subscriptions', [Query.limit(5000)]),
      awList('saved_words', [Query.limit(50000)]),
      awList('quiz_attempts', [Query.limit(50000)]),
      awList('daily_usage', [Query.equal('date', getTodayStr()), Query.limit(5000)]),
    ]);
    const subMap = {};
    for (const s of subs || []) subMap[s.user_id] = { plan: s.plan, active: s.active, lifetimeFree: s.lifetime_free, expiresAt: s.expires_at };
    const usageMap = {};
    for (const r of usageRecords || []) usageMap[r.user_id] = r.count || 0;
    const wc = {}; for (const w of wordCounts || []) wc[w.user_id] = (wc[w.user_id] || 0) + 1;
    const qc = {}; for (const q of quizCounts || []) qc[q.user_id] = (qc[q.user_id] || 0) + 1;
    const enriched = (users || []).map(u => ({
      uid: u.id, ...u, subscription: subMap[u.id] || { plan: 'free', active: false, lifetimeFree: false },
      lastActive: new Date(u.last_active).getTime(), wordCount: wc[u.id] || 0, quizCount: qc[u.id] || 0,
      banned: u.status === 'banned', coolDownUntil: u.cooldown_until ? new Date(u.cooldown_until).getTime() : null,
      rateLimitHits: u.rate_limit_hits || 0, deviceName: u.device_name, created_at: u.created_at,
      dailyUsage: usageMap[u.id] || 0,
    }));
    res.json({ users: enriched });
  } catch (e) { safeError(res, e, 'users-list'); }
});

app.delete('/api/users/:identifier', requireAdmin, async (req, res) => {
  try {
    const { identifier } = req.params;
    const cleanId = sanitize(identifier);
    let user = await awGet('users', cleanId);
    if (!user) user = await awFind('users', [Query.equal('phone', cleanId)]);
    if (!user) user = await awFind('users', [Query.equal('email', cleanId.toLowerCase().trim())]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const uid = user.id;

    if (user.fcm_token) {
      try { await sendFcm(user.fcm_token, { title: 'Account Deleted', body: 'Your account has been permanently deleted.' }, { type: 'force_logout' }); } catch {}
    }

    // Delete all user data
    const deletes = [
      awDelete('users', uid).catch(() => {}),
      awDelete('user_subscriptions', uid).catch(() => {}),
    ];
    // Delete search history (both collections)
    for (const coll of ['search_events', 'search_history']) {
      const docs = await awList(coll, [Query.equal('user_id', uid), Query.limit(50000)]);
      for (const d of docs || []) deletes.push(awDelete(coll, d.id).catch(() => {}));
    }
    // Delete quiz attempts
    const quizzes = await awList('quiz_attempts', [Query.equal('user_id', uid), Query.limit(50000)]);
    for (const q of quizzes || []) deletes.push(awDelete('quiz_attempts', q.id).catch(() => {}));
    // Delete daily usage records
    const usage = await awList('daily_usage', [Query.equal('user_id', uid), Query.limit(50000)]);
    for (const d of usage || []) deletes.push(awDelete('daily_usage', d.id).catch(() => {}));

    await Promise.all(deletes);

    console.log(`[ADMIN] User ${uid} (${user.phone}) permanently deleted by admin`);
    res.json({ success: true, message: 'User permanently deleted.' });
  } catch (e) { safeError(res, e, 'users-delete'); }
});

app.get('/api/users/stats/aggregate', requireAdmin, async (req, res) => {
  try {
    const [total, active, statusData, newToday, newWeek, newMonth, countsByVersion] = await Promise.all([
      awCount('users'),
      awCount('users', [Query.equal('status', 'active'), Query.greaterThan('last_active', getDaysAgo(1))]),
      (async () => {
        const activeC = await awCount('users', [Query.equal('status', 'active')]);
        const inactiveC = await awCount('users', [Query.equal('status', 'inactive')]);
        return { active: activeC, inactive: inactiveC };
      })(),
      awCount('users', [Query.equal('status', 'active'), Query.greaterThan('created_at', getDayStart())]),
      awCount('users', [Query.equal('status', 'active'), Query.greaterThan('created_at', getDaysAgo(7))]),
      awCount('users', [Query.equal('status', 'active'), Query.greaterThan('created_at', getDaysAgo(30))]),
      (async () => {
        try {
          const data = await awList('users', [Query.limit(50000)]);
          const counts = {};
          for (const u of data || []) { const v = u.app_version || 'unknown'; counts[v] = (counts[v] || 0) + 1; }
          return counts;
        } catch { return {}; }
      })(),
    ]);

    res.json({ total, active, statusBreakdown: statusData, newUsersToday: newToday, newUsersThisWeek: newWeek, newUsersThisMonth: newMonth, byAppVersion: countsByVersion });
  } catch (e) { safeError(res, e, 'users-stats-aggregate'); }
});

app.get('/api/users/:phone', requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    let user = await awGet('users', sanitize(phone));
    if (!user) user = await awFind('users', [Query.equal('phone', sanitize(phone))]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const uid = user.id;
    const [wordsData, quizzesData, searchData] = await Promise.all([
      awList('saved_words', [Query.equal('user_id', uid), Query.orderDesc('timestamp'), Query.limit(100)]),
      awList('quiz_attempts', [Query.equal('user_id', uid), Query.orderDesc('timestamp'), Query.limit(50)]),
      awList('search_history', [Query.equal('user_id', uid), Query.orderDesc('timestamp'), Query.limit(50)]),
    ]);
    const sub = await awFind('user_subscriptions', [Query.equal('user_id', uid)]) || {};

    res.json({
      profile: { uid, ...user, subscription: { plan: sub.plan, active: sub.active, lifetimeFree: sub.lifetime_free, expiresAt: sub.expires_at ? new Date(sub.expires_at).getTime() : null, dailyUsage: sub.daily_usage }, banned: user.status === 'banned', coolDownUntil: user.cooldown_until ? new Date(user.cooldown_until).getTime() : null, rateLimitHits: user.rate_limit_hits || 0, deviceName: user.device_name, lastActive: new Date(user.last_active).getTime(), createdAt: new Date(user.created_at).getTime() },
      words: (wordsData || []).map(w => ({ id: w.id, ...w })),
      quizzes: (quizzesData || []).map(q => ({ id: q.id, ...q })),
      searchHistory: (searchData || []).map(s => ({ id: s.id, ...s })),
    });
  } catch (e) { safeError(res, e, 'users-detail'); }
});

// ── Saved Words ──────────────────────────────────────────────────────
app.get('/api/words', requireAdmin, async (req, res) => {
  try {
    const data = await awList('saved_words', [Query.orderDesc('timestamp'), Query.limit(200)]);
    res.json({ words: data || [] });
  } catch (e) { safeError(res, e, 'words-list'); }
});

app.delete('/api/words/:id', async (req, res) => {
  try {
    await awDelete('saved_words', req.params.id);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'words-delete'); }
});

app.get('/api/words/delete/:id', requireAdmin, async (req, res) => {
  try {
    await awDelete('saved_words', req.params.id);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'words-delete'); }
});

app.get('/api/words/stats', async (req, res) => {
  try {
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const total = await awCount('saved_words');
    const todayC = await awCount('saved_words', [Query.greaterThan('timestamp', todayStart)]);
    const weekC = await awCount('saved_words', [Query.greaterThan('timestamp', weekAgo)]);
    let typeDist = {}, topWords = [], uniqueWords = 0;
    try {
      const data = await awList('saved_words', [Query.limit(2000)]);
      for (const w of data || []) { if (w.type) typeDist[w.type] = (typeDist[w.type] || 0) + 1; }
    } catch {}
    try {
      const data = await awList('saved_words', [Query.limit(2000)]);
      const freq = {};
      for (const w of data || []) { const wl = w.word?.toLowerCase(); if (wl) { freq[wl] = (freq[wl] || 0) + 1; } }
      uniqueWords = Object.keys(freq).length;
      topWords = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    } catch {}
    res.json({ total, today: todayC, thisWeek: weekC, uniqueWords, typeDistribution: Object.entries(typeDist).map(([type, count]) => ({ type, count, percentage: Math.round((count / (Object.values(typeDist).reduce((a, b) => a + b, 0) || 1)) * 100) })), topWords });
  } catch (e) { safeError(res, e, 'words-stats'); }
});

// ── Searches ─────────────────────────────────────────────────────────
app.get('/api/searches', requireAdmin, async (req, res) => {
  try {
    const data = await awList('search_events', [Query.orderDesc('timestamp'), Query.limit(200)]);
    res.json({ searches: data || [] });
  } catch (e) { safeError(res, e, 'searches-list'); }
});

app.delete('/api/searches/:id', async (req, res) => {
  try {
    await awDelete('search_events', req.params.id);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'searches-delete'); }
});

app.get('/api/searches/stats', requireAdmin, async (req, res) => {
  try {
    const total = await awCount('search_events');
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const todayC = await awCount('search_events', [Query.greaterThan('timestamp', todayStart)]);
    const weekC = await awCount('search_events', [Query.greaterThan('timestamp', weekAgo)]);
    let topSearches = [];
    try {
      const data = await awList('search_events', [Query.limit(50000)]);
      const freq = {};
      for (const s of data || []) { const w = s.word?.toLowerCase(); if (w) freq[w] = (freq[w] || 0) + 1; }
      topSearches = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    } catch {}
    res.json({ total, today: todayC, thisWeek: weekC, uniqueWords: topSearches.length, topSearches });
  } catch (e) { safeError(res, e, 'searches-stats'); }
});

// ── Quizzes ──────────────────────────────────────────────────────────
app.get('/api/quizzes', requireAdmin, async (req, res) => {
  try {
    const data = await awList('quiz_attempts', [Query.orderDesc('timestamp'), Query.limit(200)]);
    const enriched = [];
    for (const q of data || []) {
      const u = q.user_id ? await awGet('users', q.user_id).catch(() => null) : null;
      enriched.push({ ...q, username: u?.username || '', email: u?.email || '' });
    }
    res.json({ quizzes: enriched });
  } catch (e) { safeError(res, e, 'quizzes-list'); }
});

app.delete('/api/quizzes/:id', requireAdmin, async (req, res) => {
  try {
    await awDelete('quiz_attempts', req.params.id);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'quizzes-delete'); }
});

app.get('/api/quizzes/stats', requireAdmin, async (req, res) => {
  try {
    const total = await awCount('quiz_attempts');
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const todayC = await awCount('quiz_attempts', [Query.greaterThan('timestamp', todayStart)]);
    const weekC = await awCount('quiz_attempts', [Query.greaterThan('timestamp', weekAgo)]);
    let scores = [];
    try {
      const data = await awList('quiz_attempts', [Query.limit(1000)]);
      scores = (data || []).map(q => q.score).filter(s => s !== null && s !== undefined);
    } catch {}
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const highest = scores.length > 0 ? Math.max(...scores) : 0;
    const lowest = scores.length > 0 ? Math.min(...scores) : 0;
    const participants = await awCount('quiz_attempts');
    const scoreDist = {};
    for (const s of scores) { const r = s >= 80 ? '80-100' : s >= 60 ? '60-79' : s >= 40 ? '40-59' : '0-39'; scoreDist[r] = (scoreDist[r] || 0) + 1; }
    res.json({ total, today: todayC, thisWeek: weekC, averageScore: avg, highestScore: highest, lowestScore: lowest, totalParticipants: participants, scoreDistribution: Object.entries(scoreDist).map(([range, count]) => ({ range, count })) });
  } catch (e) { safeError(res, e, 'quizzes-stats'); }
});

// ── Leaderboard ──────────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    const usersDocs = await awList('users', [Query.limit(5000)]);
    const searchesDocs = await awList('search_events', [Query.limit(50000)]);
    const wordsDocs = await awList('saved_words', [Query.limit(50000)]);
    const quizzesDocs = await awList('quiz_attempts', [Query.limit(50000)]);

    const searchCounts = {}, wordCounts = {}, quizScores = {};
    for (const s of searchesDocs || []) searchCounts[s.user_id] = (searchCounts[s.user_id] || 0) + 1;
    for (const w of wordsDocs || []) wordCounts[w.user_id] = (wordCounts[w.user_id] || 0) + 1;
    for (const q of quizzesDocs || []) {
      if (!quizScores[q.user_id]) quizScores[q.user_id] = 0;
      quizScores[q.user_id] += q.score;
    }

    const entries = (usersDocs || []).map(u => {
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
app.get('/api/leaderboard/admin', requireAdmin, async (req, res) => {
  try {
    const resp = await fetch(`${req.protocol}://${req.get('host')}/api/leaderboard`);
    const data = await resp.json();
    res.json(data);
  } catch (e) { safeError(res, e, 'leaderboard-admin'); }
});

app.post('/api/leaderboard/update', requireAdmin, async (req, res) => {
  try {
    const { userId, manualScore, streak } = req.body;
    const updates = {};
    if (manualScore !== undefined) updates.leaderboard_manual_score = manualScore;
    if (streak !== undefined) updates.leaderboard_streak = streak;
    await awUpdate('users', userId, updates);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'leaderboard-update'); }
});

app.put('/api/admin/leaderboard/:uid', requireAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const { manualScore, streak } = req.body;
    const updates = {};
    if (manualScore !== undefined) updates.leaderboard_manual_score = manualScore;
    if (streak !== undefined) updates.leaderboard_streak = streak;
    await awUpdate('users', uid, updates);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'leaderboard-admin-update'); }
});

// ── App Config ───────────────────────────────────────────────────────
const appConfigCache = { data: null, ts: 0, TTL: 15000 };

function buildAppConfigResponse(data) {
  return {
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
  };
}

app.get('/api/app-config', async (req, res) => {
  try {
    if (appConfigCache.data && Date.now() - appConfigCache.ts < appConfigCache.TTL) {
      return res.json(appConfigCache.data);
    }
    const data = await awGet('app_config', '1');
    if (!data) return res.json({});
    const response = buildAppConfigResponse(data);
    appConfigCache.data = response;
    appConfigCache.ts = Date.now();
    res.json(response);
  } catch (e) { safeError(res, e, 'app-config-get'); }
});

app.post('/api/app-config', requireAdmin, async (req, res) => {
  try {
    await awUpdate('app_config', '1', req.body);
    appConfigCache.data = null;
    appConfigCache.ts = 0;

    // Sync to Firebase Firestore (background, non-blocking)
    syncFirestoreConfig(req.body).catch(e => console.error('[FIREBASE_SYNC]', e?.message));

    res.json({ success: true });
  } catch (e) { safeError(res, e, 'app-config-update'); }
});

async function syncFirestoreConfig(body) {
  const fsFields = {};
  const map = {
    forceUpdate: 'booleanValue', force_update: 'booleanValue',
    softUpdate: 'booleanValue', soft_update: 'booleanValue',
    underMaintenance: 'booleanValue', under_maintenance: 'booleanValue',
    isAppAlive: 'booleanValue', is_app_alive: 'booleanValue',
    enableLeaderboard: 'booleanValue', enableNotifications: 'booleanValue',
    enableBackup: 'booleanValue', adsEnabled: 'booleanValue',
    aiEnabled: 'booleanValue',
    currentVersion: 'stringValue', current_version: 'stringValue',
    minRequiredVersion: 'stringValue', min_required_version: 'stringValue',
    updateUrl: 'stringValue', update_url: 'stringValue',
    updateMessage: 'stringValue', update_message: 'stringValue',
    maintenanceTitle: 'stringValue', maintenance_title: 'stringValue',
    maintenanceMessage: 'stringValue', maintenance_message: 'stringValue',
    maintenanceEstimatedTime: 'stringValue', maintenance_estimated_time: 'stringValue',
    aiProvider: 'stringValue', aiModel: 'stringValue', aiGeminiModel: 'stringValue',
    dailyQuizLimit: 'integerValue', dailyWordLimit: 'integerValue',
  };
  for (const [key, type] of Object.entries(map)) {
    const val = body[key];
    if (val === undefined || val === null) continue;
    if (type === 'booleanValue') fsFields[key] = { [type]: !!val };
    else if (type === 'integerValue') fsFields[key] = { [type]: String(val) };
    else fsFields[key] = { [type]: String(val) };
  }
  const url = 'https://firestore.googleapis.com/v1/projects/words-nest/databases/(default)/documents/current_version/config';
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fsFields }),
  });
}

// ── Notifications ────────────────────────────────────────────────────
app.post('/api/notifications/send', requireAdmin, async (req, res) => {
  try {
    const { title, message, targetUserId } = req.body;
    const notifId = crypto.randomUUID();
    if (targetUserId) {
      const user = await awGet('users', targetUserId);
      if (!user?.fcm_token) return res.status(400).json({ error: 'User has no FCM token' });
      await sendFcm(user.fcm_token, { title, body: message }, { type: 'admin_notification' });
      await awCreate('global_notifications', notifId, { title, message, sentAt: new Date().toISOString(), success: true, sentCount: 1, deliveredCount: 1 });
    } else {
      const users = await awList('users', [Query.equal('status', 'active'), Query.limit(5000)]);
      const tokens = (users || []).map(u => u.fcm_token).filter(Boolean);
      const result = await sendFcmMulticast(tokens, { title, body: message }, { type: 'admin_notification' });
      await awCreate('global_notifications', notifId, {
        title, message, sentAt: new Date().toISOString(), success: true,
        sentCount: tokens.length, deliveredCount: result.successCount,
      });
    }
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'notifications-send'); }
});

app.get('/api/notifications', requireAdmin, async (req, res) => {
  try {
    const data = await awList('global_notifications', [Query.orderDesc('sent_at'), Query.limit(50)]);
    res.json({ notifications: data || [] });
  } catch (e) { safeError(res, e, 'notifications-list'); }
});

// ── Experiences ──────────────────────────────────────────────────────
app.get('/api/experiences', async (req, res) => {
  try {
    const data = await awList('experiences', [Query.orderDesc('timestamp'), Query.limit(50)]);
    res.json({ experiences: data || [] });
  } catch (e) { safeError(res, e, 'experiences-list'); }
});

app.post('/api/experiences', requireAdmin, async (req, res) => {
  try {
    await awCreate('experiences', crypto.randomUUID(), { ...req.body, timestamp: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'experiences-create'); }
});

app.delete('/api/admin/experiences/:id', requireAdmin, async (req, res) => {
  try {
    await awDelete('experiences', req.params.id);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'experiences-delete'); }
});

// ── FCM Token Registration ──────────────────────────────────────────
app.post('/api/register-fcm', async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    await awUpdate('users', userId, { fcm_token: fcmToken });
    const installDoc = await awFind('installs', [Query.equal('user_id', userId)]);
    if (installDoc) await awUpdate('installs', installDoc.id, { fcm_token: fcmToken });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'register-fcm'); }
});

// ── Guest Registration ───────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { userId, phone, username, password, deviceName } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const existing = await awGet('users', userId);
    if (!existing) {
      const now = new Date().toISOString();
      await awCreate('users', userId, {
        phone: phone || userId,
        username: username || userId.split('-')[0] || userId,
        status: 'active',
        created_at: now,
        last_active: now,
        device_name: deviceName || '',
      });
    } else {
      await awUpdate('users', userId, { last_active: new Date().toISOString() });
    }

    await awUpsert('user_subscriptions',
      userId, { user_id: userId, plan: 'free', active: false, lifetime_free: false }
    );

    const token = createToken(phone || userId, userId);
    const uname = existing?.username || username || userId.split('-')[0] || userId;
    res.json({ success: true, userId, token, phone: phone || userId, username: uname });
  } catch (e) { safeError(res, e, 'register'); }
});

// ── Auth ─────────────────────────────────────────────────────────────
app.post('/api/auth/exchange-token', async (req, res) => {
  try {
    const { uid, email, phone } = req.body;
    if (!uid) return res.status(400).json({ error: 'User ID required' });

    const existing = await awGet('users', uid);
    if (!existing) {
      const now = new Date().toISOString();
      const userEmail = email || '';
      await awCreate('users', uid, {
        email: userEmail, phone: phone || uid, username: userEmail.split('@')[0] || uid,
        status: 'active', created_at: now, last_active: now,
      });
    } else {
      await awUpdate('users', uid, { last_active: new Date().toISOString() });
    }
    await awUpsert('user_subscriptions',
      uid, { user_id: uid, plan: 'free', active: false, lifetime_free: false }
    );

    const token = createToken(phone || uid, uid);
    const username = existing?.username || (email || '').split('@')[0] || uid;
    res.json({ success: true, token, uid, email: email || '', phone: phone || uid, username, isNewUser: !existing });
  } catch (e) { safeError(res, e, 'auth-exchange'); }
});

// Phone/Email + password registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, email, username, password, deviceName } = req.body;
    if (!phone || !username || !password) return res.status(400).json({ error: 'Phone, username, and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const cleanPhone = sanitize(phone);
    const cleanUsername = sanitize(username);
    const cleanEmail = email ? sanitize(email).toLowerCase().trim() : '';

    const existing = await awFind('users', [Query.equal('phone', cleanPhone)]);
    if (existing) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await awUpdate('users', existing.id, {
        username: cleanUsername, password_hash: hashedPassword,
        device_name: sanitize(deviceName || ''), last_active: new Date().toISOString(),
        ...(cleanEmail ? { email: cleanEmail } : {}),
      });

      const token = createToken(cleanPhone, existing.id);
      return res.json({ success: true, phone: cleanPhone, email: cleanEmail, username: cleanUsername, token, uid: existing.id });
    }

    const uid = crypto.randomUUID();
    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(password, 10);

    await awCreate('users', uid, {
      email: cleanEmail, phone: cleanPhone, username: cleanUsername, password_hash: hashedPassword,
      device_name: sanitize(deviceName || ''), status: 'active',
      created_at: now, last_active: now, app_version: req.body.appVersion || '1.4.3',
    });

    await awUpsert('user_subscriptions',
      uid, { user_id: uid, plan: 'free', active: false, lifetime_free: false }
    );

    const token = createToken(cleanPhone, uid);
    console.log(`[REGISTER] Created user ${uid} (${cleanPhone})`);
    res.json({ success: true, phone: cleanPhone, email: cleanEmail, username: cleanUsername, token, uid });
  } catch (e) { console.error('[REGISTER] Error:', e?.message || e); res.status(500).json({ error: e?.message || 'Registration failed' }); }
});

// Phone/Email sign-in (accepts phone or email as identifier)
app.post('/api/auth/phone-signin', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone/email and password required' });

    const cleanIdentifier = sanitize(phone).trim();
    let user = await awFind('users', [Query.equal('phone', cleanIdentifier)]);
    if (!user) user = await awFind('users', [Query.equal('email', cleanIdentifier.toLowerCase())]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash || '');
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await awUpdate('users', user.id, { last_active: new Date().toISOString() });
    const token = createToken(user.phone || user.email, user.id);
    res.json({ success: true, token, username: user.username, uid: user.id });
  } catch (e) { safeError(res, e, 'phone-signin'); }
});

// ── Email OTP Forgot Password ──────────────────────────────────────────
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const otpStore = new Map();

function getMailTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const cleanEmail = sanitize(email).toLowerCase().trim();
    const user = await awFind('users', [Query.equal('email', cleanEmail)]);
    if (!user) return res.status(404).json({ error: 'No account found with this email' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(cleanEmail, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS });

    const mailer = getMailTransporter();
    if (mailer) {
      const from = process.env.SMTP_USER;
      await mailer.sendMail({
        from: `"WordsNest" <${from}>`,
        to: cleanEmail,
        subject: 'Password Reset OTP',
        text: `Your WordsNest password reset code: ${otp}\n\nValid for 5 minutes.`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fffbf5;border-radius:20px;border:1px solid #e8ddd0"><div style="text-align:center;font-size:40px;margin-bottom:12px">🌱</div><h2 style="color:#2a170f;text-align:center">Password Reset</h2><p style="color:#6b5b4e;text-align:center;font-size:14px">Use this code to reset your WordsNest password:</p><div style="background:#f8f2ec;border-radius:12px;padding:16px;text-align:center;margin:16px 0;border:1px solid #e8ddd0"><span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#2a170f">${otp}</span></div><p style="color:#bfa090;text-align:center;font-size:12px">Valid for 5 minutes. If you didn't request this, ignore this email.</p></div>`,
      });
      console.log(`[OTP] Emailed to ${cleanEmail}: ${otp}`);
    } else {
      console.log(`[OTP] SMTP not configured. OTP for ${cleanEmail}: ${otp}`);
    }

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (e) { safeError(res, e, 'forgot-password'); }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

    const cleanKey = sanitize(email).toLowerCase().trim();
    const stored = otpStore.get(cleanKey);
    if (!stored) return res.status(400).json({ error: 'No OTP requested' });
    if (Date.now() > stored.expiresAt) { otpStore.delete(cleanKey); return res.status(400).json({ error: 'OTP expired' }); }
    if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid code' });

    otpStore.delete(cleanKey);
    const resetToken = crypto.randomBytes(32).toString('hex');
    otpStore.set(`reset_${cleanKey}`, { resetToken, expiresAt: Date.now() + OTP_EXPIRY_MS });
    res.json({ success: true, resetToken });
  } catch (e) { safeError(res, e, 'verify-otp'); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) return res.status(400).json({ error: 'Email, reset token, and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const cleanKey = sanitize(email).toLowerCase().trim();
    const stored = otpStore.get(`reset_${cleanKey}`);
    if (!stored || stored.resetToken !== resetToken) return res.status(400).json({ error: 'Invalid reset session' });
    if (Date.now() > stored.expiresAt) { otpStore.delete(`reset_${cleanKey}`); return res.status(400).json({ error: 'Reset session expired' }); }

    const user = await awFind('users', [Query.equal('email', cleanKey)]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await awUpdate('users', user.id, { password_hash: hashedPassword });
    otpStore.delete(`reset_${cleanKey}`);
    console.log(`[RESET] Password reset for ${cleanKey} (${user.id})`);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (e) { safeError(res, e, 'reset-password'); }
});

// ── Subscription ─────────────────────────────────────────────────────
app.post('/api/subscribe', requireJwt, async (req, res) => {
  try {
    const { trxId } = req.body;
    if (!trxId?.trim()) return res.status(400).json({ error: 'Transaction ID is required' });

    const cleanTrxId = sanitize(trxId);
    const userId = req.userId;

    const user = await awGet('users', userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existingPay = await awFind('user_payments', [Query.equal('trx_id', cleanTrxId)]);
    if (existingPay) return res.status(409).json({ error: 'This Transaction ID has already been submitted' });

    await awCreate('user_payments', crypto.randomUUID(), {
      user_id: userId, trx_id: cleanTrxId, amount: 100, date: new Date().toISOString(),
      verified: false,
    });
    await awUpdate('users', userId, { last_active: new Date().toISOString() });

    res.json({ success: true, message: 'Payment submitted. Awaiting admin verification.' });
  } catch (e) { safeError(res, e, 'subscribe'); }
});

app.get('/api/subscription/status', requireJwt, async (req, res) => {
  try {
    const userId = req.userId;
    const now = Date.now();

    const user = await awGet('users', userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sub = await awFind('user_subscriptions', [Query.equal('user_id', userId)]) || {};
    const premium = sub.active || sub.lifetime_free;

    const usage = await awFind('daily_usage', [Query.equal('user_id', userId), Query.equal('date', getTodayStr())]);
    const dailyCount = usage?.count || 0;

    // Check cooldown — auto-clear if expired
    let cooldownUntil = user.cooldown_until ? new Date(user.cooldown_until).getTime() : null;
    if (cooldownUntil && cooldownUntil <= now) {
      await awUpdate('users', userId, { cooldown_until: null });
      cooldownUntil = null;
    }

    const inCooldown = cooldownUntil !== null;

    res.json({
      plan: sub.plan || 'free', active: premium, lifetimeFree: sub.lifetime_free || false,
      expiresAt: sub.expires_at ? new Date(sub.expires_at).getTime() : null,
      dailyRemaining: inCooldown ? 0 : (premium ? -1 : (10 - dailyCount)),
      dailyUsed: dailyCount, dailyLimit: premium ? -1 : 10,
      username: user.username || '', status: user.status || 'active',
      coolDownUntil: cooldownUntil,
      serverTime: now,
    });
  } catch (e) { safeError(res, e, 'subscription-status'); }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });

    // Admin 1: phone-based (+880000000000) via Appwrite
    const ADMIN_PHONE = '+880000000000';
    const cleanPhone = sanitize(phone);
    if (cleanPhone === ADMIN_PHONE) {
      const adminUser = await awFind('users', [Query.equal('phone', cleanPhone)]);
      if (!adminUser) return res.status(401).json({ error: 'Invalid credentials' });
      const valid = await bcrypt.compare(password, adminUser.password_hash || '');
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      const token = jwt.sign({ role: 'admin', uid: adminUser.id, phone: adminUser.phone }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ success: true, token, user: { id: adminUser.id, phone: adminUser.phone } });
    }

    // Admin 2: email-based (rahikulmakhtum147@gmail.com) hardcoded
    const ADMIN_EMAIL = 'rahikulmakhtum147@gmail.com';
    const ADMIN_HASH = '$2b$10$Fg5yYz0RId0yRNp.8L.Q6uCOM6jm2kjmr/VFJJju1l4MJs62jvhmS';
    if (phone === ADMIN_EMAIL) {
      const valid = await bcrypt.compare(password, ADMIN_HASH);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      const token = jwt.sign({ role: 'admin', uid: 'admin-email', phone: ADMIN_EMAIL }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ success: true, token, user: { id: 'admin-email', phone: ADMIN_EMAIL } });
    }

    return res.status(403).json({ error: 'Not authorized as admin' });
  } catch (e) { safeError(res, e, 'admin-login'); }
});

// ── Admin Endpoints ──────────────────────────────────────────────────
app.put('/api/admin/users/:phone/lifetime-free', requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const { grant } = req.body;
    const user = await awFind('users', [Query.equal('phone', sanitize(phone))]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await awUpsert('user_subscriptions', user.id, {
      user_id: user.id, plan: grant ? 'lifetime' : 'free',
      active: !!grant, lifetime_free: !!grant,
      expires_at: null, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: grant ? new Date().toISOString() : null,
    });
    await awUpdate('users', user.id, { last_active: new Date().toISOString() });

    if (grant) {
      const u = await awGet('users', user.id);
      if (u?.fcm_token) {
        await sendFcm(u.fcm_token, { title: '🌟 Lifetime Free Granted!', body: 'Congratulations! You now have lifetime free access.' }, { type: 'subscription_update' });
      }
    }
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'admin-lifetime-free'); }
});

app.put('/api/admin/users/:phone/ban', requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const { ban } = req.body;
    const user = await awFind('users', [Query.equal('phone', sanitize(phone))]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await awUpdate('users', user.id, { status: ban ? 'banned' : 'active', last_active: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'admin-ban'); }
});

app.put('/api/admin/users/:phone/cooldown', requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const { cooldownMinutes, remove, durationMs } = req.body;
    const user = await awFind('users', [Query.equal('phone', sanitize(phone))]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (remove || cooldownMinutes === null || cooldownMinutes <= 0) {
      await awUpdate('users', user.id, { cooldown_until: null });
      const todayUsage = await awFind('daily_usage', [Query.equal('user_id', user.id), Query.equal('date', getTodayStr())]);
      if (todayUsage) {
        await awUpdate('daily_usage', todayUsage.id, { count: 0 });
      } else {
        await awCreate('daily_usage', crypto.randomUUID(), { user_id: user.id, date: getTodayStr(), count: 0 });
      }
    } else {
      const minutes = durationMs ? Math.ceil(durationMs / 60000) : (cooldownMinutes || 60);
      const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await awUpdate('users', user.id, { cooldown_until: until });
    }
    res.json({ success: true, serverTime: Date.now() });
  } catch (e) { safeError(res, e, 'admin-cooldown'); }
});

app.get('/api/admin/payments', requireAdmin, async (req, res) => {
  try {
    const data = await awList('user_payments', [Query.orderDesc('date')]);
    const enriched = [];
    for (const p of data || []) {
      const u = p.user_id ? await awGet('users', p.user_id).catch(() => null) : null;
      enriched.push({ ...p, username: u?.username || '', device_name: u?.device_name || '' });
    }
    res.json({ payments: enriched });
  } catch (e) { safeError(res, e, 'admin-payments'); }
});

app.post('/api/admin/verify-payment', requireAdmin, async (req, res) => {
  try {
    const { trxId } = req.body;
    const cleanTrx = sanitize(trxId);

    const payment = await awFind('user_payments', [Query.equal('trx_id', cleanTrx)]);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const userId = payment.user_id;

    await awUpdate('user_payments', payment.id, {
      verified: true, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: new Date().toISOString(),
    });

    await awUpsert('user_subscriptions', userId, {
      user_id: userId, plan: 'lifetime', active: true, lifetime_free: true,
      expires_at: null, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: new Date().toISOString(),
    });

    await awUpdate('users', userId, { last_active: new Date().toISOString() });

    const user = await awGet('users', userId);
    if (user?.fcm_token) {
      await sendFcm(user.fcm_token, { title: '✅ Payment Verified!', body: 'Your subscription is now active. Thank you!' }, { type: 'payment_verified' });
    }

    res.json({ success: true });
  } catch (e) { safeError(res, e, 'admin-verify-payment'); }
});

// ── Reports ──────────────────────────────────────────────────────────
app.get('/api/reports', requireAdmin, async (req, res) => {
  try {
    const data = await awList('reports', [Query.orderDesc('timestamp'), Query.limit(100)]);
    res.json({ reports: data || [] });
  } catch (e) { safeError(res, e, 'reports-list'); }
});

app.post('/api/reports', async (req, res) => {
  try {
    await awCreate('reports', crypto.randomUUID(), {
      message: req.body.message, username: req.body.username || '',
      userId: req.body.userId || '', appVersion: req.body.appVersion || 'unknown',
      timestamp: new Date().toISOString(), status: 'unread',
    });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'reports-create'); }
});

app.put('/api/admin/reports/:id/read', requireAdmin, async (req, res) => {
  try {
    await awUpdate('reports', req.params.id, { status: 'read' });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'reports-mark-read'); }
});

app.delete('/api/admin/reports/:id', requireAdmin, async (req, res) => {
  try {
    await awDelete('reports', req.params.id);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'reports-delete'); }
});

// ── AI Analyze ───────────────────────────────────────────────────────
app.post('/api/ai-analyze', requireJwt, async (req, res) => {
  try {
    const { word } = req.body;
    if (!word) return res.status(400).json({ error: 'Word required' });

    const userId = req.userId;

    // Phase 1: Check daily usage
    const limit = await checkDailyUsage(userId);
    if (!limit.allowed) {
      return res.status(403).json({
        error: limit.reason === 'cool_down' ? 'cool_down' : 'Daily limit reached',
        remaining: 0,
        cool_down: limit.reason === 'cool_down',
        reason: limit.reason,
      });
    }

    // Phase 2: Call AI
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;

    let config = { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiGeminiModel: 'gemini-2.0-flash', aiEnabled: true };
    try {
      const d = await awGet('app_config', '1');
      if (d) config = { ...config, aiProvider: d.ai_provider, aiModel: d.ai_model, aiGeminiModel: d.ai_gemini_model, aiEnabled: d.ai_enabled };
    } catch {}

    if (!config.aiEnabled) return res.status(503).json({ error: 'AI features disabled' });

    const prompt = `Analyze the English word "${word}" and return ONLY valid JSON (no markdown, no code block). Format: { "word": "...", "type": "Noun|Verb|Adjective|Adverb|Preposition|Conjunction|Pronoun|Interjection", "definition": "a VERY SIMPLE, beginner-friendly definition (use everyday words, keep it short — imagine explaining to a child)", "phonetic": "/.../", "synonyms": "comma,separated", "antonyms": "comma,separated", "simpleSentence": "...", "complexSentence": "...", "compoundSentence": "...", "nounForm": "the noun form of this word (REQUIRED — if the word itself is a noun, return the word; otherwise provide the noun form; empty if no noun form exists like for 'the')", "verbForm": "the verb form (REQUIRED — if the word itself is a verb, return the word; otherwise provide the verb form; empty if none)", "adjectiveForm": "the adjective form (REQUIRED — if the word itself is an adjective, return the word; otherwise provide the adjective form; empty if none)", "adverbForm": "the adverb form (REQUIRED — if the word itself is an adverb, return the word; otherwise provide the adverb form; empty if none)", "banglaMeaning": "Bangla translation of the word (REQUIRED — always provide the meaning in Bangla/Bengali script, e.g. 'সুন্দর' for 'beautiful')", "ieltsBand": "estimated IELTS band score 6.0-9.0 (REQUIRED — always estimate the difficulty level of this word, e.g. 7.5)" }`;

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

    if (!aiResult) {
      // Don't increment daily usage — AI failed, so user shouldn't be charged
      return res.status(502).json({
        error: 'AI analysis failed. Please try again.',
        remaining: limit.remaining,
        isPremium: limit.isPremium || false,
      });
    }

    // Phase 3: Record search event
    const userDoc = await awGet('users', userId).catch(() => null);
    const uname = userDoc?.username || req.userPhone || 'unknown';
    const wordLower = word.toLowerCase();
    await awCreate('search_events', crypto.randomUUID(), { user_id: userId, username: uname, word: wordLower, timestamp: new Date().toISOString() }).catch(() => {});
    await awCreate('search_history', crypto.randomUUID(), { user_id: userId, username: uname, word: wordLower, timestamp: new Date().toISOString() }).catch(() => {});

    res.json({
      ...aiResult, _meta: { dailyRemaining: -1, isPremium: true },
    });
  } catch (e) { safeError(res, e, 'ai-analyze'); }
});

app.post('/api/ai/generate-quiz', async (req, res) => {
  try {
    const { count = 5, difficulty = 'medium' } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;

    let config = { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiGeminiModel: 'gemini-2.0-flash', aiEnabled: true };
    try {
      const d = await awGet('app_config', '1');
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

app.post('/api/generate', requireJwt, async (req, res) => {
  try {
    const { type, prompt: userPrompt } = req.body;
    const userId = req.userId;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    let config = { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiEnabled: true };
    try {
      const d = await awGet('app_config', '1');
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
app.post('/api/user/words/save', requireJwt, async (req, res) => {
  try {
    const userId = req.userId;
    const { word, type, definition, phonetic, synonyms, antonyms, simpleSentence, complexSentence, compoundSentence } = req.body;
    if (!word) return res.status(400).json({ error: 'Word required' });

    const lowerWord = (word || '').toLowerCase();
    const existingWord = await awFind('saved_words', [Query.equal('user_id', userId), Query.equal('word', lowerWord)]);
    const wordData = {
      user_id: userId, word: lowerWord, type: type || 'Noun',
      definition: definition || '', phonetic: phonetic || '',
      synonyms: synonyms || '', antonyms: antonyms || '',
      simple_sentence: simpleSentence || '', complex_sentence: complexSentence || '',
      compound_sentence: compoundSentence || '',
      timestamp: new Date().toISOString(),
    };
    if (existingWord) {
      await awUpdate('saved_words', existingWord.id, wordData);
    } else {
      await awCreate('saved_words', crypto.randomUUID(), wordData);
    }
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'user-words-save'); }
});

app.delete('/api/user/words/:word', requireJwt, async (req, res) => {
  try {
    const wordDoc = await awFind('saved_words', [Query.equal('user_id', req.userId), Query.equal('word', req.params.word.toLowerCase())]);
    if (wordDoc) await awDelete('saved_words', wordDoc.id);
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'user-words-delete'); }
});

app.get('/api/user/words', requireJwt, async (req, res) => {
  try {
    const data = await awList('saved_words', [Query.equal('user_id', req.userId), Query.orderDesc('timestamp'), Query.limit(200)]);
    res.json({ words: data || [] });
  } catch (e) { safeError(res, e, 'user-words-list'); }
});

app.get('/api/user/daily-usage', requireJwt, async (req, res) => {
  try {
    const user = await awGet('users', req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sub = await awFind('user_subscriptions', [Query.equal('user_id', req.userId)]) || {};
    const premium = sub.active || sub.lifetime_free;
    const usage = await awFind('daily_usage', [Query.equal('user_id', req.userId), Query.equal('date', getTodayStr())]);
    const dailyCount = usage?.count || 0;

    // Check cooldown — auto-clear if expired
    let cooldownUntil = user.cooldown_until ? new Date(user.cooldown_until).getTime() : null;
    if (cooldownUntil && cooldownUntil <= Date.now()) {
      await awUpdate('users', req.userId, { cooldown_until: null });
      cooldownUntil = null;
    }

    const inCooldown = cooldownUntil !== null;
    res.json({
      dailyRemaining: inCooldown ? 0 : (premium ? -1 : (10 - dailyCount)),
      dailyUsed: dailyCount, dailyLimit: premium ? -1 : 10,
      isPremium: premium, plan: sub.plan || 'free',
      coolDownUntil: cooldownUntil,
      serverTime: Date.now(),
    });
  } catch (e) { safeError(res, e, 'user-daily-usage'); }
});

// ── Quiz Pool ────────────────────────────────────────────────────────
app.post('/api/quiz-pool/publish', requireAdmin, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'Questions array required' });

    // Delete existing pool
    const allPool = await awList('quiz_pool');
    for (const q of allPool) await awDelete('quiz_pool', q.id);
    const now = new Date().toISOString();
    let created = 0;
    for (const q of questions) {
      try {
        await awCreate('quiz_pool', crypto.randomUUID(), {
          word: q.word || '', question: q.question || '', options: JSON.stringify(q.options || []),
          correct_index: q.correctIndex ?? 0, hint: q.hint || '', difficulty: q.difficulty || 'medium',
          created_at: now,
        });
        created++;
      } catch (e) {
        console.error('[quiz-pool-publish] Failed to create question:', e?.message || e);
      }
    }
    res.json({ success: true, count: created });
  } catch (e) { safeError(res, e, 'quiz-pool-publish'); }
});

app.get('/api/quiz-pool', async (req, res) => {
  try {
    const data = await awList('quiz_pool', [Query.orderDesc('created_at'), Query.limit(10)]);
    const questions = (data || []).map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []),
    }));
    res.json({ questions });
  } catch (e) { safeError(res, e, 'quiz-pool'); }
});

app.get('/api/quiz-pool/status', async (req, res) => {
  try {
    const data = await awList('quiz_pool', [Query.orderDesc('created_at'), Query.limit(40)]);
    const pool = data || [];
    res.json({ hasQuiz: pool.length > 0, count: pool.length, generatedAt: pool[0]?.created_at || null, generatedWords: [...new Set(pool.map(q => q.word).filter(Boolean))] });
  } catch (e) { safeError(res, e, 'quiz-pool-status'); }
});

// ── AI Notification Agent Config ─────────────────────────────────────
app.get('/api/ai-notification-agent', requireAdmin, async (req, res) => {
  try {
    const data = await awGet('ai_notification_agent', '1');
    res.json(data || {});
  } catch { res.json({}); }
});

app.post('/api/ai-notification-agent', requireAdmin, async (req, res) => {
  try {
    await awUpsert('ai_notification_agent', '1', {
      prompt: req.body.prompt, enabled: req.body.enabled, interval_minutes: req.body.intervalMinutes,
      time_of_day: req.body.timeOfDay, updated_at: new Date().toISOString(),
      last_sent_at: req.body.lastSentAt, next_send_at: req.body.nextSendAt,
    });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'ai-notification-agent-post'); }
});

// ── AI Notification Scheduler (called by cron) ───────────────────────
app.post('/api/ai-notification-tick', async (req, res) => {
  try {
    const agent = await awGet('ai_notification_agent', '1');
    if (!agent || !agent.enabled) return res.json({ skipped: true, reason: 'disabled' });

    const now = Date.now();
    const nextSend = agent.next_send_at ? new Date(agent.next_send_at).getTime() : 0;
    if (nextSend > now) return res.json({ skipped: true, reason: 'not yet' });

    const users = await awList('users', [Query.equal('status', 'active'), Query.limit(5000)]);
    const tokens = users.map(u => u.fcm_token).filter(Boolean);
    if (!tokens.length) return res.json({ skipped: true, reason: 'no users' });

    const recentSearches = await awList('search_events', [Query.greaterThan('timestamp', new Date(now - 3600000).toISOString())]);
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
    await awCreate('global_notifications', notifId, {
      title: 'AI Notification', message,
      target: 'ai_automation', sent_at: new Date(now).toISOString(),
      success: true, sent_count: tokens.length, delivered_count: result.successCount,
      ai_generated: true, ai_prompt: agent.prompt,
    });

    const interval = (agent.interval_minutes || 60) * 60 * 1000;
    await awUpdate('ai_notification_agent', '1', {
      last_sent_at: new Date(now).toISOString(),
      next_send_at: new Date(now + interval).toISOString(),
    });

    res.json({ success: true, sent: result.successCount, failed: result.failureCount });
  } catch (e) { safeError(res, e, 'ai-notification-tick'); }
});

// ── iOS Waitlist ─────────────────────────────────────────────────────
app.get('/api/waitlist/count', async (req, res) => {
  try {
    const count = await awCount('waitlist_ios');
    res.json({ count });
  } catch (e) { safeError(res, e, 'waitlist-count'); }
});

app.post('/api/waitlist/join', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const existing = await awFind('waitlist_ios', [Query.equal('email', email.toLowerCase())]);
    if (existing) return res.status(409).json({ error: 'Already on waitlist' });

    await awCreate('waitlist_ios', crypto.randomUUID(), { email: email.toLowerCase(), created_at: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'waitlist-join'); }
});

// ── Android App Notifications (per-user) ─────────────────────────────
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await awList('user_notifications', [Query.equal('user_id', userId), Query.orderDesc('created_at'), Query.limit(20)]);
    res.json({ notifications: data || [] });
  } catch (e) { safeError(res, e, 'notifications-user'); }
});

app.put('/api/notifications/:userId/read/:notificationId', async (req, res) => {
  try {
    await awUpdate('user_notifications', req.params.notificationId, { is_read: true });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'notifications-mark-read'); }
});

// ── Install Analytics ────────────────────────────────────────────────
app.get('/api/installs/stats', requireAdmin, async (req, res) => {
  try {
    const total = await awCount('installs');
    const usersData = await awList('users', [Query.limit(50000)]);
    const active = (usersData || []).filter(u => u.status === 'active').length;
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
app.get('/api/admin/notifications', requireAdmin, (req, res) => {
  fetch(`${apiHost}/api/notifications`).then(r => r.json()).then(d => res.json(d)).catch(e => res.json({ notifications: [] }));
});
app.post('/api/admin/send-notification', requireAdmin, (req, res) => proxy(req, res, `${apiHost}/api/notifications/send`));
app.get('/api/admin/leaderboard', requireAdmin, (req, res) => {
  fetch(`${apiHost}/api/leaderboard/admin`).then(r => r.json()).then(d => res.json(d)).catch(e => res.json({ leaderboard: [] }));
});
app.put('/api/reports/:id/status', requireAdmin, async (req, res) => {
  try { await awUpdate('reports', req.params.id, { status: 'read' }); res.json({ success: true }); } catch (e) { safeError(res, e, 'reports-status'); }
});
app.delete('/api/reports/:id', requireAdmin, async (req, res) => {
  try { await awDelete('reports', req.params.id); res.json({ success: true }); } catch (e) { safeError(res, e, 'reports-delete'); }
});
app.put('/api/admin/payments/:trxId/verify', requireAdmin, async (req, res) => {
  try {
    const trxId = req.params.trxId;
    const payment = await awFind('user_payments', [Query.equal('trx_id', sanitize(trxId))]);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const userId = payment.user_id;
    const paymentDoc = await awFind('user_payments', [Query.equal('trx_id', sanitize(trxId))]);
    if (paymentDoc) await awUpdate('user_payments', paymentDoc.id, { verified: true, verified_by: req.headers['x-admin-id'] || 'admin', verified_at: new Date().toISOString() });
    await awUpsert('user_subscriptions', userId, { user_id: userId, plan: 'lifetime', active: true, lifetime_free: true, expires_at: null, verified_by: req.headers['x-admin-id'] || 'admin', verified_at: new Date().toISOString() });
    await awUpdate('users', userId, { last_active: new Date().toISOString() });
    const user = await awGet('users', userId);
    if (user?.fcm_token) await sendFcm(user.fcm_token, { title: '✅ Payment Verified!', body: 'Your subscription is now active. Thank you!' }, { type: 'payment_verified' });
    res.json({ success: true });
  } catch (e) { safeError(res, e, 'payment-verify'); }
});
app.get('/api/users/stats', requireAdmin, async (req, res) => {
  try {
    const [total, active, statusData, newToday, newWeek, newMonth, countsByVersion] = await Promise.all([
      awCount('users'),
      awCount('users', [Query.equal('status', 'active'), Query.greaterThan('last_active', new Date(getDaysAgo(1)).toISOString())]),
      (async () => { const a = await awCount('users', [Query.equal('status', 'active')]); const i = await awCount('users', [Query.equal('status', 'inactive')]); return { active: a, inactive: i }; })(),
      awCount('users', [Query.equal('status', 'active'), Query.greaterThan('created_at', new Date(getDayStart()).toISOString())]),
      awCount('users', [Query.equal('status', 'active'), Query.greaterThan('created_at', new Date(getDaysAgo(7)).toISOString())]),
      awCount('users', [Query.equal('status', 'active'), Query.greaterThan('created_at', new Date(getDaysAgo(30)).toISOString())]),
      (async () => { try { const d = await awList('users', [Query.limit(50000)]); const c = {}; for (const u of d || []) { const v = u.app_version || 'unknown'; c[v] = (c[v] || 0) + 1; } return c; } catch { return {}; } })(),
    ]);
    res.json({ total, active, statusBreakpoint: statusData, newToday, thisWeek: newWeek, thisMonth: newMonth, byVersion: countsByVersion });
  } catch (e) { safeError(res, e, 'users-stats'); }
});
app.get('/api/ai/notification-agent-config', requireAdmin, (req, res) => {
  fetch(`${apiHost}/api/ai-notification-agent`).then(r => r.json()).then(d => res.json(d)).catch(e => res.json({}));
});
app.post('/api/ai/notification-agent-config', requireAdmin, (req, res) => proxy(req, res, `${apiHost}/api/ai-notification-agent`));

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
