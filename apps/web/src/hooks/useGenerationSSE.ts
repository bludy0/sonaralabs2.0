// frontend/src/hooks/useGenerationSSE.ts
// EventSource ile SSE bağlantısı kurar.
// Bağlantı kopunca native reconnect + pending job recovery.
import { useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api";
import { SseStatusEvent, GenerationStatus } from "@sonaralabs/types";

interface UseGenerationSSEOptions {
  onStatus: (event: SseStatusEvent) => void;
  enabled?: boolean;
}

export function useGenerationSSE({ onStatus, enabled = true }: UseGenerationSSEOptions) {
  const esRef = useRef<EventSource | null>(null);

  // Pending job'ları çek ve SSE bağlantısını yenile
  const recoverPendingJobs = useCallback(async () => {
    try {
      const { data } = await api.get("/api/generate/history?status=pending&limit=10");
      const pending = data.data?.items ?? [];
      pending.forEach((gen: any) => {
        // Her pending job için synthetic event tetikle (UI güncellemesi için)
        onStatus({ type: "status", jobId: gen.jobId, status: "pending" as GenerationStatus });
      });
    } catch {
      // Sessizce geç
    }
  }, [onStatus]);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource("/api/notify/stream", { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      console.log("[SSE] Connected");
      recoverPendingJobs(); // Reconnect'te pending job'ları al
    };

    es.onmessage = (event) => {
      try {
        const data: SseStatusEvent = JSON.parse(event.data);
        if (data.type === "status") onStatus(data);
      } catch {
        // parse hatası — ignore
      }
    };

    es.onerror = () => {
      // EventSource kendi kendine reconnect dener (exponential backoff).
      // Reconnect başarılı olunca onopen tetikler → recoverPendingJobs çalışır.
      console.warn("[SSE] Connection error — browser will auto-reconnect");
    };
  }, [onStatus, recoverPendingJobs]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled, connect]);
}
