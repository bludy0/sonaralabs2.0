import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { analyzeAudio } from "@sonaralabs/daw-studio";

export interface MiniWaveformPlayerProps {
  audioUrl: string;
  onReady?: (info: { duration: number; bpm: number; waveformData: number[] }) => void;
}

function fmtTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function MiniWaveformPlayer({ audioUrl, onReady }: MiniWaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [analyzed, setAnalyzed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "var(--text-3)",
      progressColor: "var(--accent)",
      cursorColor: "transparent",
      url: audioUrl,
      height: 48,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
    });

    ws.on("ready", () => {
      const d = ws.getDuration();
      setDuration(d);
      setIsReady(true);
      // Analiz: BPM + waveform data
      analyzeAudio(audioUrl)
        .then(({ bpm, waveformData }) => {
          setAnalyzed(true);
          onReady?.({ duration: d, bpm, waveformData });
        })
        .catch(() => {
          setAnalyzed(true);
          onReady?.({ duration: d, bpm: 0, waveformData: [] });
        });
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("timeupdate", (time: number) => setCurrentTime(time));

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [audioUrl, onReady]);

  const togglePlay = () => {
    wsRef.current?.playPause();
  };

  return (
    <div
      className="flex items-center gap-3 rounded-lg p-2.5"
      style={{ background: "var(--bg-mid)", border: "1px solid var(--bg-border)" }}
    >
      <button
        type="button"
        onClick={togglePlay}
        disabled={!isReady}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-transform disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--accent-on)" }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
          {isPlaying ? "pause" : "play_arrow"}
        </span>
      </button>

      <div className="flex-1 min-w-0">
        <div ref={containerRef} className="w-full" />
      </div>

      <span
        className="shrink-0 text-[9px] font-mono tabular-nums"
        style={{ color: "var(--text-3)", minWidth: 70, textAlign: "right" }}
      >
        {fmtTime(currentTime)} / {fmtTime(duration)}
      </span>
    </div>
  );
}
