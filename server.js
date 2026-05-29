import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ── Firebase Admin Init ──────────────────────────────────────────────
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

// ── Middleware ────────────────────────────────────────────────────────
function requireFirebase(req, res, next) {
  if (!firebaseReady) {
    return res.status(503).json({ error: 'Firebase not initialized' });
  }
  next();
}

// ── Health ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', firebase: firebaseReady });
});

app.get('/api/ping-keep-alive', (req, res) => res.json({ pong: Date.now() }));

// ── Dashboard Stats ──────────────────────────────────────────────────
app.get('/api/dashboard', requireFirebase, async (req, res) => {
  try {
    const [usersSnap, searchesSnap, wordsSnap, quizzesSnap] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('search_events').count().get(),
      db.collectionGroup('words').count().get(),
      db.collectionGroup('quizzes').count().get(),
    ]);

    const users = usersSnap.data().count || 0;
    const searches = searchesSnap.data().count || 0;
    const words = wordsSnap.data().count || 0;
    const quizzes = quizzesSnap.data().count || 0;

    // Active users in last 24h
    const dayAgo = Date.now() - 86400000;
    const activeSnap = await db.collection('users')
      .where('lastActive', '>=', dayAgo)
      .count().get();
    const activeUsers = activeSnap.data().count || 0;

    res.json({ users, activeUsers, searches, words, quizzes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────
app.get('/api/users', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collection('users').orderBy('lastActive', 'desc').limit(100).get();
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data(), lastActive: d.data().lastActive || 0 }));
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

    const wordsSnap = await db.collection('users').doc(uid).collection('words').get();
    const quizzesSnap = await db.collection('users').doc(uid).collection('quizzes').get();

    res.json({
      profile: { uid, ...userDoc.data() },
      words: wordsSnap.docs.map(d => d.data()),
      quizzes: quizzesSnap.docs.map(d => d.data()),
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

// ── Saved Words ──────────────────────────────────────────────────────
app.get('/api/words', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collectionGroup('words').orderBy('timestamp', 'desc').limit(200).get();
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

// ── Quizzes ──────────────────────────────────────────────────────────
app.get('/api/quizzes', requireFirebase, async (req, res) => {
  try {
    const snap = await db.collectionGroup('quizzes').orderBy('timestamp', 'desc').limit(200).get();
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

// ── App Config (Kill Switch, Maintenance, Updates) ───────────────────
app.get('/api/app-config', requireFirebase, async (req, res) => {
  try {
    const doc = await db.collection('current_version').doc('config').get();
    const config = doc.exists ? doc.data() : {
      isAppAlive: true,
      underMaintenance: false,
      forceUpdate: true,
      softUpdate: true,
      currentVersion: '2.0.0',
      minRequiredVersion: '2.0.0',
      updateUrl: 'https://wordsnests.netlify.app/wordsnest-v2.0.0.apk',
      updateMessage: 'A major update is here! Words Nest 2.0.0 brings a redesigned UI, real-time cloud sync, and smarter learning tools.',
      maintenanceTitle: 'Under Maintenance',
      maintenanceMessage: 'We\'ll be back soon!',
      maintenanceEstimatedTime: '',
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
const notificationHistory = [];

app.post('/api/admin/send-notification', requireFirebase, async (req, res) => {
  try {
    const { title, message, targetUserId } = req.body;

    if (targetUserId && targetUserId !== 'all') {
      const userDoc = await db.collection('users').doc(targetUserId).get();
      const token = userDoc.data()?.fcm_token;
      if (token) {
        await messaging.send({ notification: { title, body: message }, token });
      }
    } else {
      const usersSnap = await db.collection('users').where('status', '==', 'active').get();
      const tokens = usersSnap.docs.map(d => d.data().fcm_token).filter(Boolean);
      if (tokens.length > 0) {
        await messaging.sendEach(tokens.map(token => ({
          notification: { title, body: message }, token,
        })));
      }
    }

    notificationHistory.unshift({ title, message, target: targetUserId || 'all', sentAt: Date.now(), success: true });
    res.json({ success: true, sentCount: 1 });
  } catch (e) {
    notificationHistory.unshift({ title: req.body.title, message: req.body.message, error: e.message, sentAt: Date.now(), success: false });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/notifications', (req, res) => {
  res.json({ notifications: notificationHistory.slice(0, 50) });
});

// ── Experiences (Website Feedback) ───────────────────────────────────
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

// ── FCM Token Registration (App integration) ─────────────────────────
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

// ── User Registration (App integration) ──────────────────────────────
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

// ── Word Analysis (App integration - backward compat) ────────────────
app.post('/api/analyze', async (req, res) => {
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

// ── AI Generation (App integration) ──────────────────────────────────
app.post('/api/generate', async (req, res) => {
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

// ── App Notifications (App integration) ──────────────────────────────
app.get('/api/notifications', requireFirebase, async (req, res) => {
  try {
    const userId = req.query.userId;
    const snap = await db.collection('users').doc(userId || '_').collection('notifications')
      .orderBy('createdAt', 'desc').limit(20).get();
    const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const unreadCount = notifications.filter(n => !n.isRead).length;
    res.json({ notifications, unreadCount });
  } catch (e) {
    res.json({ notifications: [], unreadCount: 0 });
  }
});

app.post('/api/notifications/read', requireFirebase, async (req, res) => {
  try {
    const { notificationId, userId } = req.body;
    await db.collection('users').doc(userId || '_').collection('notifications')
      .doc(notificationId).update({ isRead: true });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: true });
  }
});

// ── Install analytics (App integration) ──────────────────────────────
app.get('/api/install-analytics', requireFirebase, async (req, res) => {
  try {
    const usersSnap = await db.collection('users').get();
    const totalInstalls = usersSnap.size;
    const activeUsers = usersSnap.docs.filter(d => d.data().status === 'active').length;
    res.json({ totalInstalls, activeUsers, status: 'ok' });
  } catch (e) {
    res.json({ totalInstalls: 0, activeUsers: 0, error: e.message });
  }
});

// ── Serve React frontend ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Admin server on port ${PORT}`));
