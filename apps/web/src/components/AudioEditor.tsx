import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";

interface AudioEditorProps {
  audioUrl: string;
  onClose: () => void;
}

type ExportFormat = "wav" | "ogg" | "mp3";

// ---------------------------------------------------------------------------
// WAV encoder
// ---------------------------------------------------------------------------
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AudioEditor({ audioUrl, onClose }: AudioEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("wav");
  const [isExporting, setIsExporting] = useState(false);
  const [exportStub, setExportStub] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // WaveSurfer init
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#6366f1",
      progressColor: "#4f46e5",
      url: audioUrl,
      height: 80,
    });

    ws.on("ready", () => {
      const d = ws.getDuration();
      setDuration(d);
      setTrimEnd(d);
      setIsReady(true);
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [audioUrl]);

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------
  const handlePlayPause = () => {
    wsRef.current?.playPause();
  };

  const handleLoopToggle = () => {
    const next = !loop;
    setLoop(next);
    // WaveSurfer v7 does not support loop via setOptions; handle via 'finish' event
    if (next) {
      wsRef.current?.on("finish", () => wsRef.current?.play());
    } else {
      wsRef.current?.un("finish", () => wsRef.current?.play());
    }
  };

  const handlePlaybackRateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rate = parseFloat(e.target.value);
      setPlaybackRate(rate);
      wsRef.current?.setPlaybackRate(rate);
    },
    []
  );

  const handleTrimStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.min(parseFloat(e.target.value), trimEnd - 0.1);
    setTrimStart(Math.max(0, val));
  };

  const handleTrimEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(parseFloat(e.target.value), trimStart + 0.1);
    setTrimEnd(Math.min(duration, val));
  };

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------
  const handleExport = async () => {
    if (exportFormat !== "wav") {
      setExportStub(`${exportFormat.toUpperCase()} export coming soon. Downloading as WAV instead.`);
    } else {
      setExportStub(null);
    }

    setIsExporting(true);
    try {
      const audioCtx = new AudioContext();
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const start = Math.max(0, trimStart);
      const end = Math.min(audioBuffer.duration, trimEnd);
      const trimmedLength = Math.floor((end - start) * audioBuffer.sampleRate);

      const trimmed = audioCtx.createBuffer(
        audioBuffer.numberOfChannels,
        trimmedLength,
        audioBuffer.sampleRate
      );

      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const src = audioBuffer
          .getChannelData(ch)
          .subarray(
            Math.floor(start * audioBuffer.sampleRate),
            Math.floor(end * audioBuffer.sampleRate)
          );
        trimmed.getChannelData(ch).set(src);
      }

      const wavBlob = audioBufferToWav(trimmed);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sonaralabs-export.wav`;
      a.click();
      URL.revokeObjectURL(url);

      await audioCtx.close();
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const inputCls = "w-full rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none disabled:opacity-40"

  return (
    /* Modal overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "color-mix(in srgb, var(--bg-page) 30%, transparent)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col gap-0 overflow-hidden"
        style={{
          background:  "var(--bg-card)",
          border:      "1px solid var(--bg-border)",
          boxShadow:   "0 8px 40px color-mix(in srgb, var(--bg-page) 60%, transparent)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--bg-border)" }}
        >
          <h2 className="text-base font-semibold tracking-tight" style={{ color: "var(--text-1)" }}>
            Audio Editor
          </h2>
          <button
            onClick={onClose}
            aria-label="Close editor"
            className="text-xl leading-none transition-colors"
            style={{ color: "var(--text-3)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-col gap-6 px-6 py-6 overflow-y-auto max-h-[80vh]">

          {/* Waveform */}
          <div
            ref={containerRef}
            className="w-full rounded-lg overflow-hidden"
            style={{ background: "var(--bg-mid)" }}
          />

          {/* Play / Pause + Loop */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              disabled={!isReady}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "var(--accent-on)" }}
            >
              {isPlaying ? (
                <><span className="text-base">&#9646;&#9646;</span> Pause</>
              ) : (
                <><span className="text-base">&#9654;</span> Play</>
              )}
            </button>

            <button
              onClick={handleLoopToggle}
              disabled={!isReady}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: loop ? "color-mix(in srgb, var(--accent-dim) 60%, transparent)" : "var(--bg-mid)",
                border:     `1px solid ${loop ? "var(--accent)" : "var(--bg-border)"}`,
                color:      loop ? "var(--accent)" : "var(--text-2)",
              }}
            >
              <span className="text-base">&#8635;</span> Loop
            </button>

            {isReady && (
              <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                {formatTime(duration)}
              </span>
            )}
          </div>

          {/* BPM / Pitch (playbackRate) */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <span lang="en" className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                Tempo / Pitch
              </span>
              <span className="text-xs tabular-nums font-mono" style={{ color: "var(--accent)" }}>
                {playbackRate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range" min={0.5} max={2.0} step={0.01}
              value={playbackRate}
              onChange={handlePlaybackRateChange}
              disabled={!isReady}
              className="w-full disabled:opacity-40"
              style={{ accentColor: "var(--accent)" }}
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-3)" }}>
              <span>0.5x</span>
              <span className="text-center flex-1 px-2" style={{ color: "var(--teal)" }}>
                Preview only — pitch and tempo change together
              </span>
              <span>2.0x</span>
            </div>
          </section>

          {/* Fade In / Fade Out */}
          <section className="grid grid-cols-2 gap-4">
            {[
              { label: "Fade In",  value: fadeIn,  onChange: (v: number) => setFadeIn(v) },
              { label: "Fade Out", value: fadeOut, onChange: (v: number) => setFadeOut(v) },
            ].map(({ label, value, onChange }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                    {label}
                  </span>
                  <span className="text-xs tabular-nums font-mono" style={{ color: "var(--accent)" }}>
                    {value.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range" min={0} max={5} step={0.1} value={value}
                  onChange={e => onChange(parseFloat(e.target.value))}
                  disabled={!isReady}
                  className="w-full disabled:opacity-40"
                  style={{ accentColor: "var(--accent)" }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-3)" }}>
                  <span>0s</span><span>5s</span>
                </div>
              </div>
            ))}
          </section>

          {/* Trim */}
          <section>
            <span lang="en" className="text-xs font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-2)" }}>
              Trim
            </span>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Start (s)", value: trimStart, min: 0,            max: trimEnd - 0.1, onChange: handleTrimStartChange },
                { label: "End (s)",   value: trimEnd,   min: trimStart+0.1, max: duration,     onChange: handleTrimEndChange   },
              ].map(({ label, value, min, max, onChange }) => (
                <div key={label}>
                  <label className="block text-xs mb-1" style={{ color: "var(--text-2)" }}>{label}</label>
                  <input
                    type="number" min={min} max={max} step={0.1}
                    value={value.toFixed(1)}
                    onChange={onChange}
                    disabled={!isReady}
                    className={inputCls}
                    style={{
                      background: "var(--bg-input)",
                      border:     "1px solid var(--bg-border)",
                      color:      "var(--text-1)",
                    }}
                  />
                </div>
              ))}
            </div>
            {isReady && (
              <p className="text-xs mt-2 tabular-nums" style={{ color: "var(--text-3)" }}>
                Trim length: {(trimEnd - trimStart).toFixed(1)}s of {formatTime(duration)}
              </p>
            )}
          </section>

          {/* Export */}
          <section style={{ borderTop: "1px solid var(--bg-border)", paddingTop: 20 }}>
            <span className="text-xs font-medium uppercase tracking-wider block mb-3" style={{ color: "var(--text-2)" }}>
              Export
            </span>

            <div className="flex items-center gap-2 mb-3">
              {(["wav", "ogg", "mp3"] as ExportFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => { setExportFormat(fmt); setExportStub(null); }}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider transition-colors"
                  style={{
                    background: exportFormat === fmt ? "var(--accent)"    : "var(--bg-mid)",
                    border:     `1px solid ${exportFormat === fmt ? "var(--accent)" : "var(--bg-border)"}`,
                    color:      exportFormat === fmt ? "var(--accent-on)" : "var(--text-2)",
                  }}
                >
                  {fmt}
                </button>
              ))}
            </div>

            {exportStub && (
              <p className="text-xs mb-3" style={{ color: "var(--teal)" }}>{exportStub}</p>
            )}

            <button
              onClick={handleExport}
              disabled={!isReady || isExporting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--success)", color: "#000" }}
            >
              {isExporting ? (
                <>
                  <span
                    className="inline-block w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: "currentColor", borderTopColor: "transparent" }}
                  />
                  Exporting…
                </>
              ) : (
                <><span className="text-base">&#8659;</span> Download {exportFormat.toUpperCase()}</>
              )}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
