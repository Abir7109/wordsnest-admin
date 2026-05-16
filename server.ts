import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

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
  // The user will provide these via environment variables or service account JSON.
  let adminDb: any = null;
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      const admin = await import("firebase-admin");
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      }
      adminDb = admin.firestore();
      console.log("Firebase Admin initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize Firebase Admin:", err);
    }
  }

  // --- API Routes ---

  /**
   * /api/analyze: The core linguistic analysis endpoint used by the Android app.
   * Includes 7-day Word Cache Optimization as requested in STEP 9.
   * 
   * RESPONSE SCHEMA (matches Android app):
   * {
   *   "meaning": { "english": string, "bangla": string },
   *   "partsOfSpeech": [{ "type": string, "form": string }],
   *   "synonyms": string[],
   *   "antonyms": string[],
   *   "sentences": { "simple": string, "compound": string, "complex": string }
   * }
   */
  app.post("/api/analyze", async (req, res) => {
    const { word, userID, timestamp } = req.body;
    
    if (!word) {
      return res.status(400).json({ error: "Word is required" });
    }

    try {
      // 1. Check Cache (Step 9)
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

      // 2. Call Gemini AI - Requesting response in the format Android app expects
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
- "partsOfSpeech": List up to 3 different parts of speech (e.g., Noun, Adjective, Verb)
- "synonyms": 5 high-quality synonyms
- "antonyms": 5 high-quality antonyms  
- "sentences.simple": A simple sentence (one independent clause)
- "sentences.compound": A compound sentence (two independent clauses joined by conjunction)
- "sentences.complex": A complex sentence (one independent + one dependent clause)

Return ONLY valid JSON. No explanations.`,
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      
      // Parse the response and ensure it matches our schema
      const result = JSON.parse(text);

      // Transform the response to exactly match Android app schema
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
          simple: result.sentences?.simple || result.sentences?.academic?.[0] || "No example available",
          compound: result.sentences?.compound || result.sentences?.academic?.[1] || "",
          complex: result.sentences?.complex || result.sentences?.colloquial?.[0] || ""
        }
      };

      // 3. Store in Cache (Step 9) & Log Request
      if (adminDb) {
        await adminDb.collection('wordCache').doc(word.toLowerCase()).set({
          result: transformedResult,
          cachedAt: Date.now()
        });

        // Log the request
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
   * /api/notify: Push notification endpoint for administrative triggers.
   */
  app.post("/api/notify", async (req, res) => {
    const { title, body, token, userId } = req.body;

    if (!adminDb) {
      return res.status(503).json({ error: "FCM service not configured (Firebase Admin missing)" });
    }

    try {
      const admin = await import("firebase-admin");
      let targetToken = token;

      // If no token is provided but a userId is, try to find the token in Firestore
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

  // Legacy search alias for backward compatibility with current dev UI
  app.post("/api/dictionary/search", (req, res) => {
    res.redirect(307, "/api/analyze");
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Words Nest Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup error:", err);
  process.exit(1);
});