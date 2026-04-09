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
  return (
    /* Modal overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-2xl bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 flex flex-col gap-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-base font-semibold text-white tracking-tight">
            Audio Editor
          </h2>
          <button
            onClick={onClose}
            aria-label="Close editor"
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-col gap-6 px-6 py-6 overflow-y-auto max-h-[80vh]">

          {/* Waveform */}
          <div
            ref={containerRef}
            className="w-full rounded-lg overflow-hidden bg-gray-800"
          />

          {/* Play / Pause + Loop */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              disabled={!isReady}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isPlaying ? (
                <>
                  <span className="text-base">&#9646;&#9646;</span> Pause
                </>
              ) : (
                <>
                  <span className="text-base">&#9654;</span> Play
                </>
              )}
            </button>

            <button
              onClick={handleLoopToggle}
              disabled={!isReady}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed border ${
                loop
                  ? "bg-indigo-900/60 border-indigo-500 text-indigo-300"
                  : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400"
              }`}
            >
              <span className="text-base">&#8635;</span> Loop
            </button>

            {isReady && (
              <span className="ml-auto text-xs text-gray-500 tabular-nums">
                {formatTime(duration)}
              </span>
            )}
          </div>

          {/* BPM / Pitch (playbackRate) */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">
                Tempo / Pitch
              </span>
              <span className="text-xs text-indigo-400 tabular-nums font-mono">
                {playbackRate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.01}
              value={playbackRate}
              onChange={handlePlaybackRateChange}
              disabled={!isReady}
              className="w-full accent-indigo-500 disabled:opacity-40"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0.5x</span>
              <span className="text-yellow-400/80 text-center flex-1 px-2">
                Preview only — pitch and tempo change together
              </span>
              <span>2.0x</span>
            </div>
          </section>

          {/* Fade In / Fade Out */}
          <section className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Fade In
                </span>
                <span className="text-xs text-indigo-400 tabular-nums font-mono">
                  {fadeIn.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={fadeIn}
                onChange={(e) => setFadeIn(parseFloat(e.target.value))}
                disabled={!isReady}
                className="w-full accent-indigo-500 disabled:opacity-40"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0s</span>
                <span>5s</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Fade Out
                </span>
                <span className="text-xs text-indigo-400 tabular-nums font-mono">
                  {fadeOut.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={fadeOut}
                onChange={(e) => setFadeOut(parseFloat(e.target.value))}
                disabled={!isReady}
                className="w-full accent-indigo-500 disabled:opacity-40"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0s</span>
                <span>5s</span>
              </div>
            </div>
          </section>

          {/* Trim */}
          <section>
            <span className="text-xs font-medium text-gray-300 uppercase tracking-wider block mb-3">
              Trim
            </span>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Start (s)
                </label>
                <input
                  type="number"
                  min={0}
                  max={trimEnd - 0.1}
                  step={0.1}
                  value={trimStart.toFixed(1)}
                  onChange={handleTrimStartChange}
                  disabled={!isReady}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  End (s)
                </label>
                <input
                  type="number"
                  min={trimStart + 0.1}
                  max={duration}
                  step={0.1}
                  value={trimEnd.toFixed(1)}
                  onChange={handleTrimEndChange}
                  disabled={!isReady}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                />
              </div>
            </div>
            {isReady && (
              <p className="text-xs text-gray-500 mt-2 tabular-nums">
                Trim length: {(trimEnd - trimStart).toFixed(1)}s of {formatTime(duration)}
              </p>
            )}
          </section>

          {/* Export */}
          <section className="border-t border-gray-700 pt-5">
            <span className="text-xs font-medium text-gray-300 uppercase tracking-wider block mb-3">
              Export
            </span>

            <div className="flex items-center gap-2 mb-3">
              {(["wav", "ogg", "mp3"] as ExportFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => {
                    setExportFormat(fmt);
                    setExportStub(null);
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider border transition-colors ${
                    exportFormat === fmt
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            {exportStub && (
              <p className="text-xs text-yellow-400 mb-3">{exportStub}</p>
            )}

            <button
              onClick={handleExport}
              disabled={!isReady || isExporting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isExporting ? (
                <>
                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Exporting…
                </>
              ) : (
                <>
                  <span className="text-base">&#8659;</span> Download {exportFormat.toUpperCase()}
                </>
              )}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
