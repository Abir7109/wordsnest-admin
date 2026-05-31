import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ── Rate Limiting ────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', globalLimiter);

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests, please try again later' },
});
app.use('/api/ai/', aiLimiter);
app.use('/api/notifications/', aiLimiter);

let admin, db, messaging;
let firebaseReady = false;

async function initFirebase() {
  try {
    let serviceAccount;
    const envJson = process.env.FCM_SERVICE_ACCOUNT;
    if (envJson) {
      serviceAccount = JSON.parse(envJson);
    } else {
      const { existsSync, readFileSync } = await import('fs');
      const localPath = path.join(__dirname, 'firebase-service-account.json');
      if (existsSync(localPath)) {
        serviceAccount = JSON.parse(readFileSync(localPath, 'utf-8'));
      }
    }

    if (!serviceAccount) {
      console.warn('Firebase service account not found');
      return;
    }

    const fbAdmin = await import('firebase-admin');
    admin = fbAdmin.default;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    db = admin.firestore();
    messaging = admin.messaging();
    firebaseReady = true;
    console.log('Firebase Admin initialized');
  } catch (e) {
    console.warn('Firebase init failed:', e.message);
  }
}

setTimeout(() => initFirebase(), 100);

function requireFirebase(req, res, next) {
  if (!firebaseReady) {
    return res.status(503).json({ error: 'Firebase not initialized' });
  }
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', firebase: firebaseReady });
});

app.get('/api/ping-keep-alive', (req, res) => res.json({ pong: Date.now() }));

// ── Helpers ──────────────────────────────────────────────────────────
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
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

function countByDay(docs, field = 'timestamp') {
  const dayMap = {};
  for (const d of docs) {
    const ts = d[field];
    if (!ts) continue;
    const day = getDayStart(typeof ts === 'number' ? ts : ts.toMillis ? ts.toMillis() : ts);
    dayMap[day] = (dayMap[day] || 0) + 1;
  }
  return dayMap;
}

// ── Dashboard Stats ──────────────────────────────────────────────────
async function safeCount(query) {
  try { const snap = await query; return snap.data().count || 0; } catch { return 0; }
}
async function safeGet(query) {
  try { return await query; } catch { return { docs: [] }; }
}

app.get('/api/dashboard', requireFirebase, async (req, res) => {
  try {
    const dayAgo = Date.now() - 86400000;
    const todayStart = getDayStart();

    const [
      users, searches, words, quizzes, activeUsers, newUsersToday,
      searchesToday, wordsToday, quizzesToday, totalInstalls,
    ] = await Promise.all([
      safeCount(db.collection('users').count().get()),
      safeCount(db.collection('search_events').count().get()),
      safeCount(db.collectionGroup('words').count().get()),
      safeCount(db.collectionGroup('quizzes').count().get()),
      safeCount(db.collection('users').where('lastActive', '>=', dayAgo).count().get()),
      safeCount(db.collection('users').where('createdAt', '>=', todayStart).count().get()),
      safeCount(db.collection('search_events').where('timestamp', '>=', todayStart).count().get()),
      safeCount(db.collectionGroup('words').where('timestamp', '>=', todayStart).count().get()),
      safeCount(db.collectionGroup('quizzes').where('timestamp', '>=', todayStart).count().get()),
      safeCount(db.collection('installs').count().get()),
    ]);

    let averageQuizScore = 0;
    const recentQuizzesSnap = await safeGet(db.collectionGroup('quizzes').orderBy('timestamp', 'desc').limit(500).get());
    const scores = recentQuizzesSnap.docs.map(d => d.data().score).filter(s => s !== undefined && s !== null);
    if (scores.length > 0) {
      averageQuizScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }

    let uniqueWordsSaved = 0;
    let topWordType = 'N/A';
    const typeCounts = {};
    const uniqueWords = new Set();
    const wordsSnapAll = await safeGet(db.collectionGroup('words').limit(1000).get());
    for (const d of wordsSnapAll.docs) {
      const data = d.data();
      if (data.word) uniqueWords.add(data.word.toLowerCase());
      if (data.type) {
        typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
      }
    }
    uniqueWordsSaved = uniqueWords.size;
    if (Object.keys(typeCounts).length > 0) {
      topWordType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];
    }

    const engagementRate = users > 0 ? Math.round((activeUsers / users) * 100) : 0;
    const weekAgo = getDaysAgo(7);
    const usersBeforeWeek = await safeCount(db.collection('users').where('createdAt', '<=', weekAgo).count().get());
    const retained = await safeCount(db.collection('users').where('lastActive', '>=', getDaysAgo(1)).where('createdAt', '<=', weekAgo).count().get());
    const retentionRate = usersBeforeWeek > 0 ? Math.round((retained / usersBeforeWeek) * 100) : 0;

    res.json({
      users, activeUsers, searches, words, quizzes,
      newUsersToday, dailyActiveUsers: activeUsers,
      totalInstalls, searchesToday, wordsToday, quizzesToday,
      averageQuizScore, uniqueWordsSaved, topWordType,
      engagementRate, retentionRate,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard Timeline ───────────────────────────────────────────────
app.get('/api/dashboard/timeline', requireFirebase, async (req, res) => {
  try {
    const days = 7;
    const timeline = [];

    const sinceTs = getDaysAgo(days - 1);

    const [usersAll, searchesAll, wordsAll, quizzesAll] = await Promise.all([
      safeGet(db.collection('users').where('createdAt', '>=', sinceTs).get()),
      safeGet(db.collection('search_events').where('timestamp', '>=', sinceTs).get()),
      safeGet(db.collectionGroup('words').where('timestamp', '>=', sinceTs).get()),
      safeGet(db.collectionGroup('quizzes').where('timestamp', '>=', sinceTs).get()),
    ]);

    const usersByDay = countByDay(usersAll.docs.map(d => ({ timestamp: d.data().createdAt })));
    const searchesByDay = countByDay(searchesAll.docs.map(d => ({ timestamp: d.data().timestamp })));
    const wordsByDay = countByDay(wordsAll.docs.map(d => ({ timestamp: d.data().timestamp })));
    const quizzesByDay = countByDay(quizzesAll.docs.map(d => ({ timestamp: d.data().timestamp })));

    let activeUsersByDay = {};
    const activeSnap = await safeGet(db.collection('users').where('lastActive', '>=', sinceTs).get());
    activeUsersByDay = countByDay(activeSnap.docs.map(d => ({ timestamp: d.data().lastActive })));

    for (let i = days - 1; i >= 0; i--) {
      const dayTs = getDaysAgo(i);
      const nextDayTs = dayTs + 86400000;
      let newUsers = 0;
      for (const [ts, count] of Object.entries(usersByDay)) {
        const n = parseInt(ts);
        if (n >= dayTs && n < nextDayTs) newUsers += count;
      }
      timeline.push({
        date: new Date(dayTs).toISOString().split('T')[0],
        label: formatDateLabel(dayTs),
        users: activeUsersByDay[dayTs] || 0,
        activeUsers: activeUsersByDay[dayTs] || 0,
        searches: searchesByDay[dayTs] || 0,
        words: wordsByDay[dayTs] || 0,
        quizzes: quizzesByDay[dayTs] || 0,
        newUsers,
      });
    }

    res.json({ timeline });
  } catch (e) {
    res.json({ timeline: [] });
  }
});

// ── Dashboard Top Words ──────────────────────────────────────────────
app.get('/api/dashboard/top-words', requireFirebase, async (req, res) => {
  try {
    const snap = await safeGet(db.collectionGroup('words').limit(2000).get());
    const wordCounts = {};
    const wordData = {};
    for (const d of snap.docs) {
      const data = d.data();
      const w = data.word?.toLowerCase();
      if (!w) continue;
      wordCounts[w] = (wordCounts[w] || 0) + 1;
      if (!wordData[w]) wordData[w] = { type: data.type };
    }
    const top = Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count, type: wordData[word]?.type }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    res.json({ topWords: top });
  } catch {
    res.json({ topWords: [] });
  }
});

// ── Dashboard Top Searches ───────────────────────────────────────────
app.get('/api/dashboard/top-searches', requireFirebase, async (req, res) => {
  try {
    const snap = await safeGet(db.collection('search_events').limit(2000).get());
    const wordCounts = {};
    const userSets = {};
    for (const d of snap.docs) {
      const data = d.data();
      const w = data.word?.toLowerCase();
      if (!w) continue;
      wordCounts[w] = (wordCounts[w] || 0) + 1;
      if (!userSets[w]) userSets[w] = new Set();
      if (data.user_id) userSets[w].add(data.user_id);
    }
    const top = Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count, users: userSets[word]?.size || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    res.json({ topSearches: top });
  } catch {
    res.json({ topSearches: [] });
  }
});

// ── Recent Activity ──────────────────────────────────────────────────
app.get('/api/dashboard/recent-activity', requireFirebase, async (req, res) => {
  try {
    const activities = [];

    const recentUsersSnap = await safeGet(db.collection('users').orderBy('createdAt', 'desc').limit(5).get());
    for (const d of recentUsersSnap.docs) {
      const data = d.data();
      activities.push({
        type: 'user_signup',
        userId: d.id,
        username: data.username || data.email?.split('@')[0] || 'Unknown',
        timestamp: data.createdAt || 0,
      });
    }

    const recentWordsSnap = await safeGet(db.collectionGroup('words').orderBy('timestamp', 'desc').limit(5).get());
    for (const d of recentWordsSnap.docs) {
      const data = d.data();
      activities.push({
        type: 'word_saved',
        userId: d.ref.parent.parent?.id || '',
        username: '',
        word: data.word,
        timestamp: data.timestamp || 0,
      });
    }

    const recentQuizzesSnap = await safeGet(db.collectionGroup('quizzes').orderBy('timestamp', 'desc').limit(5).get());
    for (const d of recentQuizzesSnap.docs) {
      const data = d.data();
      activities.push({
        type: 'quiz_taken',
        userId: d.ref.parent.parent?.id || '',
        username: '',
        score: data.score,
        timestamp: data.timestamp || 0,
      });
    }

    activities.sort((a, b) => b.timestamp - a.timestamp);
    res.json({ activities: activities.slice(0, 15) });
  } catch {
    res.json({ activities: [] });
  }
});

// ── Dashboard Word Type Distribution ─────────────────────────────────
app.get('/api/dashboard/word-types', requireFirebase, async (req, res) => {
  try {
    const snap = await safeGet(db.collectionGroup('words').limit(2000).get());
    const typeCounts = {};
    let total = 0;
    for (const d of snap.docs) {
      const type = d.data().type;
      if (!type) continue;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      total++;
    }
    const distribution = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count, percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0 }))
      .sort((a, b) => b.count - a.count);
    res.json({ distribution });
  } catch {
    res.json({ distribution: [] });
  }
});

// ── Users ────────────────────────────────────────────────────────────
app.get('/api/users', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collection('users').orderBy('lastActive', 'desc').limit(100).get();

    const userIds = snap.docs.map(d => d.id);
    const wordCounts = {};
    const quizCounts = {};
    const avgScores = {};

    await Promise.all(userIds.map(async (uid) => {
      try {
        const [wordsSnap, quizzesSnap] = await Promise.all([
          db.collection('users').doc(uid).collection('words').count().get(),
          db.collection('users').doc(uid).collection('quizzes').get(),
        ]);
        wordCounts[uid] = wordsSnap.data().count || 0;
        const qData = quizzesSnap.docs.map(d => d.data().score).filter(s => s !== undefined && s !== null);
        quizCounts[uid] = qData.length;
        avgScores[uid] = qData.length > 0 ? Math.round(qData.reduce((a, b) => a + b, 0) / qData.length) : 0;
      } catch (e) {
        wordCounts[uid] = 0;
        quizCounts[uid] = 0;
        avgScores[uid] = 0;
      }
    }));

    const users = snap.docs.map(d => ({
      uid: d.id,
      ...d.data(),
      lastActive: d.data().lastActive || 0,
      wordCount: wordCounts[d.id] || 0,
      quizCount: quizCounts[d.id] || 0,
      averageScore: avgScores[d.id] || 0,
    }));
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/:uid', requireFirebase, async (req, res) => {
  try {
    const { uid } = req.params;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

    const [wordsSnap, quizzesSnap, searchHistorySnap] = await Promise.all([
      db.collection('users').doc(uid).collection('words').orderBy('timestamp', 'desc').limit(100).get(),
      db.collection('users').doc(uid).collection('quizzes').orderBy('timestamp', 'desc').limit(50).get(),
      db.collection('users').doc(uid).collection('search_history').orderBy('timestamp', 'desc').limit(50).get(),
    ]);

    const { securityAnswerHash, ...safeProfile } = { uid, ...userDoc.data() };
    res.json({
      profile: safeProfile,
      words: wordsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      quizzes: quizzesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      searchHistory: searchHistorySnap.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:uid', requireFirebase, async (req, res) => {
  try {
    await admin.auth().deleteUser(req.params.uid);
    await db.collection('users').doc(req.params.uid).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Users Stats ──────────────────────────────────────────────────────
app.get('/api/users/stats', requireFirebase, async (req, res) => {
  try {
    const todayStart = getDayStart();
    const weekAgo = getDaysAgo(7);
    const monthAgo = getDaysAgo(30);

    const [newToday, thisWeek, thisMonth, total, active, inactive] = await Promise.all([
      safeCount(db.collection('users').where('createdAt', '>=', todayStart).count().get()),
      safeCount(db.collection('users').where('createdAt', '>=', weekAgo).count().get()),
      safeCount(db.collection('users').where('createdAt', '>=', monthAgo).count().get()),
      safeCount(db.collection('users').count().get()),
      safeCount(db.collection('users').where('status', '==', 'active').count().get()),
      safeCount(db.collection('users').where('status', '==', 'inactive').count().get()),
    ]);

    const byVersion = {};
    const versionSnap = await safeGet(db.collection('users').get());
    for (const d of versionSnap.docs) {
      const v = d.data().app_version || 'unknown';
      byVersion[v] = (byVersion[v] || 0) + 1;
    }

    res.json({ newToday, thisWeek, thisMonth, total, active, inactive, byVersion });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Saved Words ──────────────────────────────────────────────────────
app.get('/api/words', requireFirebase, async (req, res) => {
  try {
    const snap = await safeGet(db.collectionGroup('words').orderBy('timestamp', 'desc').limit(200).get());
    const words = snap.docs.map(d => ({
      id: d.id,
      userId: d.ref.parent.parent?.id || 'unknown',
      ...d.data(),
    }));
    res.json({ words });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/words/:id', requireFirebase, async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.collectionGroup('words').where('__name__', '==', id).get();
    for (const d of snap.docs) {
      await d.ref.delete();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Words Stats ──────────────────────────────────────────────────────
app.get('/api/words/stats', requireFirebase, async (req, res) => {
  try {
    const todayStart = getDayStart();
    const [total, today, thisWeek] = await Promise.all([
      safeCount(db.collectionGroup('words').count().get()),
      safeCount(db.collectionGroup('words').where('timestamp', '>=', todayStart).count().get()),
      safeCount(db.collectionGroup('words').where('timestamp', '>=', getDaysAgo(7)).count().get()),
    ]);

    const allSnap = await safeGet(db.collectionGroup('words').limit(2000).get());
    const typeCounts = {};
    const uniqueWords = new Set();
    for (const d of allSnap.docs) {
      const data = d.data();
      if (data.word) uniqueWords.add(data.word.toLowerCase());
      if (data.type) typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
    }

    const typeDistribution = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count, percentage: allSnap.docs.length > 0 ? Math.round((count / allSnap.docs.length) * 100 * 10) / 10 : 0 }))
      .sort((a, b) => b.count - a.count);

    res.json({
      total, today, thisWeek,
      uniqueWords: uniqueWords.size,
      typeDistribution,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Searches ─────────────────────────────────────────────────────────
app.get('/api/searches', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collection('search_events').orderBy('timestamp', 'desc').limit(200).get();
    const searches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ searches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/searches/:id', requireFirebase, async (req, res) => {
  try {
    await db.collection('search_events').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/searches/stats', requireFirebase, async (req, res) => {
  try {
    const todayStart = getDayStart();
    const weekAgo = getDaysAgo(7);

    const [total, today, thisWeek] = await Promise.all([
      safeCount(db.collection('search_events').count().get()),
      safeCount(db.collection('search_events').where('timestamp', '>=', todayStart).count().get()),
      safeCount(db.collection('search_events').where('timestamp', '>=', weekAgo).count().get()),
    ]);

    const recentSnap = await safeGet(db.collection('search_events').where('timestamp', '>=', weekAgo).get());
    const uniqueWords = new Set();
    const topCounts = {};
    for (const d of recentSnap.docs) {
      const w = d.data().word?.toLowerCase();
      if (!w) continue;
      uniqueWords.add(w);
      topCounts[w] = (topCounts[w] || 0) + 1;
    }

    const topSearches = Object.entries(topCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    res.json({ total, today, thisWeek, uniqueWords: uniqueWords.size, topSearches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Quizzes ──────────────────────────────────────────────────────────
app.get('/api/quizzes', requireFirebase, async (req, res) => {
  try {
    const snap = await safeGet(db.collectionGroup('quizzes').orderBy('timestamp', 'desc').limit(200).get());
    const quizzes = snap.docs.map(d => ({
      id: d.id,
      userId: d.ref.parent.parent?.id || 'unknown',
      ...d.data(),
    }));
    res.json({ quizzes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/quizzes/:id', requireFirebase, async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.collectionGroup('quizzes').where('__name__', '==', id).get();
    for (const d of snap.docs) {
      await d.ref.delete();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Quizzes Stats ────────────────────────────────────────────────────
app.get('/api/quizzes/stats', requireFirebase, async (req, res) => {
  try {
    const todayStart = getDayStart();

    const [total, today] = await Promise.all([
      safeCount(db.collectionGroup('quizzes').count().get()),
      safeCount(db.collectionGroup('quizzes').where('timestamp', '>=', todayStart).count().get()),
    ]);

    const allSnap = await safeGet(db.collectionGroup('quizzes').limit(1000).get());
    const scores = allSnap.docs.map(d => d.data().score).filter(s => s !== undefined && s !== null);
    const participants = new Set();
    for (const d of allSnap.docs) {
      const uid = d.ref.parent.parent?.id;
      if (uid) participants.add(uid);
    }

    const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    const highest = scores.length > 0 ? Math.max(...scores) : 0;
    const lowest = scores.length > 0 ? Math.min(...scores) : 0;

    const scoreDistribution = [];
    for (let i = 0; i < 10; i++) {
      const lower = i * 10;
      const upper = (i + 1) * 10;
      const count = scores.filter(s => s >= lower && s < upper).length;
      if (count > 0) scoreDistribution.push({ range: `${lower}-${upper === 100 ? '100' : upper - 1}`, count });
    }
    const hundredCount = scores.filter(s => s === 100).length;
    if (hundredCount > 0) {
      const existing = scoreDistribution.find(r => r.range === '90-99');
      if (existing) existing.count += hundredCount;
      else scoreDistribution.push({ range: '90-100', count: hundredCount });
    }

    res.json({
      total, today,
      averageScore: avg,
      highestScore: highest,
      lowestScore: lowest,
      totalParticipants: participants.size,
      scoreDistribution,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Leaderboard ──────────────────────────────────────────────────────
app.get('/api/leaderboard', requireFirebase, async (req, res) => {
  try {
    const currentUid = req.query.uid || '';

    const [usersSnap, searchSnap, wordsSnap, quizzesSnap] = await Promise.all([
      db.collection('users').limit(5000).get(),
      db.collection('search_events').limit(50000).get(),
      db.collectionGroup('words').limit(50000).get(),
      db.collectionGroup('quizzes').limit(50000).get(),
    ]);

    const searchCounts = {};
    for (const d of searchSnap.docs) {
      const uid = d.data().user_id;
      if (uid) searchCounts[uid] = (searchCounts[uid] || 0) + 1;
    }

    const wordCounts = {};
    for (const d of wordsSnap.docs) {
      const uid = d.ref.parent.parent?.id;
      if (uid) wordCounts[uid] = (wordCounts[uid] || 0) + 1;
    }

    const quizTotals = {};
    for (const d of quizzesSnap.docs) {
      const uid = d.ref.parent.parent?.id;
      if (uid) quizTotals[uid] = (quizTotals[uid] || 0) + (d.data().score || 0);
    }

    const entries = [];
    for (const d of usersSnap.docs) {
      const data = d.data();
      const uid = d.id;

      // Skip anonymous v1.x users with no username or email
      if (!data.username && !data.email) continue;

      const searches = searchCounts[uid] || 0;
      const quizScore = quizTotals[uid] || 0;
      const wordsSaved = wordCounts[uid] || 0;

      const lastActive = data.lastActive || 0;
      const daysSinceActive = lastActive > 0 ? Math.floor((Date.now() - lastActive) / 86400000) : 999;
      let streak = daysSinceActive <= 1 ? Math.max(1, Math.min(30, Math.floor((data.totalDaysActive || 0) / 3))) : 0;
      if (data.leaderboardStreak !== undefined && data.leaderboardStreak !== null) streak = data.leaderboardStreak;

      const manualScore = data.leaderboardManualScore;
      const rankPoints = manualScore !== undefined && manualScore !== null
        ? manualScore
        : Math.min(searches, 5) * 2 + quizScore + streak * 3;

      entries.push({
        uid,
        name: data.username || data.email?.split('@')[0] || 'Anonymous',
        emoji: data.emoji || '🌿',
        score: rankPoints,
        words: wordsSaved,
        quiz: quizScore,
        streak,
        isUser: uid === currentUid,
        isAdmin: data.email === ADMIN_EMAIL,
        lastActive: data.lastActive || 0,
        email: data.email || '',
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((entry, i) => { entry.rank = i + 1; });

    const publicEntries = entries.map(({ uid, email, lastActive, ...rest }) => rest);
    res.json({ leaderboard: publicEntries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/leaderboard', requireFirebase, async (req, res) => {
  try {
    const [usersSnap, searchSnap, wordsSnap, quizzesSnap] = await Promise.all([
      db.collection('users').limit(5000).get(),
      db.collection('search_events').limit(50000).get(),
      db.collectionGroup('words').limit(50000).get(),
      db.collectionGroup('quizzes').limit(50000).get(),
    ]);

    const searchCounts = {};
    for (const d of searchSnap.docs) {
      const uid = d.data().user_id;
      if (uid) searchCounts[uid] = (searchCounts[uid] || 0) + 1;
    }

    const wordCounts = {};
    for (const d of wordsSnap.docs) {
      const uid = d.ref.parent.parent?.id;
      if (uid) wordCounts[uid] = (wordCounts[uid] || 0) + 1;
    }

    const quizTotals = {};
    for (const d of quizzesSnap.docs) {
      const uid = d.ref.parent.parent?.id;
      if (uid) quizTotals[uid] = (quizTotals[uid] || 0) + (d.data().score || 0);
    }

    const entries = [];
    for (const d of usersSnap.docs) {
      const data = d.data();
      const uid = d.id;

      // Skip anonymous v1.x users with no username or email
      if (!data.username && !data.email) continue;

      const searches = searchCounts[uid] || 0;
      const quizScore = quizTotals[uid] || 0;
      const wordsSaved = wordCounts[uid] || 0;

      const lastActive = data.lastActive || 0;
      const daysSinceActive = lastActive > 0 ? Math.floor((Date.now() - lastActive) / 86400000) : 999;
      let streak = daysSinceActive <= 1 ? Math.max(1, Math.min(30, Math.floor((data.totalDaysActive || 0) / 3))) : 0;
      if (data.leaderboardStreak !== undefined && data.leaderboardStreak !== null) streak = data.leaderboardStreak;

      const manualScore = data.leaderboardManualScore;

      entries.push({
        uid,
        name: data.username || data.email?.split('@')[0] || 'Anonymous',
        emoji: data.emoji || '🌿',
        score: manualScore !== undefined && manualScore !== null
          ? manualScore
          : Math.min(searches, 5) * 2 + quizScore + streak * 3,
        computedScore: Math.min(searches, 5) * 2 + quizScore + streak * 3,
        manualScore: manualScore ?? null,
        words: wordsSaved,
        searches,
        quiz: quizScore,
        streak,
        isAdmin: data.email === ADMIN_EMAIL,
        lastActive: data.lastActive || 0,
        email: data.email || '',
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((entry, i) => { entry.rank = i + 1; });

    res.json({ leaderboard: entries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/leaderboard/:uid', requireFirebase, async (req, res) => {
  try {
    const { uid } = req.params;
    const { manualScore, streak } = req.body;
    const updateData = {};
    if (manualScore !== undefined) updateData.leaderboardManualScore = manualScore;
    if (streak !== undefined) updateData.leaderboardStreak = streak;
    await db.collection('users').doc(uid).update(updateData);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── App Config ───────────────────────────────────────────────────────
app.get('/api/app-config', requireFirebase, async (req, res) => {
  try {
    const doc = await db.collection('current_version').doc('config').get();
    const config = doc.exists ? doc.data() : {
      isAppAlive: true,
      underMaintenance: false,
      forceUpdate: false,
      softUpdate: false,
      currentVersion: '1.4.2',
      minRequiredVersion: '1.4.2',
      updateUrl: 'https://wordsnests.netlify.app/wordsnest-v2.0.0.apk',
      updateMessage: 'A new version is available! Words Nest 2.0.0 brings a redesigned UI, real-time cloud sync, and smarter learning tools.',
      maintenanceTitle: 'Under Maintenance',
      maintenanceMessage: 'We\'ll be back soon!',
      maintenanceEstimatedTime: '',
      dailyQuizLimit: 3,
      dailyWordLimit: 20,
      enableNotifications: true,
      enableLeaderboard: true,
      enableBackup: true,
      adsEnabled: false,
      aiProvider: 'groq',
      aiModel: 'llama-3.3-70b-versatile',
      aiGeminiModel: 'gemini-2.0-flash',
      aiEnabled: true,
    };
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/app-config', requireFirebase, async (req, res) => {
  try {
    await db.collection('current_version').doc('config').set(req.body, { merge: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Notifications ────────────────────────────────────────────────────

app.post('/api/admin/send-notification', requireFirebase, async (req, res) => {
  try {
    const { title, message, targetUserId } = req.body;
    let sentCount = 0;

    if (targetUserId && targetUserId !== 'all') {
      const userDoc = await db.collection('users').doc(targetUserId).get();
      const token = userDoc.data()?.fcm_token;
      if (token) {
        await messaging.send({ notification: { title, body: message }, token });
        sentCount++;
      }
    } else {
      const usersSnap = await db.collection('users').where('status', '==', 'active').get();
      const tokens = usersSnap.docs.map(d => d.data().fcm_token).filter(Boolean);
      if (tokens.length > 0) {
        const resp = await messaging.sendEach(tokens.map(token => ({
          notification: { title, body: message }, token,
        })));
        sentCount = resp.successCount || tokens.length;
      }
    }

    const notificationDoc = {
      title: req.body.title,
      message: req.body.message,
      sentAt: Date.now(),
      success: true,
      readCount: 0,
      deliveredCount: sentCount,
    };
    await db.collection('notifications').add(notificationDoc);
    res.json({ success: true, sentCount });
  } catch (e) {
    const notificationDoc = {
      title: req.body.title,
      message: req.body.message,
      error: e.message,
      sentAt: Date.now(),
      success: false,
    };
    try { await db.collection('notifications').add(notificationDoc); } catch {}
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/notifications', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collection('notifications').orderBy('sentAt', 'desc').limit(50).get();
    const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ notifications });
  } catch {
    res.json({ notifications: [] });
  }
});

// ── Experiences ──────────────────────────────────────────────────────
app.get('/api/experiences', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collection('experiences').orderBy('timestamp', 'desc').limit(50).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ experiences: items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/experiences', requireFirebase, async (req, res) => {
  try {
    await db.collection('experiences').add({ ...req.body, timestamp: Date.now() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/experiences/:id', requireFirebase, async (req, res) => {
  try {
    await db.collection('experiences').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── FCM Token Registration ──────────────────────────────────────────
app.post('/api/register-fcm', requireFirebase, async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    await db.collection('users').doc(userId).update({ fcm_token: fcmToken });
    await db.collection('installs').doc(userId).update({ fcm_token: fcmToken });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Security Questions (Forgot Password) ──────────────────────────
app.get('/api/auth/security-question', requireFirebase, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'User not found' });
    const data = snap.docs[0].data();
    if (!data.securityQuestion) return res.status(404).json({ error: 'No security question set' });
    res.json({ question: data.securityQuestion, uid: snap.docs[0].id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/reset-password', requireFirebase, async (req, res) => {
  try {
    const { uid, newPassword, securityAnswerHash } = req.body;
    if (!uid || !newPassword) return res.status(400).json({ error: 'uid and newPassword required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
    if (!securityAnswerHash) return res.status(400).json({ error: 'Security answer verification required' });
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const userData = userDoc.data();
    if (userData.securityAnswerHash && userData.securityAnswerHash !== securityAnswerHash) {
      return res.status(403).json({ error: 'Incorrect security answer' });
    }
    await admin.auth().updateUser(uid, { password: newPassword });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── User Registration ───────────────────────────────────────────────
app.post('/api/register', requireFirebase, async (req, res) => {
  try {
    const { userId } = req.body;
    const now = Date.now();
    const userData = {
      userId, status: 'active',
      install_date: now, lastActive: now,
      app_version: req.body.appVersion || '1.4.2',
    };
    await db.collection('users').doc(userId).set(userData, { merge: true });
    await db.collection('installs').doc(userId).set({
      user_id: userId, event_type: 'install', app_version: '1.4.2',
      device_model: req.body.deviceModel || '', android_version: '',
      timestamp: now, install_date: now, fcm_token: '', status: 'active',
    }, { merge: true });
    res.json({ success: true, userId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Word Analysis ────────────────────────────────────────────────────
app.post('/api/analyze', requireFirebase, async (req, res) => {
  const { word, user_id } = req.body;
  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (dictRes.ok) {
      const data = await dictRes.json();
      const entry = data[0];
      const meaning = entry.meanings?.[0];
      res.json({
        word: entry.word,
        phonetic: entry.phonetic || '',
        meaning: { english: meaning?.definitions?.[0]?.definition || '', bangla: '' },
        partsOfSpeech: entry.meanings?.map(m => ({ type: m.partOfSpeech, definition: m.definitions?.[0]?.definition })) || [],
        synonyms: meaning?.definitions?.flatMap(d => d.synonyms || []) || [],
        antonyms: meaning?.definitions?.flatMap(d => d.antonyms || []) || [],
        sentences: { simple: meaning?.definitions?.[0]?.example || '', compound: '', complex: '' },
      });
    } else {
      res.json({
        word, phonetic: '',
        meaning: { english: 'A contextual term in the English language.', bangla: '' },
        partsOfSpeech: [{ type: 'unknown', definition: 'Contextual' }],
        synonyms: [], antonyms: [],
        sentences: { simple: '', compound: '', complex: '' },
      });
    }
  } catch (e) {
    res.json({ word, phonetic: '', meaning: { english: 'Word found in context.', bangla: '' }, partsOfSpeech: [], synonyms: [], antonyms: [], sentences: {} });
  }
});

// ── AI Generation ────────────────────────────────────────────────────
app.post('/api/generate', requireFirebase, async (req, res) => {
  const { word, user_id } = req.body;
  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (dictRes.ok) {
      const data = await dictRes.json();
      const entry = data[0];
      const meaning = entry.meanings?.[0];
      res.json({
        word: entry.word, phonetic: entry.phonetic || '',
        meaning: { english: meaning?.definitions?.[0]?.definition || '', bangla: '' },
        partsOfSpeech: entry.meanings?.map(m => ({ type: m.partOfSpeech, definition: m.definitions?.[0]?.definition })) || [],
        synonyms: meaning?.definitions?.flatMap(d => d.synonyms || []) || [],
        antonyms: meaning?.definitions?.flatMap(d => d.antonyms || []) || [],
        sentences: { simple: meaning?.definitions?.[0]?.example || '', compound: '', complex: '' },
      });
    } else {
      res.json({ word, phonetic: '', meaning: { english: 'Contextual term.', bangla: '' }, partsOfSpeech: [], synonyms: [], antonyms: [], sentences: {} });
    }
  } catch (e) {
    res.json({ word, phonetic: '', meaning: { english: 'Word found.', bangla: '' }, partsOfSpeech: [], synonyms: [], antonyms: [], sentences: {} });
  }
});

// ── Quiz Generation ──────────────────────────────────────────────────
app.post('/api/quiz-generate', requireFirebase, async (req, res) => {
  try {
    const { count = 5, difficulty = 'medium' } = req.body;
    const aiConfig = await getAiConfig();
    if (!aiConfig.aiEnabled) return res.status(400).json({ error: 'AI not enabled' });

    const searchSnap = await db.collection('search_events')
      .orderBy('timestamp', 'desc').limit(50).get();
    const words = [...new Set(searchSnap.docs.map(d => d.data().word).filter(Boolean))].slice(0, 20);
    if (words.length < 3) {
      words.push('serendipity', 'ephemeral', 'eloquent', 'resilient', 'ubiquitous');
    }

    const difficultyPrompt = difficulty === 'easy'
      ? 'Make questions about basic word definitions, suitable for beginners.'
      : difficulty === 'hard'
      ? 'Make challenging questions about nuanced meanings, antonyms, context usage, and etymology.'
      : 'Mix easy and challenging questions about definitions, synonyms, and usage.';

    const prompt = `You are a quiz generator. Based on these words that users have recently searched: ${words.join(', ')}, generate a vocabulary quiz.

${difficultyPrompt}

Return ONLY valid JSON array (no markdown, no explanation) with exactly ${count} objects, each having:
{
  "word": "the vocabulary word",
  "question": "A clear multiple-choice question about this word's meaning, synonym, antonym, or usage",
  "options": ["correct answer", "wrong1", "wrong2", "wrong3"],
  "correctIndex": 0,
  "hint": "A brief helpful hint about the word"
}

Rules:
- Use REAL words from the provided list whenever possible
- correctIndex MUST be 0 (the correct answer is always the first option)
- Options should be shuffled but correct is always index 0 in the JSON
- Make questions varied (definitions, synonyms, antonyms, fill-in-the-blank, etymology)
- Hints should be subtle, not give away the answer
- Return ONLY the JSON array, nothing else`;

    let aiText = null;
    if (aiConfig.aiProvider === 'gemini') {
      aiText = await callGemini(prompt, aiConfig.aiGeminiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY, prompt, aiConfig.aiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, prompt, aiConfig.aiModel);
    } else if (aiConfig.aiProvider === 'groq_first') {
      if (GEMINI_API_KEY) aiText = await callGemini(prompt, aiConfig.aiGeminiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY, prompt, aiConfig.aiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, prompt, aiConfig.aiModel);
    } else {
      aiText = await callGroq(GROQ_API_KEY, prompt, aiConfig.aiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, prompt, aiConfig.aiModel);
    }

    if (!aiText) return res.status(500).json({ error: 'AI failed to generate quiz' });

    let questions = parseAiResponse(aiText);
    if (!questions || !Array.isArray(questions)) return res.status(500).json({ error: 'AI returned invalid format' });

    // Validate, sanitize and shuffle
    questions = questions.slice(0, count).map((q, i) => {
      const opts = Array.isArray(q.options) && q.options.length === 4 ? q.options : ['Answer', 'Wrong', 'Wrong', 'Wrong'];
      const shuffled = shuffleOptions(opts, 0);
      return {
        id: i + 1,
        word: q.word || 'Unknown',
        question: q.question || 'What does this word mean?',
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        hint: q.hint || 'Think about the word\'s meaning',
      };
    });

    // Store in quiz_pool
    const batch = db.batch();
    const poolRef = db.collection('quiz_pool');
    const existing = await poolRef.get();
    existing.docs.forEach(d => batch.delete(d.ref));
    questions.forEach(q => batch.set(poolRef.doc(), { ...q, createdAt: Date.now() }));
    await batch.commit();

    res.json({ success: true, questions, generatedFrom: words });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/quiz-pool', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collection('quiz_pool').orderBy('createdAt', 'desc').limit(10).get();
    const questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ questions, count: questions.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/quiz-pool/status', async (req, res) => {
  try {
    const snap = await db.collection('quiz_pool').orderBy('createdAt', 'desc').limit(10).get();
    if (snap.empty) return res.json({ hasQuiz: false, count: 0, generatedAt: null });
    const docs = snap.docs.map(d => d.data());
    const createdAt = docs[0]?.createdAt || null;
    res.json({ hasQuiz: true, count: docs.length, generatedAt: createdAt, generatedWords: docs.map(d => d.word) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/quiz-pool/publish', requireFirebase, async (req, res) => {
  try {
    if (!firebaseReady) return res.status(503).json({ error: 'Firebase not initialized' });
    const { questions, difficulty } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Questions array is required' });
    }
    const batch = db.batch();
    const poolRef = db.collection('quiz_pool');
    const existing = await poolRef.get();
    existing.docs.forEach(doc => batch.delete(doc.ref));
    questions.forEach((q, i) => {
      const docRef = poolRef.doc();
      batch.set(docRef, {
        word: q.word || '',
        question: q.question || '',
        options: q.options || [],
        correctIndex: q.correctIndex || 0,
        hint: q.hint || '',
        difficulty: difficulty || 'medium',
        createdAt: Date.now(),
        index: i,
      });
    });
    await batch.commit();
    res.json({ success: true, count: questions.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Notification Agent ─────────────────────────────────────────────
app.post('/api/ai/notification-agent-config', requireFirebase, async (req, res) => {
  try {
    const { prompt, enabled, intervalMinutes, timeOfDay } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });
    const config = {
      prompt: prompt.trim(),
      enabled: enabled !== false,
      intervalMinutes: Math.max(1, Math.min(1440, intervalMinutes || 60)),
      timeOfDay: timeOfDay || null,
      updatedAt: Date.now(),
      lastSentAt: 0,
      nextSendAt: Date.now() + Math.max(1, Math.min(1440, intervalMinutes || 60)) * 60000,
    };
    await db.collection('current_version').doc('ai_notification_agent').set(config, { merge: true });
    res.json({ success: true, config });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ai/notification-agent-config', requireFirebase, async (req, res) => {
  try {
    const doc = await db.collection('current_version').doc('ai_notification_agent').get();
    if (!doc.exists) return res.json({ enabled: false, prompt: '', intervalMinutes: 60, lastSentAt: 0, nextSendAt: 0 });
    res.json({ ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Notification Scheduler ─────────────────────────────────────────
const NOTIFICATION_CHECK_INTERVAL = 30000; // 30 seconds
let notificationScheduler = null;

async function checkAndSendAiNotification() {
  if (!firebaseReady) return;
  try {
    const doc = await db.collection('current_version').doc('ai_notification_agent').get();
    if (!doc.exists || !doc.data().enabled) return;
    const config = doc.data();
    const now = Date.now();

    // Check if it's time to send
    if (config.nextSendAt && now < config.nextSendAt) return;

    // Check timeOfDay constraint if set
    if (config.timeOfDay) {
      const [hour, minute] = config.timeOfDay.split(':').map(Number);
      const nowH = new Date().getHours();
      const nowM = new Date().getMinutes();
      // Only send within 5-minute window of the specified time
      const targetMinutes = hour * 60 + minute;
      const currentMinutes = nowH * 60 + nowM;
      if (Math.abs(currentMinutes - targetMinutes) > 3) return;
    }

    // Build context for the AI
    const userSnap = await db.collection('users').where('status', '==', 'active').get();
    const activeUserCount = userSnap.size;
    const lastHour = await db.collection('search_events')
      .where('timestamp', '>', now - 3600000).get();
    const recentWords = [...new Set(lastHour.docs.map(d => d.data().word).filter(Boolean))].slice(0, 10);

    const contextPrompt = `You are an AI notification agent for a vocabulary learning app called "Words Nest". 
Based on this configuration prompt: "${config.prompt}"

Current context:
- Active users: ${activeUserCount}
- Recent words searched: ${recentWords.join(', ') || 'none in the last hour'}
- Current time: ${new Date().toLocaleString()}

Generate a push notification (title and message body) that follows the prompt's instructions.
Return ONLY valid JSON (no markdown, no explanation) with:
{
  "title": "Short catchy title (max 50 chars)",
  "message": "Engaging message body (max 150 chars)"
}`;

    let aiText = null;
    const aiConfig = await getAiConfig();
    if (aiConfig.aiProvider === 'gemini') {
      aiText = await callGemini(contextPrompt, aiConfig.aiGeminiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY, contextPrompt, aiConfig.aiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, contextPrompt, aiConfig.aiModel);
    } else if (aiConfig.aiProvider === 'groq_first') {
      if (GEMINI_API_KEY) aiText = await callGemini(contextPrompt, aiConfig.aiGeminiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY, contextPrompt, aiConfig.aiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, contextPrompt, aiConfig.aiModel);
    } else {
      aiText = await callGroq(GROQ_API_KEY, contextPrompt, aiConfig.aiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, contextPrompt, aiConfig.aiModel);
    }

    if (!aiText) return;

    const parsed = parseAiResponse(aiText);
    if (!parsed || !parsed.title || !parsed.message) return;

    // Send the notification
    const tokens = userSnap.docs.map(d => d.data().fcm_token).filter(Boolean);
    let sentCount = 0;
    if (tokens.length > 0) {
      const resp = await messaging.sendEach(tokens.map(token => ({
        notification: { title: parsed.title, body: parsed.message }, token,
      })));
      sentCount = resp.successCount || 0;
    }

    // Record the notification
    await db.collection('notifications').add({
      id: 'ai_' + Date.now().toString(),
      title: parsed.title,
      message: parsed.message,
      target: 'ai_automation',
      sentAt: now,
      success: true,
      sentCount,
      deliveredCount: sentCount,
      aiGenerated: true,
      aiPrompt: config.prompt,
    });

    // Update next send time
    await db.collection('current_version').doc('ai_notification_agent').update({
      lastSentAt: now,
      nextSendAt: now + config.intervalMinutes * 60000,
    });
  } catch (e) {
    console.error('AI notification scheduler error:', e.message);
  }
}

function startNotificationScheduler() {
  if (notificationScheduler) clearInterval(notificationScheduler);
  notificationScheduler = setInterval(checkAndSendAiNotification, NOTIFICATION_CHECK_INTERVAL);
  console.log('AI Notification Scheduler started (checking every 30s)');
  // Also check immediately after a short delay
  setTimeout(checkAndSendAiNotification, 5000);
}

// Start the scheduler when Firebase is ready
setTimeout(() => {
  if (firebaseReady) {
    startNotificationScheduler();
  } else {
    const waitForFirebase = setInterval(() => {
      if (firebaseReady) {
        clearInterval(waitForFirebase);
        startNotificationScheduler();
      }
    }, 500);
  }
}, 2000);

// ── AI Word Enrichment ──────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2 || '';
if (process.env.GROK_API_KEY) console.warn('GROK_API_KEY is a deprecated fallback, use GROQ_API_KEY instead');
if (process.env.GROK_API_KEY_2) console.warn('GROK_API_KEY_2 is a deprecated fallback, use GROQ_API_KEY_2 instead');
const ADMIN_EMAIL = 'rahikulmakhtum147@gmail.com';

console.log(`AI Enrichment: GROQ_API_KEY=${GROQ_API_KEY ? '✅ set' : '❌ not set'}, GROQ_API_KEY_2=${GROQ_API_KEY_2 ? '✅ set' : '❌ not set'}, GEMINI_API_KEY=${GEMINI_API_KEY ? '✅ set' : '❌ not set'}`);

async function getAiConfig() {
  if (!firebaseReady) {
    return { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiGeminiModel: 'gemini-2.0-flash', aiEnabled: true };
  }
  try {
    const doc = await db.collection('current_version').doc('config').get();
    if (doc.exists) {
      const data = doc.data();
      return {
        aiProvider: data.aiProvider || 'groq',
        aiModel: data.aiModel || 'llama-3.3-70b-versatile',
        aiGeminiModel: data.aiGeminiModel || 'gemini-2.0-flash',
        aiEnabled: data.aiEnabled !== false,
      };
    }
  } catch (e) {
    console.error('Failed to read AI config:', e.message);
  }
  return { aiProvider: 'groq', aiModel: 'llama-3.3-70b-versatile', aiGeminiModel: 'gemini-2.0-flash', aiEnabled: true };
}

async function callGemini(prompt, model = 'gemini-2.0-flash') {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
        }),
      }
    );
    if (!res.ok) { console.error(`Gemini error: ${res.status} ${await res.text()}`); return null; }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { console.error('Gemini exception:', e.message); return null; }
}

async function callGroq(apiKey, prompt, model = 'llama-3.3-70b-versatile') {
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || null;
    }
    const errBody = await res.text();
    console.error(`Groq error (${apiKey.slice(0,8)}...): ${res.status} ${errBody}`);
    return null;
  } catch (e) { console.error('Groq exception:', e.message); return null; }
}

function shuffleOptions(options, correctIndex) {
  const correct = options[correctIndex];
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const newIndex = shuffled.indexOf(correct);
  return { options: shuffled, correctIndex: newIndex };
}

function parseAiResponse(text) {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {}
  try {
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) return JSON.parse(arrMatch[0]);
  } catch {}
  try {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const obj = JSON.parse(objMatch[0]);
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) return obj[key];
      }
    }
  } catch {}
  return null;
}

app.post('/api/ocr-word', async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'Image is required' });

  const MAX_SIZE = 10000;
  if (image.length > MAX_SIZE * 1.5) {
    const truncated = image.substring(0, MAX_SIZE);
    const prompt = `You are an OCR assistant. This is a base64-encoded cropped image of a single English word written on paper or printed. Look at this image data and identify the word. Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "word": "the_identified_word",
  "confidence": "high/medium/low"
}
Image data (truncated): ${truncated.substring(0, 500)}...
If you cannot clearly identify a single English word, return {"word": ""}.`;

    const aiConfig = await getAiConfig();
    let aiText = null;
    if (aiConfig.aiProvider === 'gemini') {
      aiText = await callGemini(prompt, aiConfig.aiGeminiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY, prompt, aiConfig.aiModel);
    } else {
      aiText = await callGroq(GROQ_API_KEY, prompt, aiConfig.aiModel);
      if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, prompt, aiConfig.aiModel);
    }

    if (aiText) {
      try {
        const parsed = parseAiResponse(aiText);
        if (parsed && parsed.word) {
          return res.json({ word: parsed.word, confidence: parsed.confidence || 'medium', source: 'ai' });
        }
      } catch {}
    }
  }
  res.json({ word: '', confidence: 'low', source: 'none' });
});

app.post('/api/enrich-word', async (req, res) => {
  const { word } = req.body;
  if (!word) return res.status(400).json({ error: 'Word is required' });

  const aiConfig = await getAiConfig();
  if (!aiConfig.aiEnabled) {
    return res.json({ enriched: false, synonyms: [], antonyms: [], simpleSentence: '', complexSentence: '', compoundSentence: '' });
  }

  const prompt = `You are an IELTS-specialized dictionary assistant. Given the word "${word}", return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "synonyms": ["synonym1", "synonym2", "synonym3", "synonym4", "synonym5"],
  "antonyms": ["antonym1", "antonym2", "antonym3"],
  "simpleSentence": "A simple IELTS Band 5-6 level example sentence using ${word}.",
  "complexSentence": "An advanced IELTS Band 7-8 level sentence using ${word} with deeper context.",
  "compoundSentence": "A compound sentence using ${word} suitable for IELTS writing task 2.",
  "simpleDefinition": "A very simple, easy-to-understand definition of ${word} in 8-10 words, suitable for a beginner English learner.",
  "banglaMeaning": "The Bengali (Bangla) meaning/translation of ${word}. If unsure provide the closest Bengali equivalent.",
  "ieltsBand": "The IELTS band level for this word as a number: 5 (basic), 6 (intermediate), 7 (advanced), or 8 (expert). Based on how commonly the word appears at each band level."
}
Make sure synonyms and antonyms are real English words that are actually synonymous/antonymous with "${word}". Keep sentences natural and IELTS-appropriate. Simple definition MUST be very short and beginner-friendly. Return ONLY the JSON.`;

  let aiText = null;
  if (aiConfig.aiProvider === 'gemini') {
    aiText = await callGemini(prompt, aiConfig.aiGeminiModel);
    if (!aiText) aiText = await callGroq(GROQ_API_KEY, prompt, aiConfig.aiModel);
    if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, prompt, aiConfig.aiModel);
  } else if (aiConfig.aiProvider === 'groq_first') {
    if (GEMINI_API_KEY) aiText = await callGemini(prompt, aiConfig.aiGeminiModel);
    if (!aiText) aiText = await callGroq(GROQ_API_KEY, prompt, aiConfig.aiModel);
    if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, prompt, aiConfig.aiModel);
  } else {
    // groq only (default)
    aiText = await callGroq(GROQ_API_KEY, prompt, aiConfig.aiModel);
    if (!aiText) aiText = await callGroq(GROQ_API_KEY_2, prompt, aiConfig.aiModel);
  }

  if (aiText) {
    const parsed = parseAiResponse(aiText);
    if (parsed) {
      return res.json({ enriched: true, ...parsed });
    }
  }

  res.json({ enriched: false, synonyms: [], antonyms: [], simpleSentence: '', complexSentence: '', compoundSentence: '' });
});

// ── App Notifications ────────────────────────────────────────────────
app.get('/api/notifications', requireFirebase, async (req, res) => {
  try {
    const userId = req.query.userId;
    const snap = await db.collection('users').doc(userId || '_').collection('notifications')
      .orderBy('createdAt', 'desc').limit(20).get();
    const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const unreadCount = notifications.filter(n => !n.isRead).length;
    res.json({ notifications, unreadCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/notifications/read', requireFirebase, async (req, res) => {
  try {
    const { notificationId, userId } = req.body;
    await db.collection('users').doc(userId || '_').collection('notifications')
      .doc(notificationId).update({ isRead: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── iOS Waitlist ─────────────────────────────────────────────────────
app.post('/api/waitlist/ios', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (!firebaseReady) return res.json({ success: true });
    const existing = await db.collection('waitlist_ios').where('email', '==', email).get();
    if (existing.empty) {
      await db.collection('waitlist_ios').add({ email, createdAt: Date.now() });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/waitlist/ios/count', async (req, res) => {
  try {
    if (!firebaseReady) return res.json({ count: 0 });
    const snap = await db.collection('waitlist_ios').count().get();
    res.json({ count: snap.data().count || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Install analytics ────────────────────────────────────────────────
app.get('/api/install-analytics', requireFirebase, async (req, res) => {
  try {
    const usersSnap = await db.collection('users').get();
    const totalInstalls = usersSnap.size;
    const activeUsers = usersSnap.docs.filter(d => d.data().status === 'active').length;
    res.json({ totalInstalls, activeUsers, status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bug Reports ───────────────────────────────────────────────────────
app.post('/api/reports', async (req, res) => {
  try {
    if (!firebaseReady) return res.json({ success: true });
    const { message, username, userId, appVersion } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    await db.collection('reports').add({
      message: message.trim(),
      username: username || 'Unknown',
      userId: userId || '',
      appVersion: appVersion || 'unknown',
      timestamp: Date.now(),
      status: 'unread',
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/reports', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collection('reports').orderBy('timestamp', 'desc').limit(100).get();
    const reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ reports });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/reports/:id/status', requireFirebase, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await db.collection('reports').doc(id).update({ status: status || 'read' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/reports/:id', requireFirebase, async (req, res) => {
  try {
    await db.collection('reports').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Serve React frontend ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Admin server on port ${PORT}`));
