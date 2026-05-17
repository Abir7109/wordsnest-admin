import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env file if exists
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// User Experiences API
app.post("/api/experiences", async (req, res) => {
  try {
    if (!firestore) {
      return res.status(503).json({ error: "Database not available" });
    }
    const { name, experience, rating, device } = req.body;
    if (!experience) {
      return res.status(400).json({ error: "Experience text is required" });
    }
    const doc = await firestore.collection("experiences").add({
      name: name || "Anonymous",
      experience,
      rating: rating || 5,
      device: device || "",
      createdAt: Date.now(),
      approved: false
    });
    res.json({ id: doc.id, message: "Experience submitted!" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/experiences", async (req, res) => {
  try {
    if (!firestore) {
      return res.status(503).json({ error: "Database not available" });
    }
    const snap = await firestore.collection("experiences")
      .where("approved", "==", true)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: Get all experiences (including unapproved)
app.get("/api/admin/experiences", async (req, res) => {
  try {
    if (!firestore) {
      return res.status(503).json({ error: "Database not available" });
    }
    const snap = await firestore.collection("experiences")
      .orderBy("createdAt", "desc")
      .get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: Approve/Reject experience
app.patch("/api/admin/experiences/:id", async (req, res) => {
  try {
    if (!firestore) {
      return res.status(503).json({ error: "Database not available" });
    }
    const { approved } = req.body;
    await firestore.collection("experiences").doc(req.params.id).update({ approved });
    res.json({ message: "Updated" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;

// Firebase service account - try multiple sources
let serviceAccount = null;
console.log("FCM_SERVICE_ACCOUNT env var exists:", !!process.env.FCM_SERVICE_ACCOUNT);
console.log("FCM_SERVICE_ACCOUNT starts with:", process.env.FCM_SERVICE_ACCOUNT?.substring(0, 50));

// Source 1: Environment variable
if (process.env.FCM_SERVICE_ACCOUNT) {
  try {
    let fcmAccount = process.env.FCM_SERVICE_ACCOUNT;
    
    console.log("Full env var length:", fcmAccount.length);
    console.log("Checking for control characters...");
    
    // Check if there are actual newline characters (ASCII 10)
    const hasNewlines = fcmAccount.includes('\n');
    console.log("Has actual newlines:", hasNewlines);
    
    // Replace actual newlines with escaped version
    if (hasNewlines) {
      fcmAccount = fcmAccount.replace(/\n/g, '\\n').replace(/\r/g, '');
      console.log("After escaping newlines, length:", fcmAccount.length);
    }
    
    serviceAccount = JSON.parse(fcmAccount);
    console.log("✅ Loaded Firebase config from environment variable");
    console.log("Project ID:", serviceAccount.project_id);
    console.log("Client email:", serviceAccount.client_email);
  } catch (e) {
    console.log("❌ Failed to parse FCM_SERVICE_ACCOUNT:", e.message);
    console.log("JSON sample:", process.env.FCM_SERVICE_ACCOUNT.substring(1800, 1900));
  }
}

// Source 2: Local file (for development)
if (!serviceAccount) {
  const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    try {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      console.log("Loaded Firebase config from local file");
    } catch (e) {
      console.log("Failed to load from local file:", e.message);
    }
  }
}

// Source 3: Admin website project folder (alternative paths)
if (!serviceAccount) {
  const altPaths = [
    path.join(__dirname, '..', 'words-nest-firebase-adminsdk-fbsvc-4760102650.json'),
    path.join(__dirname, '..', '..', 'words-nest-firebase-adminsdk-fbsvc-4760102650.json'),
    path.join(process.cwd(), 'words-nest-firebase-adminsdk-fbsvc-4760102650.json'),
    'C:\\Users\\Abir\\Downloads\\words-nest-firebase-adminsdk-fbsvc-4760102650.json'
  ];
  
  for (const p of altPaths) {
    if (fs.existsSync(p)) {
      try {
        serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
        console.log("Loaded Firebase config from:", p);
        break;
      } catch (e) {
        console.log("Failed to load from:", p);
      }
    }
  }
}

// FCM token storage
const fcmTokens = new Map(); // userId -> token

console.log("=== SERVER STARTED ===");
console.log("GEMINI_API_KEY loaded:", GEMINI_API_KEY ? "YES (" + GEMINI_API_KEY.length + " chars)" : "NO");
console.log("GROQ_API_KEY loaded:", GROQ_API_KEY ? "YES (" + GROQ_API_KEY.length + " chars)" : "NO");
console.log("Firebase Service Account loaded:", !!serviceAccount);

// Initialize Firebase Admin for FCM
let messaging = null;
let firestore = null;

async function initFirebase() {
  try {
    const firebaseAdmin = await import('firebase-admin');
    const admin = firebaseAdmin.default || firebaseAdmin;
    
    let adminApp;
    
    if (serviceAccount && serviceAccount.private_key) {
      console.log("Using service account credential");
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.log("No valid service account, Firebase Admin unavailable");
      console.log("App config will use fallback mode (in-memory)");
      return;
    }
    
    messaging = adminApp.messaging();
    
    // Initialize Firestore
    firestore = admin.firestore();
    console.log("✅ Firebase Admin initialized - Firestore connected!");
  } catch (e) {
    console.log("Firebase Admin init failed:", e.message);
  }
}

initFirebase();

// Send push notification via FCM
async function sendPushNotification(token, title, body) {
  if (!messaging || !token) {
    console.log("Push: No messaging or token, skipping");
    return false;
  }
  
  try {
    const message = {
      notification: { title, body },
      token: token
    };
    await messaging.send(message);
    console.log("Push notification sent to:", token.substring(0, 20) + "...");
    return true;
  } catch (e) {
    console.log("Push notification failed:", e.message);
    return false;
  }
}

// Register FCM token
app.post("/api/register-fcm", (req, res) => {
  const { userId, fcmToken } = req.body;
  if (userId && fcmToken) {
    fcmTokens.set(userId, fcmToken);
    console.log("FCM token registered for:", userId);
  }
  res.json({ success: true });
});

// In-memory storage
const requestLogs = [];
const users = new Map(); // userId -> { id, guestId, firstSeen, lastActive, searchCount, status }

// Track users
function trackUser(userId, word) {
  if (!userId || userId === 'anonymous' || userId === 'unknown') return;
  
  const now = Date.now();
  const existing = users.get(userId);
  
  if (existing) {
    existing.lastActive = now;
    existing.searchCount = (existing.searchCount || 0) + 1;
    existing.status = 'active';
  } else {
    users.set(userId, {
      id: userId,
      guestId: userId,
      firstSeen: now,
      lastActive: now,
      searchCount: 1,
      status: 'active'
    });
  }
  
  // Mark inactive users (not seen in 5 minutes)
  users.forEach((user, id) => {
    if (now - user.lastActive > 5 * 60 * 1000 && user.status === 'active') {
      user.status = 'inactive';
    }
  });
}

function logRequest(word, userId, status) {
  const userID = userId || 'anonymous';
  trackUser(userID, word);
  
  requestLogs.unshift({
    id: Date.now().toString(),
    word: word.toLowerCase(),
    userId: userID,
    guestId: userID,
    timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
    status: status ? 'Success' : 'Error',
    time: Math.floor(Math.random() * 100 + 50) + 'ms'
  });
  // Keep only last 100 logs
  if (requestLogs.length > 100) requestLogs.pop();
}

// Get users data
function getUsersData() {
  return Array.from(users.values()).sort((a, b) => b.lastActive - a.lastActive);
}

// Simple Bangla dictionary
const banglaDict = {
  "hello": "নমস্কার", "world": "পৃথিবী", "love": "ভালোবাসা", "friend": "বন্ধু",
  "good": "ভালো", "bad": "খারাপ", "happy": "খুশি", "beautiful": "সুন্দর",
  "time": "সময়", "water": "পানি", "food": "খাবার", "day": "দিন", "night": "রাত"
};

function getBanglaMeaning(word) {
  return banglaDict[word.toLowerCase()] || "অর্থ অনুপলব্ধ";
}

// Analyze endpoint
async function analyzeHandler(req, res) {
  const word = req.method === 'POST' ? req.body?.word : req.query?.word;
  
  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  try {
    // Use Free Dictionary API
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const apiRes = await fetch(url);
    
    let phonetic = "";
    let english = "";
    let partsOfSpeech = [];
    let synonyms = [];
    let antonyms = [];
    let simple = "";
    let compound = "";
    let complex = "";
    
    if (apiRes.ok) {
      const data = await apiRes.json();
      const entry = data[0];
      const meanings = entry.meanings || [];
      
      phonetic = entry.phonetic || (entry.phonetics?.[0]?.text) || "";
      english = meanings[0]?.definitions?.[0]?.definition || "No definition available";
      
      partsOfSpeech = meanings.slice(0, 3).map(m => ({
        type: m.partOfSpeech || "Unknown",
        definition: m.definitions?.[0]?.definition || ""
      }));
      
      // Get synonyms/antonyms from dictionary
      for (const m of meanings) {
        synonyms = [...synonyms, ...(m.synonyms || []).slice(0, 3)];
        antonyms = [...antonyms, ...(m.antonyms || []).slice(0, 3)];
      }
      synonyms = [...new Set(synonyms)].slice(0, 5);
      antonyms = [...new Set(antonyms)].slice(0, 5);
      
      // Get example sentences
      for (const m of meanings) {
        for (const def of m.definitions || []) {
          if (def.example) { simple = def.example; break; }
        }
        if (simple) break;
      }
    }

    // If no synonyms/antonyms/sentences, use IELTS AI (Groq - Free!)
    const needsAI = synonyms.length === 0 || antonyms.length === 0 || !simple;
    console.log("needsAI:", needsAI, "Groq keys available:", (GROQ_API_KEY ? 1 : 0) + (GROQ_API_KEY_2 ? 1 : 0));
    
    const groqKeys = [GROQ_API_KEY, GROQ_API_KEY_2].filter(k => k && k.length > 10);
    
    if (needsAI && groqKeys.length > 0) {
      for (const groqKey of groqKeys) {
        try {
          console.log("Calling Groq AI for:", word);
          
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
              "Authorization": "Bearer " + groqKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: [{ 
                role: "user", 
                content: `You are an IELTS vocabulary teacher. For "${word}" (${english}), provide JSON: {"synonyms":[],"antonyms":[],"simple":"","compound":"","complex":""}`
              }],
              temperature: 0.7,
              response_format: { type: "json_object" }
            })
          });
          
          console.log("AI response status:", response.status);
          
          if (response.ok) {
            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || "";
            console.log("AI response:", text.substring(0, 200));
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
              const aiData = JSON.parse(match[0]);
              console.log("AI parsed data:", aiData);
              if (synonyms.length === 0 && aiData.synonyms) synonyms = aiData.synonyms.slice(0, 5);
              if (antonyms.length === 0 && aiData.antonyms) antonyms = aiData.antonyms.slice(0, 3);
              if (!simple && aiData.simple) simple = aiData.simple;
              if (aiData.compound) compound = aiData.compound;
              if (aiData.complex) complex = aiData.complex;
              break; // Success
            }
          }
        } catch (e) {
          console.log("AI failed:", e.message);
        }
      }
    } else {
      console.log("Skipping AI - no Groq keys");
    }

    const result = {
      word: word,
      phonetic: phonetic,
      meaning: {
        english: english || "No definition available",
        bangla: getBanglaMeaning(word)
      },
      partsOfSpeech,
      synonyms,
      antonyms,
      sentences: {
        simple: simple || "Tap Generate for AI synonyms & sentences",
        compound: "Tap Generate for AI synonyms & sentences",
        complex: "Tap Generate for AI synonyms & sentences"
      }
    };

    // Log the search
    const userIdFromRequest = req.body?.user_id || req.body?.userID || req.query?.user_id || req.query?.userID || null;
    console.log("User ID from request:", userIdFromRequest);
    logRequest(word, userIdFromRequest, true);
    console.log("Result for", word);
    return res.json(result);
  } catch (error) {
    const userIdFromRequest = req.body?.user_id || req.body?.userID || req.query?.user_id || req.query?.userID || null;
    logRequest(word, userIdFromRequest, false);
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to analyze: " + error.message });
  }
}

// Generate endpoint - AI only
async function generateHandler(req, res) {
  const word = req.method === 'POST' ? req.body?.word : req.query?.word;
  const userIdFromRequest = req.body?.user_id || req.query?.user_id || "unknown";
  const forceFallback = req.query?.force === "true" || req.body?.force === true;
  
  console.log("=== GENERATE ENDPOINT CALLED (UPDATED) ===");
  console.log("Word:", word, "UserID:", userIdFromRequest, "ForceFallback:", forceFallback);
  console.log("API Key exists:", !!GEMINI_API_KEY, "Key length:", GEMINI_API_KEY?.length);
  
  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  try {
    // Get base from Free Dictionary first
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const apiRes = await fetch(url);
    
    let meaning = { english: "No definition available", bangla: getBanglaMeaning(word) };
    let partsOfSpeech = [];
    
    if (apiRes.ok) {
      const data = await apiRes.json();
      const meanings = data[0]?.meanings || [];
      meaning.english = meanings[0]?.definitions?.[0]?.definition || "No definition available";
      partsOfSpeech = meanings.slice(0, 3).map(m => ({
        type: m.partOfSpeech || "Unknown",
        definition: m.definitions?.[0]?.definition || ""
      }));
    }

    // Use Groq AI for synonyms/sentences - IELTS Professional (Free!)
    let synonyms = [], antonyms = [], simple = "", compound = "", complex = "";
    
    const groqKeys = [GROQ_API_KEY, GROQ_API_KEY_2].filter(k => k && k.length > 10);
    console.log("Available Groq keys:", groqKeys.length);
    
    for (const groqKey of groqKeys) {
      console.log("Trying Groq with key:", groqKey.substring(0, 10) + "...");
      try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { 
            "Authorization": "Bearer " + groqKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [{ 
              role: "user", 
              content: `You are an experienced IELTS vocabulary teacher. For the word "${word}", provide 5 synonyms, 3 antonyms, 1 simple sentence, 1 compound sentence, 1 complex sentence. Return ONLY valid JSON: {"synonyms":["w1","w2","w3","w4","w5"],"antonyms":["a1","a2","a3"],"simple":"sentence","compound":"sentence","complex":"sentence"}`
            }],
            temperature: 0.7,
            response_format: { type: "json_object" }
          })
        });
        
        console.log("Groq response status:", groqResponse.status);
        
        if (groqResponse.ok) {
          const groqData = await groqResponse.json();
          const groqText = groqData.choices?.[0]?.message?.content || "";
          console.log("Groq response:", groqText.substring(0, 200));
          
          const match = groqText.match(/\{[\s\S]*\}/);
          if (match) {
            const aiData = JSON.parse(match[0]);
            console.log("Groq parsed data:", aiData);
            synonyms = aiData.synonyms?.slice(0, 5) || [];
            antonyms = aiData.antonyms?.slice(0, 3) || [];
            simple = aiData.simple || "";
            compound = aiData.compound || "";
            complex = aiData.complex || "";
            break; // Success, exit loop
          }
        } else {
          const groqErrText = await groqResponse.text();
          console.log("Groq error response:", groqErrText.substring(0, 200));
        }
      } catch (groqErr) {
        console.log("Groq failed:", groqErr.message);
      }
    }

// If AI failed, return error message
    if (synonyms.length === 0 || simple === "") {
      console.log("AI failed for:", word, "- groqKeys available:", groqKeys.length);
      const result = {
        _version: "v2-updated",
        word: word,
        phonetic: "",
        meaning: meaning,
        partsOfSpeech: partsOfSpeech,
        synonyms: [],
        antonyms: [],
        sentences: {
          simple: "AI is busy, please try again in a moment",
          compound: "AI is busy, please try again in a moment",
          complex: "AI is busy, please try again in a moment"
        },
        aiError: true,
        debug: { groqKeysAvailable: groqKeys.length }
      };
      const userIdFromRequest = req.body?.user_id || req.query?.user_id || "unknown";
      logRequest(word, userIdFromRequest, false);
      return res.json(result);
    }

    const result = {
      _version: "v2-updated",
      word: word,
      phonetic: "",
      meaning: meaning,
      partsOfSpeech: partsOfSpeech,
      synonyms,
      antonyms,
      sentences: {
        simple: simple,
        compound: compound,
        complex: complex
      }
    };

    console.log("Generated for", word, "- synonyms:", synonyms.length, "antonyms:", antonyms.length, "simple:", simple?.substring(0, 50));
    const userIdFromRequest = req.body?.user_id || req.query?.user_id || "unknown";
    logRequest(word, userIdFromRequest, true);
    return res.json(result);
  } catch (error) {
    console.log("Generate endpoint error:", error.message);
    const userIdFromRequest = req.body?.user_id || req.query?.user_id || "unknown";
    logRequest(word, userIdFromRequest, false);
    res.status(500).json({ error: "Failed to generate: " + error.message, debug: { synonyms, antonyms, simple, GEMINI_API_KEY: !!GEMINI_API_KEY } });
  }
}

// Debug endpoint to verify deployment - UPDATED 2024
app.get("/api/debug", (req, res) => {
  res.json({ 
    message: "Server is running UPDATED code v2",
    timestamp: new Date().toISOString(),
    apiKeyLength: GEMINI_API_KEY?.length,
    apiKeyPrefix: GEMINI_API_KEY?.substring(0, 5)
  });
});

// Test AI endpoint
app.get("/api/test-ai", async (req, res) => {
  const word = req.query?.word || "beautiful";
  console.log("=== TEST AI ENDPOINT ===");
  console.log("API Key:", GEMINI_API_KEY?.substring(0, 10) + "...");
  
  try {
    const prompt = `For the word "${word}", return JSON with 5 synonyms and 3 antonyms: {"synonyms":["a"],"antonyms":["b"]}`;
    
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    
    console.log("Test AI response status:", response.status);
    const data = await response.json();
    console.log("Test AI response:", JSON.stringify(data).substring(0, 500));
    
    res.json({ status: response.status, data: data });
  } catch (e) {
    console.log("Test AI error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get logs endpoint with users data
app.get("/api/get-logs", (req, res) => {
  const usersList = getUsersData();
  const activeCount = usersList.filter(u => u.status === 'active').length;
  const inactiveCount = usersList.filter(u => u.status === 'inactive').length;
  
  res.json({ 
    logs: requestLogs,
    users: usersList,
    stats: {
      totalUsers: usersList.length,
      activeUsers: activeCount,
      inactiveUsers: inactiveCount,
      totalSearches: requestLogs.length
    }
  });
});

// User ping endpoint - keep user active
app.post("/api/ping", (req, res) => {
  const { userId } = req.body;
  if (userId) {
    trackUser(userId, '');
  }
  res.json({ success: true });
});

// In-memory notifications
const notifications = []; // { id, title, message, targetUsers: null | string[], createdAt, sentBy }

// Get notifications for a user
app.get("/api/notifications", (req, res) => {
  const userId = req.query?.userId;
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }
  
  const userNotifications = notifications
    .filter(n => !n.targetUsers || n.targetUsers.includes(userId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      createdAt: n.createdAt,
      isRead: n.readBy?.includes(userId) || false
    }));
  
  res.json({ 
    notifications: userNotifications,
    unreadCount: userNotifications.filter(n => !n.isRead).length
  });
});

// Mark notification as read
app.post("/api/notifications/read", (req, res) => {
  const { notificationId, userId } = req.body;
  const notif = notifications.find(n => n.id === notificationId);
  if (notif && userId) {
    if (!notif.readBy) notif.readBy = [];
    if (!notif.readBy.includes(userId)) {
      notif.readBy.push(userId);
    }
  }
  res.json({ success: true });
});

// Admin: Send notification
app.post("/api/admin/send-notification", (req, res) => {
  const { title, message, targetUsers, sentBy } = req.body;
  
  if (!title || !message) {
    return res.status(400).json({ error: "Title and message required" });
  }
  
  const newNotif = {
    id: Date.now().toString(),
    title,
    message,
    targetUsers: targetUsers || null, // null = all users
    createdAt: Date.now(),
    sentBy: sentBy || "Admin",
    readBy: []
  };
  
  notifications.unshift(newNotif);
  
  // Keep only last 100 notifications
  if (notifications.length > 100) notifications.pop();
  
  // Send push notifications
  const pushPromises = [];
  if (targetUsers === null) {
    // Send to all users with tokens
    fcmTokens.forEach((token, userId) => {
      pushPromises.push(sendPushNotification(token, title, message));
    });
  } else if (Array.isArray(targetUsers)) {
    // Send to specific users
    targetUsers.forEach(userId => {
      const token = fcmTokens.get(userId);
      if (token) {
        pushPromises.push(sendPushNotification(token, title, message));
      }
    });
  }
  
  // Wait for push notifications to send
  Promise.all(pushPromises).catch(e => console.log("Push send error:", e.message));
  
  console.log("Notification sent:", title, "to:", targetUsers || "all users", "push sent:", pushPromises.length);
  
  res.json({ success: true, notification: newNotif, pushSent: pushPromises.length });
});

// Admin: Get all notifications
app.get("/api/admin/notifications", (req, res) => {
  const adminNotifications = notifications
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      targetUsers: n.targetUsers,
      createdAt: n.createdAt,
      sentBy: n.sentBy,
      recipientCount: n.targetUsers ? n.targetUsers.length : 'all'
    }));
  
  res.json({ notifications: adminNotifications });
});

// Register user on first app open
app.post("/api/register", (req, res) => {
  const { userId, deviceInfo } = req.body;
  if (userId) {
    trackUser(userId, '');
    console.log("User registered:", userId);
  }
  res.json({ success: true, userId });
});

// App Config - Firestore
const APP_CONFIG_COLLECTION = "current_version";

app.get("/api/app-config", async (req, res) => {
  try {
    if (firestore) {
      // Try to get document by known ID first
      const doc = await firestore.collection(APP_CONFIG_COLLECTION).doc("config").get();
      if (doc.exists && doc.data()) {
        console.log("App config loaded from Firestore (doc: config)");
        return res.json({ config: doc.data() });
      }
      
      // Try to get the first document in the collection
      const snapshot = await firestore.collection(APP_CONFIG_COLLECTION).limit(1).get();
      if (!snapshot.empty) {
        const firstDoc = snapshot.docs[0];
        console.log("App config loaded from Firestore (doc:", firstDoc.id, ")");
        return res.json({ config: firstDoc.data() });
      }
      
      // No documents found - create default
      console.log("No app config found in Firestore, using defaults");
    }
    
    // Fallback to default if Firestore not available or no documents
    const defaultConfig = {
      current_version: "1.0.0",
      min_required_version: "1.0.0",
      force_update: false,
      soft_update: false,
      update_url: "",
      update_message: "A new version is available!",
      under_maintenance: false,
      maintenance_title: "Under Maintenance",
      maintenance_message: "We'll be back soon!",
      maintenance_estimated_time: "",
      is_app_alive: true
    };
    res.json({ config: defaultConfig });
  } catch (e) {
    console.log("Error loading app config:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/app-config", async (req, res) => {
  const { config } = req.body;
  if (!config) {
    return res.status(400).json({ error: "Config required" });
  }
  
  console.log("📝 Saving config to Firestore:", JSON.stringify(config));
  
  try {
    if (firestore) {
      const docRef = firestore.collection(APP_CONFIG_COLLECTION).doc("config");
      await docRef.set(config, { merge: true });
      console.log("✅ App config SAVED to Firestore - under_maintenance:", config.under_maintenance);
      return res.json({ success: true, config });
    } else {
      console.log("❌ Firestore not available, config not saved");
      return res.status(503).json({ error: "Firestore not available" });
    }
  } catch (e) {
    console.log("❌ Error saving app config:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Install Analytics - Get install stats from Firestore
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), firestore: !!firestore });
});

app.get("/api/install-analytics-v2", async (req, res) => {
  console.log("📊 v2 called");
  return res.json({ test: "v2 works", total: 999 });
});

app.get("/api/install-analytics-new", async (req, res) => {
  // Simple test without any Firestore calls
  return res.json({ status: "new endpoint works", now: Date.now() });
});

app.get("/api/install-analytics", async (req, res) => {
  try {
    const now = Date.now();
    const thirtySecAgo = now - (30 * 1000);
    const oneHourAgo = now - (60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const installsSnap = await firestore.collection("installs").get();
    const usersSnap = await firestore.collection("users").get();
    
    const users = usersSnap.docs.map(d => d.data());
    
    const activeUsers = users.filter(u => (u.last_active || 0) >= thirtySecAgo).length;
    const uninstalls = users.filter(u => now - (u.last_active || 0) > sevenDaysAgo).length;

    // Build lists for each category
    const activeUsersList = users.filter(u => (u.last_active || 0) >= thirtySecAgo);
    const uninstalledUsersList = users.filter(u => now - (u.last_active || 0) > sevenDaysAgo);

    res.json({
      totalInstalls: installsSnap.size,
      activeUsers,
      uninstalls,
      recentInstalls: installsSnap.docs.slice(0, 10).map(d => ({ id: d.id, ...d.data() })),
      activeUsersList: activeUsersList.map(u => ({ user_id: u.user_id || u.id, app_version: u.app_version, device_model: u.device_model, last_active: u.last_active, install_date: u.install_date })),
      uninstalledUsersList: uninstalledUsersList.map(u => ({ user_id: u.user_id || u.id, app_version: u.app_version, device_model: u.device_model, last_active: u.last_active, install_date: u.install_date })),
      allInstallsList: installsSnap.docs.map(d => ({ user_id: d.data().user_id, app_version: d.data().app_version, device_model: d.data().device_model, install_date: d.data().install_date }))
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Debug endpoint - mirror of test-firestore for comparison
app.get("/api/debug-installs", async (req, res) => {
  console.log("🔍 /api/debug-installs called");
  try {
    if (!firestore) {
      return res.json({ error: "Firestore not connected" });
    }
    const installsSnap = await firestore.collection("installs").get();
    console.log("  Installs found:", installsSnap.size);
    res.json({ count: installsSnap.size });
  } catch (e) {
    console.log("  Error:", e.message);
    res.json({ error: e.message });
  }
});

// Debug endpoint - check Firebase status
app.get("/api/debug-firebase", (req, res) => {
  res.json({
    firebaseAdmin: !!serviceAccount,
    firestore: !!firestore,
    messaging: !!messaging,
    serviceAccountLoaded: !!serviceAccount,
    serviceAccountProject: serviceAccount?.project_id || null
  });
});

// Debug - test Firestore connection
app.get("/api/test-firestore", async (req, res) => {
  if (!firestore) {
    return res.json({ error: "Firestore not connected" });
  }
  
  try {
    const installsSnap = await firestore.collection("installs").get();
    const usersSnap = await firestore.collection("users").get();
    
    res.json({
      installsCount: installsSnap.size,
      usersCount: usersSnap.size,
      installs: installsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Register routes
app.post("/api/analyze", analyzeHandler);
app.get("/api/analyze", analyzeHandler);
app.post("/api/generate", generateHandler);
app.get("/api/generate", generateHandler);

// Static files for frontend
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} - VERSION: ${new Date().toISOString()}`);
});