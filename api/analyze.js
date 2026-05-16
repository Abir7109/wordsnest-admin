const https = require('https');

module.exports = async function handler(request, response) {
  const word = request.body?.word || request.query?.word;
  
  if (!word) {
    return response.status(400).json({ error: "Word is required. Use ?word=hello or POST {word:'hello'}" });
  }

  // Use Free Dictionary API
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Invalid JSON"));
          }
        });
      }).on('error', reject);
    });

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Word not found");
    }

    const entry = data[0];
    const meanings = entry.meanings || [];
    
    let english = "No definition available";
    if (meanings.length > 0 && meanings[0].definitions?.[0]) {
      english = meanings[0].definitions[0].definition;
    }
    
    const partsOfSpeech = meanings.slice(0, 3).map(m => ({
      type: m.partOfSpeech || "Unknown",
      form: m.definitions?.[0]?.definition || ""
    }));
    
    const synonyms = [...new Set(meanings.flatMap(m => 
      (m.synonyms || []).slice(0, 3)
    ))].slice(0, 5);
    
    const antonyms = [...new Set(meanings.flatMap(m => 
      (m.antonyms || []).slice(0, 3)
    ))].slice(0, 5);

    let simple = "No example available";
    for (const m of meanings) {
      for (const def of (m.definitions || [])) {
        if (def.example) {
          simple = def.example;
          break;
        }
      }
      if (simple !== "No example available") break;
    }

    const result = {
      meaning: {
        english: english,
        bangla: getBanglaMeaning(word)
      },
      partsOfSpeech: partsOfSpeech,
      synonyms: synonyms,
      antonyms: antonyms,
      sentences: {
        simple: simple,
        compound: simple + " It is commonly used in daily conversations.",
        complex: "When studying vocabulary, " + word + " is an important word to learn."
      }
    };

    response.json(result);
  } catch (error) {
    console.error("Error:", error.message);
    response.status(500).json({ error: "Failed to find word: " + word });
  }
};

function getBanglaMeaning(word) {
  const basic = {
    "hello": "নমস্কার",
    "world": "পৃথিবী",
    "love": "ভালোবাসা",
    "friend": "বন্ধু",
    "good": "ভালো",
    "bad": "খারাপ",
    "happy": "খুশি",
    "beautiful": "সুন্দর",
    "time": "সময়",
    "water": "পানি",
    "food": "খাবার",
    "day": "দিন",
    "night": "রাত",
    "sun": "সূর্য",
    "moon": "চাঁদ"
  };
  return basic[word.toLowerCase()] || "অর্থ অনুপলব্ধ";
}