/**
 * providers/gemini-vision.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Gemini — oyun screenshot'ından müzik prompt'u üretir.
 * Ücretsiz tier: 1500 istek/gün (Flash modeli).
 * Model ve prompt'u değiştirmek için: providers/config.ts → GEMINI_VISION_CONFIG
 */
import axios from "axios";
import { GEMINI_VISION_CONFIG } from "./config";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function analyzeImageWithGemini(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const cfg = GEMINI_VISION_CONFIG;

  const res = await axios.post(
    `${cfg.baseUrl}/models/${cfg.model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: cfg.systemPrompt },
        ],
      }],
    },
  );

  const text: string | undefined = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini Vision: empty response");
  return text.trim();
}
