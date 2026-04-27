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
  // Single ref holds both the EventSource handle and the latest onStatus callback.
  // Updating .onStatus inline (during render) keeps the latest callback without
  // adding extra hooks or triggering reconnects — hooks count stays identical to
  // the original (1 useRef, 2 useCallback, 1 useEffect).
  const stateRef = useRef<{ es: EventSource | null; onStatus: typeof onStatus }>({
    es: null,
    onStatus,
  });
  stateRef.current.onStatus = onStatus; // always fresh, no extra hook needed

  // Pending job'ları çek ve SSE bağlantısını yenile
  const recoverPendingJobs = useCallback(async () => {
    try {
      const { data } = await api.get("/api/generate/history?status=pending&limit=10");
      const pending = data.data?.items ?? [];
      pending.forEach((gen: any) => {
        stateRef.current.onStatus({ type: "status", jobId: gen.jobId, status: "pending" as GenerationStatus });
      });
    } catch {
      // Sessizce geç
    }
  }, []); // truly stable — reads stateRef at call time, no closure over onStatus

  const connect = useCallback(() => {
    stateRef.current.es?.close();

    const es = new EventSource("/api/notify/stream", { withCredentials: true });
    stateRef.current.es = es;

    es.onopen = () => {
      console.log("[SSE] Connected");
      recoverPendingJobs(); // Reconnect'te pending job'ları al
    };

    es.onmessage = (event) => {
      try {
        const data: SseStatusEvent = JSON.parse(event.data);
        if (data.type === "status") stateRef.current.onStatus(data);
      } catch {
        // parse hatası — ignore
      }
    };

    es.onerror = () => {
      // EventSource kendi kendine reconnect dener (exponential backoff).
      // Reconnect başarılı olunca onopen tetikler → recoverPendingJobs çalışır.
      console.warn("[SSE] Connection error — browser will auto-reconnect");
    };
  }, [recoverPendingJobs]); // stable — recoverPendingJobs never changes

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      stateRef.current.es?.close();
      stateRef.current.es = null;
    };
  }, [enabled, connect]);
}
