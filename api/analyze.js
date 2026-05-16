export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  let word = null;
  
  // Try to get word from any source
  if (request.method === 'GET' && request.query?.word) {
    word = request.query.word;
  } else if (request.method === 'POST') {
    // Handle JSON body
    if (request.body) {
      if (typeof request.body === 'string') {
        try {
          word = JSON.parse(request.body).word;
        } catch (e) {
          // Try form data
          const params = new URLSearchParams(request.body);
          word = params.get('word');
        }
      } else {
        word = request.body.word;
      }
    }
  }
  
  console.log("Received request for word:", word, "method:", request.method);

  if (!word) {
    return response.status(400).json({ 
      error: "Word is required",
      hint: "Use GET ?word=hello or POST {word:'hello'}"
    });
  }

  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    
    const res = await fetch(url);
    
    if (!res.ok) {
      throw new Error(`Word not found (${res.status})`);
    }
    
    const data = await res.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No data from dictionary");
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

    console.log("Sending response for:", word);
    response.json(result);
  } catch (error) {
    console.error("Error:", error.message);
    response.status(500).json({ error: "Failed to find word: " + error.message });
  }
}

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
    "night": "রাত"
  };
  return basic[word.toLowerCase()] || "অর্থ অনুপলব্ধ";
}