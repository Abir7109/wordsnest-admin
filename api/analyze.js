module.exports = async function handler(request, response) {
  const word = request.body?.word || request.query?.word;
  
  if (!word) {
    return response.status(400).json({ error: "Word is required. Use ?word=hello or POST {word:'hello'}" });
  }

  try {
    // Use Free Dictionary API - no quota limits!
    const dictResponse = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    
    if (!dictResponse.ok) {
      throw new Error("Word not found in dictionary");
    }
    
    const data = await dictResponse.json();
    const entry = data[0];
    
    // Extract meaning
    const meanings = entry.meanings || [];
    
    // Get first definition for English meaning
    let english = "No definition available";
    if (meanings.length > 0 && meanings[0].definitions && meanings[0].definitions.length > 0) {
      english = meanings[0].definitions[0].definition;
    }
    
    // Get parts of speech
    const partsOfSpeech = meanings.map(m => ({
      type: m.partOfSpeech || "Unknown",
      form: m.definitions?.[0]?.definition || ""
    })).slice(0, 3);
    
    // Get synonyms (from all meanings)
    const synonyms = [...new Set(meanings.flatMap(m => 
      (m.synonyms || []).slice(0, 3)
    ))].slice(0, 5);
    
    // Get antonyms
    const antonyms = [...new Set(meanings.flatMap(m => 
      (m.antonyms || []).slice(0, 3)
    ))].slice(0, 5);
    
    // Get example sentences
    let simple = "No example available";
    let compound = "";
    let complex = "";
    
    for (const m of meanings) {
      for (const def of (m.definitions || [])) {
        if (def.example && !simple.includes(def.example)) {
          if (!simple || simple === "No example available") {
            simple = def.example;
          } else if (!compound && def.example.split(',').length > 1) {
            compound = def.example;
          } else if (!complex) {
            complex = def.example;
          }
        }
      }
    }

    const result = {
      meaning: {
        english: english,
        bangla: getBanglaMeaning(word) // Use fallback for now
      },
      partsOfSpeech: partsOfSpeech,
      synonyms: synonyms,
      antonyms: antonyms,
      sentences: {
        simple: simple,
        compound: compound || simple + " This shows the word is used in context.",
        complex: complex || "When learning new words, " + word + " becomes essential for communication."
      }
    };

    response.json(result);
  } catch (error) {
    console.error("Dictionary Error:", error.message);
    response.status(500).json({ 
      error: "Failed to analyze word: " + error.message,
      fallback: true 
    });
  }
};

// Simple Bangla meaning fallback - can be expanded
function getBanglaMeaning(word) {
  // Basic translations - you can expand this
  const basic = {
    "hello": "নমস্কার",
    "world": "পৃথিবী",
    "love": "ভালোবাসা",
    "friend": "বন্ধু",
    "good": "ভালো",
    "bad": "খারাপ",
    "happy": "খুশি",
    "sad": "দুঃখী",
    "beautiful": "সুন্দর",
    "time": "সময়"
  };
  return basic[word.toLowerCase()] || "অর্থ পাওয়া যায়নি";
}