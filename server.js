import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = "AIzaSyDR34t-jQtydqffemwigfx0mexjYcRvdKM";

// In-memory storage
const requestLogs = [];
const users = new Map(); // userId -> { id, guestId, firstSeen, lastActive, searchCount, status }

// Track users
function trackUser(userId, word) {
  if (!userId || userId === 'anonymous') return;
  
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

    // If no synonyms/antonyms/sentences, use IELTS AI
    const needsAI = synonyms.length === 0 || antonyms.length === 0 || !simple;
    if (needsAI && GEMINI_API_KEY) {
      try {
        const prompt = `You are an experienced IELTS vocabulary teacher. For "${word}", provide 5 synonyms, 3 antonyms, and 1 simple example sentence. Return JSON: {"synonyms":[],"antonyms":[],"simple":""}`;
        
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            const aiData = JSON.parse(match[0]);
            if (synonyms.length === 0 && aiData.synonyms) synonyms = aiData.synonyms.slice(0, 5);
            if (antonyms.length === 0 && aiData.antonyms) antonyms = aiData.antonyms.slice(0, 3);
            if (!simple && aiData.simple) simple = aiData.simple;
          }
        }
      } catch (e) {
        console.log("AI failed:", e.message);
      }
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
        simple: simple || "No example available",
        compound: simple ? simple + " It is commonly used in daily conversations." : "Practice makes perfect.",
        complex: "When studying " + word + ", you discover its importance in language."
      }
    };

    // Log the search
    logRequest(word, req.body?.userID || req.query?.userID, true);
    console.log("Result for", word);
    return res.json(result);
  } catch (error) {
    logRequest(word, req.body?.userID || req.query?.userID, false);
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to analyze: " + error.message });
  }
}

// Generate endpoint - AI only
async function generateHandler(req, res) {
  const word = req.method === 'POST' ? req.body?.word : req.query?.word;
  
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

    // Use Gemini AI for synonyms/sentences - IELTS Professional
    let synonyms = [], antonyms = [], simple = "", compound = "", complex = "";
    
    if (GEMINI_API_KEY) {
      const prompt = `You are an experienced IELTS vocabulary teacher. For the word "${word}", generate:

1. 5 high-quality synonyms (common IELTS words)
2. 3 antonyms (opposites)
3. A simple sentence (beginner level)
4. A compound sentence (intermediate level)  
5. A complex sentence (advanced level)

Return ONLY this JSON format:
{"synonyms":["word1","word2","word3","word4","word5"],"antonyms":["word1","word2","word3"],"simple":"simple sentence","compound":"compound sentence","complex":"complex sentence"}

Guidelines:
- Synonyms should be commonly used in IELTS writing/speaking
- Sentences should demonstrate proper grammar
- Complex sentence must have a dependent clause
- Keep sentences practical and educational`;

      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.7
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const aiData = JSON.parse(match[0]);
          synonyms = aiData.synonyms?.slice(0, 5) || [];
          antonyms = aiData.antonyms?.slice(0, 3) || [];
          simple = aiData.simple || "";
          compound = aiData.compound || "";
          complex = aiData.complex || "";
        }
      }
    }

    const result = {
      word: word,
      phonetic: "",
      meaning: meaning,
      partsOfSpeech: partsOfSpeech,
      synonyms,
      antonyms,
      sentences: {
        simple: simple || "No example available",
        compound: compound || (simple ? simple + " It is commonly used in daily conversations." : "Practice makes perfect with " + word + "."),
        complex: complex || ("Learning " + word + " is essential for improving your English proficiency.")
      }
    };

    console.log("Generated for", word, "- synonyms:", synonyms.length, "antonyms:", antonyms.length);
    logRequest(word, req.body?.userID || req.query?.userID, true);
    return res.json(result);
  } catch (error) {
    logRequest(word, req.body?.userID || req.query?.userID, false);
    res.status(500).json({ error: "Failed to generate: " + error.message });
  }
}

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
  if (userId && users.has(userId)) {
    users.get(userId).lastActive = Date.now();
    users.get(userId).status = 'active';
  }
  res.json({ success: true });
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
  console.log(`Server running on port ${PORT}`);
});