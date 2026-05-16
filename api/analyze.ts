import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Only allow POST
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { word, userID, timestamp } = request.body;
  
  if (!word) {
    return response.status(400).json({ error: "Word is required" });
  }

  // Initialize Gemini AI
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  try {
    // Call Gemini AI
    const geminiResponse = await ai.models.generateContent({
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

    const text = geminiResponse.text;
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

    response.json(transformedResult);
  } catch (error) {
    console.error("Analysis Error:", error);
    response.status(500).json({ error: "Failed to analyze word" });
  }
}