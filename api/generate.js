// Groq API Keys from environment variables
const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
  process.env.GROQ_API_KEY_6
].filter(Boolean);

let keyIndex = 0;
function getNextKey() {
  const key = GROQ_API_KEYS[keyIndex];
  keyIndex = (keyIndex + 1) % GROQ_API_KEYS.length;
  return key;
}

async function enhanceWithAI(word) {
  if (GROQ_API_KEYS.length === 0) {
    return null;
  }
  
  try {
    const apiKey = getNextKey();
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{
          role: "user",
          content: `Generate for the word "${word}": 
Return ONLY a JSON object with these exact fields (no extra text):
{
  "synonyms": ["word1", "word2", "word3", "word4", "word5"],
  "antonyms": ["word1", "word2", "word3"],
  "simpleSentence": "A simple example sentence using ${word}",
  "compoundSentence": "A compound sentence using ${word}",
  "complexSentence": "A complex sentence using ${word}"
}`
        }],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      throw new Error("Groq API failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.log("AI enhancement failed:", e.message);
  }
  
  return null;
}

const banglaDict = {
  "hello": "নমস্কার", "world": "পৃথিবী", "love": "ভালোবাসা", "friend": "বন্ধু",
  "good": "ভালো", "bad": "খারাপ", "happy": "খুশি", "beautiful": "সুন্দর",
  "time": "সময়", "water": "পানি", "food": "খাবার", "day": "দিন", "night": "রাত"
};

function getBanglaMeaning(word) {
  return banglaDict[word.toLowerCase()] || "অর্থ অনুপলব্ধ";
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  let word = null;
  let userID = 'anonymous';

  if (request.method === 'POST') {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    word = body?.word;
    userID = body?.user_id || body?.userID || 'anonymous';
  } else if (request.method === 'GET') {
    word = request.query?.word;
    userID = request.query?.userID || 'anonymous';
  }

  console.log("Generate AI for:", word);

  if (!word) {
    return response.status(400).json({ error: "Word is required" });
  }

  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const res = await fetch(url);
    
    let meaning = { english: "No definition available", bangla: getBanglaMeaning(word) };
    let partsOfSpeech = [];
    
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const entry = data[0];
        const meanings = entry.meanings || [];
        meaning.english = meanings[0]?.definitions?.[0]?.definition || "No definition available";
        partsOfSpeech = meanings.slice(0, 3).map(m => ({
          type: m.partOfSpeech || "Unknown",
          definition: m.definitions?.[0]?.definition || ""
        }));
      }
    }

    const aiData = await enhanceWithAI(word);
    
    const result = {
      word: word,
      phonetic: "",
      meaning: meaning,
      partsOfSpeech: partsOfSpeech,
      synonyms: aiData?.synonyms || [],
      antonyms: aiData?.antonyms || [],
      sentences: {
        simple: aiData?.simpleSentence || "No example available",
        compound: aiData?.compoundSentence || "Practice makes perfect.",
        complex: aiData?.complexSentence || "Understanding " + word + " is essential for language learning."
      }
    };

    response.json(result);
  } catch (error) {
    console.error("Error:", error.message);
    response.status(500).json({ error: "Failed to generate: " + error.message });
  }
}