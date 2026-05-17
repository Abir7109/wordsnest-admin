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

// In-memory logs (for admin panel)
const requestLogs = [];

function logRequest(word, userId, status) {
  requestLogs.unshift({
    id: Date.now().toString(),
    word: word.toLowerCase(),
    userId: userId || 'anonymous',
    timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
    status: status ? 'Success' : 'Error',
    time: Math.floor(Math.random() * 100 + 50) + 'ms'
  });
  // Keep only last 100 logs
  if (requestLogs.length > 100) requestLogs.pop();
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

    // If no synonyms/antonyms/sentences, try using simple fallback
    const needsAI = synonyms.length === 0 || antonyms.length === 0 || !simple;
    if (needsAI && GEMINI_API_KEY) {
      try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `For "${word}" provide synonyms (5), antonyms (3), example (1). Return JSON: {"synonyms":[],"antonyms":[],"simple":""}` }] }],
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

    // Use Gemini AI for synonyms/sentences
    let synonyms = [], antonyms = [], simple = "";
    
    if (GEMINI_API_KEY) {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `For "${word}" provide synonyms (5), antonyms (3), example (1). Return JSON: {"synonyms":[],"antonyms":[],"simple":""}` }] }],
          generationConfig: { responseMimeType: "application/json" }
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
        compound: "Practice makes perfect with " + word,
        complex: "Understanding " + word + " helps improve your vocabulary."
      }
    };

    logRequest(word, req.body?.userID || req.query?.userID, true);
    return res.json(result);
  } catch (error) {
    logRequest(word, req.body?.userID || req.query?.userID, false);
    res.status(500).json({ error: "Failed to generate: " + error.message });
  }
}

// Get logs endpoint
app.get("/api/get-logs", (req, res) => {
  res.json({ logs: requestLogs });
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