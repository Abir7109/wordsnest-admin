const { GoogleGenAI } = require("@google/genai");

module.exports = async function handler(request, response) {
  // Support both POST and GET for testing
  const word = request.body?.word || request.query?.word;
  
  if (!word) {
    return response.status(400).json({ error: "Word is required. Use ?word=hello or POST {word:'hello'}" });
  }

  const { word } = request.body || {};
  
  if (!word) {
    return response.status(400).json({ error: "Word is required" });
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  try {
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the word: "${word}".`,
      config: {
        systemInstruction: `You are a linguistic analysis AI for 'Words Nest'. 
Return JSON with: { meaning: {english, bangla}, partsOfSpeech: [{type, form}], synonyms, antonyms, sentences: {simple, compound, complex} }
Return ONLY valid JSON.`,
        responseMimeType: "application/json",
      },
    });

    const text = geminiResponse.text;
    if (!text) throw new Error("Empty response");
    
    const result = JSON.parse(text);

    const transformedResult = {
      meaning: {
        english: result.meaning?.english || result.meaning?.definition || "No definition available",
        bangla: result.meaning?.bangla || "কোনো সংজ্ঞা পাওয়া যায়নি"
      },
      partsOfSpeech: Array.isArray(result.partsOfSpeech) 
        ? result.partsOfSpeech.map(pos => ({
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

    response.json(transformedResult);
  } catch (error) {
    console.error("Analysis Error:", error);
    response.status(500).json({ error: "Failed to analyze word" });
  }
};