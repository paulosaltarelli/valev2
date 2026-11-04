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
    const timer = window.setTimeout(() => {
      void onTickRef.current();
    }, intervalMs);

    return () => window.clearTimeout(timer);
  }, [enabled, isRunning, fastMs, slowMs]);
}

