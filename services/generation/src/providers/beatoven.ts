import axios from "axios";

const JOB_TIMEOUT_MS = process.env.JOB_TIMEOUT_MS || "300000";
const BEATOVEN_API_KEY = process.env.BEATOVEN_API_KEY;

export class BeatovenProvider {
  readonly name = "beatoven" as const;

  async generate(prompt: string, duration: number, style: string, mood: string): Promise<string> {
    // Beatoven async polling flow
    if (!BEATOVEN_API_KEY) throw new Error("BEATOVEN_API_KEY not set");

    // 1. Track oluştur
    const createRes = await axios.post("https://public-api.beatoven.ai/api/v1/tracks", {
      prompt: { text: `${prompt}, style: ${style}, mood: ${mood}` },
      format: "ogg",
      duration: duration * 1000, // ms
    }, { headers: { Authorization: `Bearer ${BEATOVEN_API_KEY}` } });

    const trackId = createRes.data.tracks?.[0];
    if (!trackId) throw new Error("Beatoven: no trackId in response");

    // 2. Compose (başlat)
    await axios.post(`https://public-api.beatoven.ai/api/v1/tracks/${trackId}/compose`,
      {}, { headers: { Authorization: `Bearer ${BEATOVEN_API_KEY}` } });

    // 3. Poll (timeout dahilinde BullMQ handle eder)
    const start = Date.now();
    while (Date.now() - start < parseInt(JOB_TIMEOUT_MS) - 10_000) {
      await new Promise(r => setTimeout(r, 5000)); // 5sn bekle
      const statusRes = await axios.get(
        `https://public-api.beatoven.ai/api/v1/tracks/${trackId}`,
        { headers: { Authorization: `Bearer ${BEATOVEN_API_KEY}` } }
      );
      const { status, meta } = statusRes.data;
      if (status === "composed" && meta?.audio?.url) return meta.audio.url;
      if (status === "failed") throw new Error("Beatoven: track composition failed");
    }
    throw new Error("Beatoven: polling timeout");
  }
}
