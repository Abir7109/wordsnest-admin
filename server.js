import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'wordsnest_jwt_secret_change_in_production_2026';

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

// ── Supabase Init ────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cpjeqobzdmxmjmmbunim.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
let supabase = null;
let supabaseReady = false;

async function initSupabase() {
  try {
    const key = SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!key) { console.warn('Supabase key not found'); return; }
    supabase = createClient(SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    supabaseReady = true;
    console.log('Supabase initialized');
  } catch (e) {
    console.warn('Supabase init failed:', e.message);
  }
}

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

setTimeout(() => initSupabase(), 100);

function requireSupabase(req, res, next) {
  if (!supabaseReady) return res.status(503).json({ error: 'Supabase not initialized' });
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
    // Async check user exists
    if (supabase) {
      supabase.from('users').select('id').eq('id', decoded.uid).single().then(({ data }) => {
        if (!data) return res.status(401).json({ error: 'User no longer exists', code: 'user_deleted' });
        next();
      }).catch(() => next());
    } else { next(); }
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
function sb() { return supabase; }

async function getUserDoc(id) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('users').select('*').eq('id', id).single();
    return data || null;
  } catch { return null; }
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

const SB_URL = SUPABASE_URL;
const SB_KEY = SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Direct REST API helpers (bypasses supabase-js client overhead)
async function restCount(table, filters = '') {
  if (!SB_KEY) return 0;
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/${table}?select=id&limit=0${filters}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' },
    });
    return parseInt(resp.headers.get('content-range')?.split('/')[1] || '0', 10);
  } catch { return 0; }
}

async function restSelect(table, selectCols = '*', suffix = '') {
  if (!SB_KEY) return [];
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/${table}?select=${selectCols}${suffix}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    return await resp.json();
  } catch { return []; }
}

async function safeCount(table) {
  return restCount(table);
}

async function safeFilterCount(table, column, value, tsColumn, since) {
  return restCount(table, `&${column}=eq.${value}&${tsColumn}=gte.${new Date(since).toISOString()}`);
}

async function checkAndUpdateDailyUsage(userId) {
  const today = getTodayStr();
  const { data: user } = await supabase.from('users').select('*, user_subscriptions(*)').eq('id', userId).single();
  if (!user) return { allowed: false, remaining: 0, reason: 'User not found' };

  const sub = user.user_subscriptions;
  if (sub && (sub.active || sub.lifetime_free)) return { allowed: true, remaining: -1, isPremium: true };

  if (user.cooldown_until && new Date(user.cooldown_until).getTime() > Date.now()) {
    return { allowed: false, remaining: 0, reason: 'cool_down' };
  }

  const { data: usage } = await supabase.from('daily_usage')
    .select('count').eq('user_id', userId).eq('date', today).single();
  const count = usage?.count || 0;

  if (count >= 10) {
    const cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('users').update({ cooldown_until: cooldownUntil }).eq('id', userId);
    return { allowed: false, remaining: 0, reason: 'limit_reached' };
  }

  await supabase.from('daily_usage').upsert(
    { user_id: userId, date: today, count: count + 1 },
    { onConflict: 'user_id,date' }
  );
  await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', userId);

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
app.get('/api/health', (req, res) => res.json({ status: 'ok', supabase: supabaseReady }));
app.get('/api/ping-keep-alive', (req, res) => res.json({ pong: Date.now() }));

// ── Dashboard ────────────────────────────────────────────────────────
const dashCache = { data: null, ts: 0, TTL: 120000 };

app.get('/api/dashboard', requireSupabase, async (req, res) => {
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
      restCount('users', `&last_active=gte.${dayAgo}`),
      restCount('users', `&created_at=gte.${todayStart}`),
      restCount('search_events', `&timestamp=gte.${todayStart}`),
      restCount('users', `&created_at=lte.${weekAgoIso}`),
      restCount('users', `&last_active=gte.${yesterdayIso}&created_at=lte.${weekAgoIso}`),
      restCount('saved_words'),
      restCount('quiz_attempts'),
    ]);

    const [users, searches, installs, activeUsers, newUsersToday, searchesToday, usersBeforeWeek, retained, words, quizzes] = results;

    const engagementRate = users > 0 ? Math.round((activeUsers / users) * 100) : 0;
    const retentionRate = usersBeforeWeek > 0 ? Math.round((retained / usersBeforeWeek) * 100) : 0;

    const payload = {
      users, activeUsers, searches, words, quizzes,
      newUsersToday, dailyActiveUsers: activeUsers,
      totalInstalls: installs, searchesToday,
      wordsToday: 0, quizzesToday: 0,
      averageQuizScore: 0, uniqueWordsSaved: 0, topWordType: 'N/A',
      engagementRate, retentionRate,
    };

    dashCache.data = payload;
    dashCache.ts = Date.now();
    res.json(payload);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/timeline', requireSupabase, async (req, res) => {
  try {
    const sinceTs = new Date(getDaysAgo(6)).toISOString();
    const days = 7;

    const [usersAll, searchesAll, activeUsers] = await Promise.all([
      restSelect('users', 'created_at', `&created_at=gte.${sinceTs}`),
      restSelect('search_events', 'timestamp', `&timestamp=gte.${sinceTs}`),
      restSelect('users', 'last_active', `&last_active=gte.${sinceTs}`),
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

app.get('/api/dashboard/top-words', requireSupabase, async (req, res) => res.json({ topWords: [] }));
app.get('/api/dashboard/top-searches', requireSupabase, async (req, res) => res.json({ topSearches: [] }));
app.get('/api/dashboard/word-types', requireSupabase, async (req, res) => res.json({ distribution: [] }));

app.get('/api/dashboard/recent-activity', requireSupabase, async (req, res) => {
  try {
    const users = await restSelect('users', 'id,username,created_at', '&order=created_at.desc&limit=5');
    const activities = (users || []).map(u => ({
      type: 'user_signup', userId: u.id,
      username: u.username || 'Unknown',
      timestamp: new Date(u.created_at).getTime(),
    }));
    res.json({ activities });
  } catch { res.json({ activities: [] }); }
});

// ── Users ────────────────────────────────────────────────────────────
app.get('/api/users', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('users').select('*').order('last_active', { ascending: false }).limit(100);
    const users = (data || []).map(u => ({ uid: u.id, ...u, lastActive: new Date(u.last_active).getTime() }));
    res.json({ users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/:uid', requireSupabase, async (req, res) => {
  try {
    const { uid } = req.params;
    const { data: user } = await supabase.from('users').select('*').eq('id', uid).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [wordsData, quizzesData, searchData] = await Promise.all([
      supabase.from('saved_words').select('*').eq('user_id', uid).order('timestamp', { ascending: false }).limit(100),
      supabase.from('quiz_attempts').select('*').eq('user_id', uid).order('timestamp', { ascending: false }).limit(50),
      supabase.from('search_history').select('*').eq('user_id', uid).order('timestamp', { ascending: false }).limit(50),
    ]);

    res.json({
      profile: { uid, ...user, lastActive: new Date(user.last_active).getTime(), createdAt: new Date(user.created_at).getTime() },
      words: (wordsData.data || []).map(w => ({ id: w.id, ...w })),
      quizzes: (quizzesData.data || []).map(q => ({ id: q.id, ...q })),
      searchHistory: (searchData.data || []).map(s => ({ id: s.id, ...s })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:identifier', requireSupabase, async (req, res) => {
  try {
    const { identifier } = req.params;
    const { data: user } = await supabase.from('users').select('id, fcm_token').eq('id', identifier).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Send force_logout FCM
    if (user.fcm_token) {
      await sendFcm(user.fcm_token, { title: 'Account Deleted', body: 'Your account has been permanently deleted.' }, { type: 'force_logout' });
    }

    // Delete from auth then cascade deletes everything
    const { error: authErr } = await supabase.auth.admin.deleteUser(identifier);
    if (authErr) console.warn('Auth delete warning:', authErr.message);

    res.json({ success: true, message: 'User permanently deleted.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/stats/aggregate', requireSupabase, async (req, res) => {
  try {
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const monthAgo = new Date(getDaysAgo(30)).toISOString();

    const [total, active, withStatus, newToday, newWeek, newMonth, countsByVersion] = await Promise.all([
      safeCount('users'),
      safeFilterCount('users', 'status', 'active', 'last_active', getDaysAgo(1)),
      (async () => {
        const { count: activeC } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active');
        const { count: inactiveC } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'inactive');
        return { active: activeC || 0, inactive: inactiveC || 0 };
      })(),
      safeFilterCount('users', 'status', 'active', 'created_at', getDayStart()),
      safeFilterCount('users', 'status', 'active', 'created_at', getDaysAgo(7)),
      safeFilterCount('users', 'status', 'active', 'created_at', getDaysAgo(30)),
      (async () => {
        try {
          const { data } = await supabase.from('users').select('app_version');
          const counts = {};
          for (const u of data || []) {
            const v = u.app_version || 'unknown';
            counts[v] = (counts[v] || 0) + 1;
          }
          return counts;
        } catch { return {}; }
      })(),
    ]);

    res.json({ total, active, statusBreakdown: withStatus, newUsersToday: newToday, newUsersThisWeek: newWeek, newUsersThisMonth: newMonth, byAppVersion: countsByVersion });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Saved Words ──────────────────────────────────────────────────────
app.get('/api/words', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('saved_words').select('*').order('timestamp', { ascending: false }).limit(200);
    res.json({ words: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/words/delete/:id', requireSupabase, async (req, res) => {
  try {
    const { error } = await supabase.from('saved_words').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/words/stats', requireSupabase, async (req, res) => {
  try {
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    const total = await safeCount('saved_words');
    let todayC = 0, weekC = 0, typeDist = {}, topWords = [];
    try {
      const { count } = await supabase.from('saved_words').select('*', { count: 'exact', head: true }).gte('timestamp', todayStart);
      todayC = count || 0;
    } catch {}
    try {
      const { count } = await supabase.from('saved_words').select('*', { count: 'exact', head: true }).gte('timestamp', weekAgo);
      weekC = count || 0;
    } catch {}
    try {
      const { data } = await supabase.from('saved_words').select('type').limit(2000);
      for (const w of data || []) { if (w.type) typeDist[w.type] = (typeDist[w.type] || 0) + 1; }
    } catch {}
    try {
      const { data } = await supabase.from('saved_words').select('word, type').limit(2000);
      const freq = {};
      for (const w of data || []) { const wl = w.word?.toLowerCase(); if (wl) { freq[wl] = (freq[wl] || 0) + 1; } }
      topWords = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    } catch {}
    res.json({ total, today: todayC, thisWeek: weekC, typeDistribution: typeDist, topWords });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Searches ─────────────────────────────────────────────────────────
app.get('/api/searches', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('search_events').select('*').order('timestamp', { ascending: false }).limit(200);
    res.json({ searches: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/searches/delete/:id', requireSupabase, async (req, res) => {
  try {
    await supabase.from('search_events').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/searches/stats', requireSupabase, async (req, res) => {
  try {
    const total = await safeCount('search_events');
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    let todayC = 0, weekC = 0, topWords = [];
    try { const { count } = await supabase.from('search_events').select('*', { count: 'exact', head: true }).gte('timestamp', todayStart); todayC = count || 0; } catch {}
    try { const { count } = await supabase.from('search_events').select('*', { count: 'exact', head: true }).gte('timestamp', weekAgo); weekC = count || 0; } catch {}
    try {
      const { data } = await supabase.from('search_events').select('word').gte('timestamp', weekAgo);
      const freq = {};
      for (const s of data || []) { const w = s.word?.toLowerCase(); if (w) freq[w] = (freq[w] || 0) + 1; }
      topWords = Object.entries(freq).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    } catch {}
    res.json({ total, today: todayC, thisWeek: weekC, topWords });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Quizzes ──────────────────────────────────────────────────────────
app.get('/api/quizzes', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('quiz_attempts').select('*, users!inner(username, email)').order('timestamp', { ascending: false }).limit(200);
    res.json({ quizzes: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/quizzes/delete/:id', requireSupabase, async (req, res) => {
  try {
    await supabase.from('quiz_attempts').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/quizzes/stats', requireSupabase, async (req, res) => {
  try {
    const total = await safeCount('quiz_attempts');
    const todayStart = new Date(getDayStart()).toISOString();
    const weekAgo = new Date(getDaysAgo(7)).toISOString();
    let todayC = 0, weekC = 0, scores = [];
    try { const { count } = await supabase.from('quiz_attempts').select('*', { count: 'exact', head: true }).gte('timestamp', todayStart); todayC = count || 0; } catch {}
    try { const { count } = await supabase.from('quiz_attempts').select('*', { count: 'exact', head: true }).gte('timestamp', weekAgo); weekC = count || 0; } catch {}
    try {
      const { data } = await supabase.from('quiz_attempts').select('score').limit(1000);
      scores = (data || []).map(q => q.score).filter(s => s !== null && s !== undefined);
    } catch {}
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    res.json({ total, today: todayC, thisWeek: weekC, averageScore: avg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Leaderboard ──────────────────────────────────────────────────────
app.get('/api/leaderboard', requireSupabase, async (req, res) => {
  try {
    const { data: users } = await supabase.from('users')
      .select('id, username, emoji, leaderboard_streak, leaderboard_manual_score')
      .limit(5000);
    const { data: searches } = await supabase.from('search_events').select('user_id').limit(50000);
    const { data: words } = await supabase.from('saved_words').select('user_id').limit(50000);
    const { data: quizzes } = await supabase.from('quiz_attempts').select('user_id, score').limit(50000);

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
        userId: u.id, name: u.username, emoji: u.emoji || '🌱',
        score, words: wordCounts[u.id] || 0, quiz: quizScores[u.id] || 0,
        streak: u.leaderboard_streak || 0,
        searches: s, isAdmin: false,
      };
    }).sort((a, b) => b.score - a.score).slice(0, 100);

    const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));
    res.json({ leaderboard: ranked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin leaderboard (same, different route)
app.get('/api/leaderboard/admin', requireSupabase, async (req, res) => {
  try {
    const resp = await fetch(`${req.protocol}://${req.get('host')}/api/leaderboard`);
    const data = await resp.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leaderboard/update', requireSupabase, async (req, res) => {
  try {
    const { userId, manualScore, streak } = req.body;
    const updates = {};
    if (manualScore !== undefined) updates.leaderboard_manual_score = manualScore;
    if (streak !== undefined) updates.leaderboard_streak = streak;
    await supabase.from('users').update(updates).eq('id', userId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── App Config ───────────────────────────────────────────────────────
app.get('/api/app-config', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('app_config').select('*').eq('id', 1).single();
    res.json(data || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/app-config', requireSupabase, async (req, res) => {
  try {
    await supabase.from('app_config').update(req.body).eq('id', 1);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notifications ────────────────────────────────────────────────────
app.post('/api/notifications/send', requireSupabase, async (req, res) => {
  try {
    const { title, message, targetUserId } = req.body;
    if (targetUserId) {
      const { data: user } = await supabase.from('users').select('fcm_token').eq('id', targetUserId).single();
      if (!user?.fcm_token) return res.status(400).json({ error: 'User has no FCM token' });
      await sendFcm(user.fcm_token, { title, body: message }, { type: 'admin_notification' });
      await supabase.from('global_notifications').insert({ title, message, sentAt: new Date().toISOString(), success: true, sentCount: 1, deliveredCount: 1 });
    } else {
      const { data: users } = await supabase.from('users').select('fcm_token').eq('status', 'active').not('fcm_token', 'is', null);
      const tokens = (users || []).map(u => u.fcm_token).filter(Boolean);
      const result = await sendFcmMulticast(tokens, { title, body: message }, { type: 'admin_notification' });
      await supabase.from('global_notifications').insert({
        title, message, sentAt: new Date().toISOString(), success: true,
        sentCount: tokens.length, deliveredCount: result.successCount,
      });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notifications', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('global_notifications').select('*').order('sent_at', { ascending: false }).limit(50);
    res.json({ notifications: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Experiences ──────────────────────────────────────────────────────
app.get('/api/experiences', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('experiences').select('*').order('timestamp', { ascending: false }).limit(50);
    res.json({ experiences: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/experiences', requireSupabase, async (req, res) => {
  try {
    await supabase.from('experiences').insert({ ...req.body, timestamp: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/experiences/:id', requireSupabase, async (req, res) => {
  try {
    await supabase.from('experiences').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── FCM Token Registration ──────────────────────────────────────────
app.post('/api/register-fcm', requireSupabase, async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    await supabase.from('users').update({ fcm_token: fcmToken }).eq('id', userId);
    await supabase.from('installs').update({ fcm_token: fcmToken }).eq('user_id', userId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Auth ─────────────────────────────────────────────────────────────
app.post('/api/auth/exchange-token', requireSupabase, async (req, res) => {
  try {
    const { supabaseToken } = req.body;
    if (!supabaseToken) return res.status(400).json({ error: 'Supabase token required' });

    // Verify the Supabase auth token
    const { data: { user }, error: authErr } = await supabase.auth.getUser(supabaseToken);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const uid = user.id;
    const email = user.email || '';
    const phone = user.phone || uid;

    // Upsert user profile
    const existing = await getUserDoc(uid);
    if (!existing) {
      const now = new Date().toISOString();
      await supabase.from('users').upsert({
        id: uid, email, phone, username: email.split('@')[0] || uid,
        status: 'active', created_at: now, last_active: now,
      });
    } else {
      await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', uid);
    }
    // Ensure subscription record exists
    await supabase.from('user_subscriptions').upsert(
      { user_id: uid, plan: 'free', active: false, lifetime_free: false },
      { onConflict: 'user_id' }
    );

    const token = createToken(phone, uid);
    const username = existing?.username || email.split('@')[0] || uid;
    res.json({ success: true, token, uid, email, phone, username, isNewUser: !existing });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Phone + password registration (legacy)
app.post('/api/auth/register', requireSupabase, async (req, res) => {
  try {
    const { phone, username, password, deviceName } = req.body;
    if (!phone || !username || !password) return res.status(400).json({ error: 'Phone, username, and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const cleanPhone = sanitize(phone);
    const cleanUsername = sanitize(username);

    // Check if phone already exists
    const existing = await supabase.from('users').select('id').eq('phone', cleanPhone).maybeSingle();
    if (existing.data) {
      // Update existing
      const hashedPassword = await bcrypt.hash(password, 10);
      await supabase.from('users').update({
        username: cleanUsername, password_hash: hashedPassword,
        device_name: sanitize(deviceName || ''), last_active: new Date().toISOString(),
      }).eq('id', existing.data.id);

      const token = createToken(cleanPhone, existing.data.id);
      return res.json({ success: true, phone: cleanPhone, username: cleanUsername, token });
    }

    // Create new user in auth
    const { data: authUser, error: createErr } = await supabase.auth.admin.createUser({
      phone: cleanPhone, email: `${cleanPhone.replace('+', '')}@wordsnest.app`,
      password: password, email_confirm: true, phone_confirm: true,
      user_metadata: { username: cleanUsername },
    });
    if (createErr) return res.status(500).json({ error: createErr.message });

    const uid = authUser.user.id;
    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Users table row is auto-created by the trigger, but we also store the password hash for legacy API compatibility
    await supabase.from('users').update({
      phone: cleanPhone, username: cleanUsername, password_hash: hashedPassword,
      device_name: sanitize(deviceName || ''), status: 'active',
      created_at: now, last_active: now, app_version: req.body.appVersion || '2.0.0',
    }).eq('id', uid);

    await supabase.from('user_subscriptions').upsert(
      { user_id: uid, plan: 'free', active: false, lifetime_free: false },
      { onConflict: 'user_id' }
    );

    const token = createToken(cleanPhone, uid);
    console.log(`[REGISTER] Created user ${uid} (${cleanPhone})`);
    res.json({ success: true, phone: cleanPhone, username: cleanUsername, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy phone sign-in
app.post('/api/auth/phone-signin', requireSupabase, async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });

    const cleanPhone = sanitize(phone);
    const { data: user } = await supabase.from('users').select('id, password_hash, username').eq('phone', cleanPhone).single();
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash || '');
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', user.id);
    const token = createToken(cleanPhone, user.id);
    res.json({ success: true, token, username: user.username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Google/email sign-in
app.post('/api/auth/exchange-token-legacy', requireSupabase, async (req, res) => {
  try {
    const { firebaseToken } = req.body;
    if (!firebaseToken) return res.status(400).json({ error: 'Token required' });

    // Decode the Firebase token locally (it's a JWT)
    const decoded = jwt.decode(firebaseToken);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });

    const uid = decoded.user_id || decoded.sub;
    const email = decoded.email || '';
    const phone = decoded.phone_number || uid;

    const existing = await getUserDoc(uid);
    if (!existing) {
      const now = new Date().toISOString();
      await supabase.from('users').upsert({
        id: uid, email, phone, username: email.split('@')[0] || uid,
        status: 'active', created_at: now, last_active: now,
      });
      await supabase.from('user_subscriptions').upsert(
        { user_id: uid, plan: 'free', active: false, lifetime_free: false },
        { onConflict: 'user_id' }
      );
    } else {
      await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', uid);
    }

    const token = createToken(phone, uid);
    const username = existing?.username || email.split('@')[0] || uid;
    res.json({ success: true, token, uid, email, phone, username, isNewUser: !existing });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Diagnostic ───────────────────────────────────────────────────────
app.get('/api/debug/user/:phone', requireSupabase, async (req, res) => {
  try {
    const cleanPhone = sanitize(req.params.phone);
    const { data } = await supabase.from('users').select('*').eq('phone', cleanPhone).single();
    res.json({ exists: !!data, data, queriedKey: cleanPhone });
  } catch { res.json({ exists: false, data: null }); }
});

// ── Subscription ─────────────────────────────────────────────────────
app.post('/api/subscribe', requireSupabase, requireJwt, async (req, res) => {
  try {
    const { trxId } = req.body;
    if (!trxId?.trim()) return res.status(400).json({ error: 'Transaction ID is required' });

    const cleanTrxId = sanitize(trxId);
    const userId = req.userId;

    const { data: user } = await supabase.from('users').select('id').eq('id', userId).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check duplicate trx
    const { data: existingPay } = await supabase.from('user_payments').select('id').eq('trx_id', cleanTrxId).maybeSingle();
    if (existingPay) return res.status(409).json({ error: 'This Transaction ID has already been submitted' });

    await supabase.from('user_payments').insert({
      user_id: userId, trx_id: cleanTrxId, amount: 100, date: new Date().toISOString(),
      verified: false,
    });
    await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', userId);

    res.json({ success: true, message: 'Payment submitted. Awaiting admin verification.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/subscription/status', requireSupabase, requireJwt, async (req, res) => {
  try {
    const userId = req.userId;
    const { data: user } = await supabase.from('users').select('*, user_subscriptions(*)').eq('id', userId).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sub = user.user_subscriptions || {};
    const premium = sub.active || sub.lifetime_free;

    const { data: usage } = await supabase.from('daily_usage')
      .select('count').eq('user_id', userId).eq('date', getTodayStr()).maybeSingle();
    const dailyCount = usage?.count || 0;
    const inCooldown = user.cooldown_until && new Date(user.cooldown_until).getTime() > Date.now();

    res.json({
      plan: sub.plan || 'free', active: premium, lifetimeFree: sub.lifetime_free || false,
      expiresAt: sub.expires_at ? new Date(sub.expires_at).getTime() : null,
      dailyRemaining: inCooldown ? 0 : (premium ? -1 : (10 - dailyCount)),
      dailyUsed: dailyCount, dailyLimit: premium ? -1 : 10,
      username: user.username || '', status: user.status || 'active',
      coolDownUntil: user.cooldown_until ? new Date(user.cooldown_until).getTime() : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin Endpoints ──────────────────────────────────────────────────
app.put('/api/admin/users/:phone/lifetime-free', requireSupabase, async (req, res) => {
  try {
    const { phone } = req.params;
    const { grant } = req.body;
    const { data: user } = await supabase.from('users').select('id').eq('phone', sanitize(phone)).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    await supabase.from('user_subscriptions').upsert({
      user_id: user.id, plan: grant ? 'lifetime' : 'free',
      active: !!grant, lifetime_free: !!grant,
      expires_at: null, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: grant ? new Date().toISOString() : null,
    }, { onConflict: 'user_id' });
    await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', user.id);

    if (grant) {
      const { data: u } = await supabase.from('users').select('fcm_token').eq('id', user.id).single();
      if (u?.fcm_token) {
        await sendFcm(u.fcm_token, { title: '🌟 Lifetime Free Granted!', body: 'Congratulations! You now have lifetime free access.' }, { type: 'subscription_update' });
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:phone/ban', requireSupabase, async (req, res) => {
  try {
    const { phone } = req.params;
    const { ban } = req.body;
    const { data: user } = await supabase.from('users').select('id').eq('phone', sanitize(phone)).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    await supabase.from('users').update({ status: ban ? 'banned' : 'active', last_active: new Date().toISOString() }).eq('id', user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:phone/cooldown', requireSupabase, async (req, res) => {
  try {
    const { phone } = req.params;
    const { cooldownMinutes } = req.body;
    const { data: user } = await supabase.from('users').select('id').eq('phone', sanitize(phone)).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (cooldownMinutes === null || cooldownMinutes <= 0) {
      await supabase.from('users').update({ cooldown_until: null }).eq('id', user.id);
      await supabase.from('daily_usage').upsert({ user_id: user.id, date: getTodayStr(), count: 0 }, { onConflict: 'user_id,date' });
    } else {
      const until = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();
      await supabase.from('users').update({ cooldown_until: until }).eq('id', user.id);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/payments', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('user_payments').select('*, users(username, device_name)').order('date', { ascending: false });
    res.json({ payments: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/verify-payment', requireSupabase, async (req, res) => {
  try {
    const { trxId } = req.body;
    const cleanTrx = sanitize(trxId);

    // Find the payment
    const { data: payment } = await supabase.from('user_payments')
      .select('*, users!inner(id, fcm_token)').eq('trx_id', cleanTrx).single();
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const userId = payment.user_id;

    // Update payment
    await supabase.from('user_payments').update({
      verified: true, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: new Date().toISOString(),
    }).eq('trx_id', cleanTrx);

    // Grant lifetime
    await supabase.from('user_subscriptions').upsert({
      user_id: userId, plan: 'lifetime', active: true, lifetime_free: true,
      expires_at: null, verified_by: req.headers['x-admin-id'] || 'admin',
      verified_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', userId);

    // Send confirmation FCM
    const { data: user } = await supabase.from('users').select('fcm_token').eq('id', userId).single();
    if (user?.fcm_token) {
      await sendFcm(user.fcm_token, { title: '✅ Payment Verified!', body: 'Your subscription is now active. Thank you!' }, { type: 'payment_verified' });
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reports ──────────────────────────────────────────────────────────
app.get('/api/reports', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('reports').select('*').order('timestamp', { ascending: false }).limit(100);
    res.json({ reports: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reports', requireSupabase, async (req, res) => {
  try {
    await supabase.from('reports').insert({
      message: req.body.message, username: req.body.username || '',
      userId: req.body.userId || '', appVersion: req.body.appVersion || 'unknown',
      timestamp: new Date().toISOString(), status: 'unread',
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/reports/:id/read', requireSupabase, async (req, res) => {
  try {
    await supabase.from('reports').update({ status: 'read' }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/reports/:id', requireSupabase, async (req, res) => {
  try {
    await supabase.from('reports').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      const { data } = await supabase.from('app_config').select('ai_provider, ai_model, ai_gemini_model, ai_enabled').eq('id', 1).single();
      if (data) config = { ...config, aiProvider: data.ai_provider, aiModel: data.ai_model, aiGeminiModel: data.ai_gemini_model, aiEnabled: data.ai_enabled };
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
    await supabase.from('search_events').insert({ user_id: userId, word, timestamp: new Date().toISOString() });

    // Save to search_history
    await supabase.from('search_history').insert({ user_id: userId, word, timestamp: new Date().toISOString() });

    res.json({
      ...aiResult, _meta: { dailyRemaining: limit.remaining, isPremium: limit.isPremium || false },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate', requireSupabase, requireJwt, async (req, res) => {
  try {
    const { type, prompt: userPrompt } = req.body;
    const userId = req.userId;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    let config = { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiEnabled: true };
    try {
      const { data } = await supabase.from('app_config').select('ai_provider, ai_model, ai_enabled').eq('id', 1).single();
      if (data) config = { ...config, aiProvider: data.ai_provider, aiModel: data.ai_model, aiEnabled: data.ai_enabled };
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Quiz Pool ────────────────────────────────────────────────────────
app.post('/api/admin/quiz-pool/publish', requireSupabase, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'Questions array required' });

    // Delete existing pool
    await supabase.from('quiz_pool').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new questions
    const now = new Date().toISOString();
    const records = questions.map((q, i) => ({
      word: q.word || null, question: q.question, options: q.options, correct_index: q.correctIndex,
      hint: q.hint || null, difficulty: q.difficulty || 'medium', created_at: now, index: i,
    }));
    await supabase.from('quiz_pool').insert(records);

    res.json({ success: true, count: records.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/quiz-pool', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('quiz_pool').select('*').order('created_at', { ascending: false }).limit(10);
    res.json({ questions: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AI Notification Agent Config ─────────────────────────────────────
app.get('/api/ai-notification-agent', requireSupabase, async (req, res) => {
  try {
    const { data } = await supabase.from('ai_notification_agent').select('*').eq('id', 1).single();
    res.json(data || {});
  } catch { res.json({}); }
});

app.post('/api/ai-notification-agent', requireSupabase, async (req, res) => {
  try {
    await supabase.from('ai_notification_agent').update({
      prompt: req.body.prompt, enabled: req.body.enabled, interval_minutes: req.body.intervalMinutes,
      time_of_day: req.body.timeOfDay, updated_at: new Date().toISOString(),
      last_sent_at: req.body.lastSentAt, next_send_at: req.body.nextSendAt,
    }).eq('id', 1);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AI Notification Scheduler (called by cron) ───────────────────────
app.post('/api/ai-notification-tick', requireSupabase, async (req, res) => {
  try {
    const { data: agent } = await supabase.from('ai_notification_agent').select('*').eq('id', 1).single();
    if (!agent || !agent.enabled) return res.json({ skipped: true, reason: 'disabled' });

    const now = Date.now();
    const nextSend = agent.next_send_at ? new Date(agent.next_send_at).getTime() : 0;
    if (nextSend > now) return res.json({ skipped: true, reason: 'not yet' });

    // Get active users with FCM tokens
    const { data: users } = await supabase.from('users')
      .select('fcm_token').eq('status', 'active').not('fcm_token', 'is', null);
    const tokens = (users || []).map(u => u.fcm_token).filter(Boolean);
    if (!tokens.length) return res.json({ skipped: true, reason: 'no users' });

    // Get recent search events for AI prompt context
    const { data: recentSearches } = await supabase.from('search_events')
      .select('word').gte('timestamp', new Date(now - 3600000).toISOString());
    const recentWords = [...new Set((recentSearches || []).map(s => s.word?.toLowerCase()).filter(Boolean))];

    // Generate notification message via AI
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

    // Send notifications
    const result = await sendFcmMulticast(tokens, { title: '📖 Words Nest', body: message }, { type: 'ai_notification' });

    // Log
    const notifId = `ai_${now}`;
    await supabase.from('global_notifications').insert({
      id: notifId, title: 'AI Notification', message,
      target: 'ai_automation', sentAt: new Date(now).toISOString(),
      success: true, sentCount: tokens.length, deliveredCount: result.successCount,
      aiGenerated: true, aiPrompt: agent.prompt,
    });

    // Update next send
    const interval = (agent.interval_minutes || 60) * 60 * 1000;
    await supabase.from('ai_notification_agent').update({
      last_sent_at: new Date(now).toISOString(),
      next_send_at: new Date(now + interval).toISOString(),
    }).eq('id', 1);

    res.json({ success: true, sent: result.successCount, failed: result.failureCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── iOS Waitlist ─────────────────────────────────────────────────────
app.get('/api/waitlist/count', requireSupabase, async (req, res) => {
  try {
    const count = await safeCount('waitlist_ios');
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/waitlist/join', requireSupabase, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data: existing } = await supabase.from('waitlist_ios').select('id').eq('email', email.toLowerCase()).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Already on waitlist' });

    await supabase.from('waitlist_ios').insert({ email: email.toLowerCase(), created_at: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Android App Notifications (per-user) ─────────────────────────────
app.get('/api/notifications/:userId', requireSupabase, async (req, res) => {
  try {
    const { userId } = req.params;
    const { data } = await supabase.from('user_notifications')
      .select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    res.json({ notifications: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:userId/read/:notificationId', requireSupabase, async (req, res) => {
  try {
    await supabase.from('user_notifications').update({ is_read: true })
      .eq('id', req.params.notificationId).eq('user_id', req.params.userId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Install Analytics ────────────────────────────────────────────────
app.get('/api/installs/stats', requireSupabase, async (req, res) => {
  try {
    const total = await safeCount('installs');
    const { data: users } = await supabase.from('users').select('status');
    const active = (users || []).filter(u => u.status === 'active').length;
    res.json({ totalInstalls: total, activeUsers: active });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Static Files ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
