import { GoogleGenAI } from "@google/genai";
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
let db = null;
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = getFirestore();
    console.log("Firebase Admin initialized");
  }
} catch (e) {
  console.log("Firebase Admin not available:", e.message);
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Get userID from query or header
  const userID = request.query?.userID || request.headers?.['x-user-id'] || 'anonymous';
  let word = null;
  
  if (request.method === 'GET' && request.query?.word) {
    word = request.query.word;
  } else if (request.method === 'POST' && request.body) {
    if (typeof request.body === 'string') {
      try {
        word = JSON.parse(request.body).word;
      } catch (e) {}
    } else {
      word = request.body.word;
    }
  }

  console.log("Request:", word, "from user:", userID);

  if (!word) {
    return response.status(400).json({ error: "Word is required" });
  }

  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      throw new Error("Word not found");
    }
    
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No data");
    }

    const entry = data[0];
    const meanings = entry.meanings || [];
    
    let english = "No definition available";
    if (meanings[0]?.definitions?.[0]) {
      english = meanings[0].definitions[0].definition;
    }
    
    const partsOfSpeech = meanings.slice(0, 3).map(m => ({
      type: m.partOfSpeech || "Unknown",
      form: m.definitions?.[0]?.definition || ""
    }));
    
    const synonyms = [...new Set(meanings.flatMap(m => (m.synonyms || []).slice(0, 3)))].slice(0, 5);
    const antonyms = [...new Set(meanings.flatMap(m => (m.antonyms || []).slice(0, 3)))].slice(0, 5);

    let simple = "No example available";
    for (const m of meanings) {
      for (const def of (m.definitions || [])) {
        if (def.example) { simple = def.example; break; }
      }
      if (simple !== "No example available") break;
    }

    const result = {
      meaning: { english, bangla: getBanglaMeaning(word) },
      partsOfSpeech,
      synonyms,
      antonyms,
      sentences: {
        simple,
        compound: simple + " It is commonly used in daily conversations.",
        complex: "When studying vocabulary, " + word + " is an important word to learn."
      }
    };

    // Log to Firestore
    if (db) {
      await db.collection('requests').add({
        word: word.toLowerCase(),
        userID: userID,
        timestamp: new Date().toISOString(),
        status: 'Success',
        source: 'android-app'
      });
      console.log("Logged to Firestore:", word, userID);
    }

    response.json(result);
  } catch (error) {
    console.error("Error:", error.message);
    
    // Log failed request
    if (db) {
      await db.collection('requests').add({
        word: word.toLowerCase(),
        userID: userID,
        timestamp: new Date().toISOString(),
        status: 'Failed',
        error: error.message,
        source: 'android-app'
      }).catch(e => console.log("Failed to log:", e.message));
    }
    
    response.status(500).json({ error: "Failed to find word: " + error.message });
  }
}

function getBanglaMeaning(word) {
  const basic = {
    "hello": "নমস্কার", "world": "পৃথিবী", "love": "ভালোবাসা", "friend": "বন্ধু",
    "good": "ভালো", "bad": "খারাপ", "happy": "খুশি", "beautiful": "সুন্দর",
    "time": "সময়", "water": "পানি", "food": "খাবার", "day": "দিন", "night": "রাত"
  };
  return basic[word.toLowerCase()] || "অর্থ অনুপলব্ধ";
}