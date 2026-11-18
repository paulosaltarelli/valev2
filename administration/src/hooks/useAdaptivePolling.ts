import { useEffect, useRef } from "react";

type Params = {
  enabled: boolean;
  isRunning: boolean;
  onTick: () => void | Promise<void>;
  fastMs?: number;
  slowMs?: number;
};

export function useAdaptivePolling({
  enabled,
  isRunning,
  onTick,
  fastMs = 20_000,
  slowMs = 60_000,
}: Params) {
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!enabled) return;

    const intervalMs = isRunning ? fastMs : slowMs;
    let stopped = false;
    let running = false;
    let timer: number | undefined;
    const schedule = () => {
      if (!stopped && !document.hidden) timer = window.setTimeout(run, intervalMs);
    };
    const run = async () => {
      if (stopped || running || document.hidden) return;
      clearTimeout(timer);
      running = true;
      try {
        await onTickRef.current();
      } catch {
        // A próxima atualização tenta novamente após uma falha de rede.
      } finally {
        running = false;
        schedule();
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, isRunning, fastMs, slowMs]);
}

