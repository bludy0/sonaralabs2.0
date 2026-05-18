// frontend/src/hooks/useGenerationSSE.ts
// EventSource ile SSE bağlantısı kurar.
// Bağlantı kopunca native reconnect + tam durum senkronizasyonu.
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
  // adding extra hooks or triggering reconnects.
  const stateRef = useRef<{ es: EventSource | null; onStatus: typeof onStatus }>({
    es: null,
    onStatus,
  });
  stateRef.current.onStatus = onStatus; // always fresh, no extra hook needed

  /**
   * SSE bağlantısı (yeniden) kurulunca son 20 üretimi çek ve
   * frontend store'undaki stale "pending"/"processing" durumlarını güncelle.
   *
   * Sadece pending değil, done/failed da çekilir — bağlantı kopukken
   * tamamlanan veya başarısız olan işlerin kartları doğru duruma geçer.
   */
  const syncRecentJobs = useCallback(async () => {
    try {
      const { data } = await api.get("/api/generate/history?limit=20");
      const items: any[] = data.data?.items ?? [];
      items.forEach((gen) => {
        if (!gen.jobId) return;
        // Her item için güncel durumu store'a bildir
        stateRef.current.onStatus({
          type:      "status",
          jobId:     gen.jobId,
          status:    gen.status as GenerationStatus,
          audioUrl:  gen.audioUrl,
          failReason: gen.failReason,
        });
      });
    } catch {
      // Ağ hatası — sessizce geç, EventSource kendi başına retry yapacak
    }
  }, []); // stable — reads stateRef at call time

  const connect = useCallback(() => {
    stateRef.current.es?.close();

    const es = new EventSource("/api/notify/stream", { withCredentials: true });
    stateRef.current.es = es;

    es.onopen = () => {
      // Bağlantı açıldığında/yeniden açıldığında son durumu senkronize et.
      // Bu sayede kopukluk sırasında done/failed olan işler de güncellenir.
      syncRecentJobs();
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
      // Reconnect başarılı olunca onopen → syncRecentJobs çalışır.
    };
  }, [syncRecentJobs]); // stable — syncRecentJobs never changes

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      stateRef.current.es?.close();
      stateRef.current.es = null;
    };
  }, [enabled, connect]);
}
