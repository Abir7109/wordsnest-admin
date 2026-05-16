import express, { Request, Response } from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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
 * Includes 7-day Word Cache Optimization.
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

    // 2. Call Gemini AI
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the word: "${word}".`,
      config: {
        systemInstruction: `You are a high-level linguistic analysis AI for the 'Words Nest' application. 
Return a deeply structured JSON object for the requested word.

SCHEMA (MUST EXACTLY FOLLOW THIS):
{
  "meaning": { "english": string, "bangla": string },
  "partsOfSpeech": [{ "type": string, "form": string }],
  "synonyms": string[],
  "antonyms": string[],
  "sentences": { "simple": string, "compound": string, "complex": string }
}

Constraints:
- "meaning.english": Provide clear English definition
- "meaning.bangla": Provide Bangla/Bengali translation and definition
- "partsOfSpeech": List up to 3 different parts of speech
- "synonyms": 5 high-quality synonyms
- "antonyms": 5 high-quality antonyms  
- "sentences.simple": A simple sentence (one independent clause)
- "sentences.compound": A compound sentence (two independent clauses)
- "sentences.complex": A complex sentence (one independent + one dependent clause)

Return ONLY valid JSON. No explanations.`,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    const result = JSON.parse(text);

    const transformedResult = {
      meaning: {
        english: result.meaning?.english || result.meaning?.definition || "No definition available",
        bangla: result.meaning?.bangla || "কোনো সংজ্ঞা পাওয়া যায়নি"
      },
      partsOfSpeech: Array.isArray(result.partsOfSpeech) 
        ? result.partsOfSpeech.map((pos: any) => ({
            type: pos.type || pos.pos || "Unknown",
            form: pos.form || pos.definition || ""
          }))
        : [],
      synonyms: Array.isArray(result.synonyms) ? result.synonyms.slice(0, 5) : [],
      antonyms: Array.isArray(result.antonyms) ? result.antonyms.slice(0, 5) : [],
      sentences: {
        simple: result.sentences?.simple || "No example available",
        compound: result.sentences?.compound || "",
        complex: result.sentences?.complex || ""
      }
    };

    // 3. Store in Cache
    if (adminDb) {
      await adminDb.collection('wordCache').doc(word.toLowerCase()).set({
        result: transformedResult,
        cachedAt: Date.now()
      });

      await adminDb.collection('requests').add({
        word,
        userID: userID || 'anonymous',
        timestamp: timestamp || new Date().toISOString(),
        status: 'Success'
      });
    }

    res.json(transformedResult);
  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: "Failed to analyze word" });
  }
});

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