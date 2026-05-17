import express, { Request, Response } from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(cors());
app.use(express.json());

// Initialize Gemini AI only if API key is available
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  console.log("Gemini AI initialized");
} else {
  console.log("Gemini API key not set - using Free Dictionary API only");
}

// --- Firebase Admin Initialization ---
let adminDb: any = null;
async function initFirebase() {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      const admin = await import("firebase-admin");
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
      }
      adminDb = admin.firestore();
      console.log("Firebase Admin initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize Firebase Admin:", err);
    }
  }
}

initFirebase();

// --- API Routes ---

/**
 * /api/analyze: The core linguistic analysis endpoint used by the Android app.
 * Uses Free Dictionary API + Groq for AI enhancement
 */
app.post("/api/analyze", async (req: Request, res: Response) => {
  const { word, userID, timestamp } = req.body;
  
  if (!word) {
    return res.status(400).json({ error: "Word is required" });
  }

  try {
    // 1. Check Cache
    if (adminDb) {
      const cacheDoc = await adminDb.collection('wordCache').doc(word.toLowerCase()).get();
      if (cacheDoc.exists) {
        const data = cacheDoc.data();
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        if (data.cachedAt && data.cachedAt > sevenDaysAgo) {
          console.log(`Cache hit for word: ${word}`);
          return res.json(data.result);
        }
      }
    }

    // 2. Use Free Dictionary API (no key needed)
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const apiRes = await fetch(url);
    
    if (!apiRes.ok) {
      throw new Error("Word not found in dictionary");
    }
    
    const data = await apiRes.json();
    const entry = data[0];
    const meanings = entry.meanings || [];
    
    const phonetic = entry.phonetic || (entry.phonetics?.[0]?.text) || "";
    const english = meanings[0]?.definitions?.[0]?.definition || "No definition available";
    
    const partsOfSpeech = meanings.slice(0, 3).map((m: any) => ({
      type: m.partOfSpeech || "Unknown",
      definition: m.definitions?.[0]?.definition || ""
    }));
    
    // Get synonyms/antonyms from dictionary
    let synonyms: string[] = [];
    let antonyms: string[] = [];
    for (const m of meanings) {
      synonyms = [...synonyms, ...(m.synonyms || []).slice(0, 3)];
      antonyms = [...antonyms, ...(m.antonyms || []).slice(0, 3)];
    }
    synonyms = [...new Set(synonyms)].slice(0, 5);
    antonyms = [...new Set(antonyms)].slice(0, 5);
    
    // Get example sentences
    let simple = "No example available";
    for (const m of meanings) {
      for (const def of m.definitions || []) {
        if (def.example) { simple = def.example; break; }
      }
      if (simple !== "No example available") break;
    }

    const result = {
      word: word,
      phonetic: phonetic,
      meaning: {
        english,
        bangla: getBanglaMeaning(word)
      },
      partsOfSpeech,
      synonyms,
      antonyms,
      sentences: {
        simple,
        compound: simple + " It is commonly used in daily conversations.",
        complex: "When studying vocabulary, " + word + " is an important word to learn."
      }
    };

    // Cache result
    if (adminDb) {
      await adminDb.collection('wordCache').doc(word.toLowerCase()).set({
        result,
        cachedAt: Date.now()
      });
      
      await adminDb.collection('requests').add({
        word: word.toLowerCase(),
        userID: userID || 'anonymous',
        timestamp: timestamp || new Date().toISOString(),
        status: 'Success'
      });
    }

    return res.json(result);
  } catch (error: any) {
    console.error("Error:", error.message);
    
    if (adminDb) {
      await adminDb.collection('requests').add({
        word: word.toLowerCase(),
        userID: userID || 'anonymous',
        timestamp: timestamp || new Date().toISOString(),
        status: 'Failed',
        error: error.message
      });
    }
    
    res.status(500).json({ error: "Failed to analyze: " + error.message });
  }
});

// Simple Bangla dictionary
function getBanglaMeaning(word: string): string {
  const dict: Record<string, string> = {
    "hello": "নমস্কার", "world": "পৃথিবী", "love": "ভালোবাসা", "friend": "বন্ধু",
    "good": "ভালো", "bad": "খারাপ", "happy": "খুশি", "beautiful": "সুন্দর",
    "time": "সময়", "water": "পানি", "food": "খাবার", "day": "দিন", "night": "রাত"
  };
return dict[word.toLowerCase()] || "অর্থ অনুপলব্ধ";
}

/**
 * /api/notify: Push notification endpoint
 */
app.post("/api/notify", async (req: Request, res: Response) => {
  const { title, body, token, userId } = req.body;

  if (!adminDb) {
    return res.status(503).json({ error: "FCM service not configured" });
  }

  try {
    const admin = await import("firebase-admin");
    let targetToken = token;

    if (!targetToken && userId) {
      const userDoc = await adminDb.collection('users').doc(userId).get();
      if (userDoc.exists) {
        targetToken = userDoc.data().fcmToken;
      }
    }

    if (!targetToken) {
      return res.status(400).json({ error: "Target FCM token or valid userId is required" });
    }

    const message = {
      notification: { title, body },
      token: targetToken,
    };

    await admin.messaging().send(message);
    res.json({ success: true, messageId: "sent" });
  } catch (error) {
    console.error("Notification Error:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

app.post("/api/dictionary/search", (req: Request, res: Response) => {
  res.redirect(307, "/api/analyze");
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then(vite => {
    app.use(vite.middlewares);
  });
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Vercel serverless export
export default app;