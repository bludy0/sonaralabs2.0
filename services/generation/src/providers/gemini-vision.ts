import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function analyzeImageWithGemini(imageBase64: string, mimeType: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const geminiRes = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: "Analyze this game screenshot and generate a music prompt. Describe: atmosphere, color palette, genre, emotional tone. Output a concise music prompt in English, max 50 words, suitable for AI music generation." },
        ],
      }],
    }
  );

  const promptText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!promptText) throw new Error("No prompt from Gemini");
  return promptText.trim();
}
