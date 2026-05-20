import { useRef } from "react";

// Max gap between two interactions that still counts as "thinking time".
// Anything longer is clamped down to this — the user may have walked away
// for an hour, but we still credit them ~30s of think time when they return.
const IDLE_THRESHOLD_S = 30;

export const useActivityTimer = () => {
  const lastInteractionAt = useRef<number | null>(null);
  const accumulatedS = useRef<number>(0);

  /** Anchor the timer to "now" so the first real interaction has something
   *  to measure against. Call when a slot becomes visible. */
  const start = (): void => {
    lastInteractionAt.current = Date.now() / 1000;
  };

  const registerInteraction = (): void => {
    const nowS = Date.now() / 1000;
    const gap = lastInteractionAt.current !== null
      ? Math.min(nowS - lastInteractionAt.current, IDLE_THRESHOLD_S)
      : 0;
    accumulatedS.current = accumulatedS.current + gap;
    lastInteractionAt.current = nowS;
  };

  const getElapsedSeconds = (): number => accumulatedS.current;

  const reset = (): void => {
    accumulatedS.current = 0;
    lastInteractionAt.current = null;
  };

  return { start, registerInteraction, getElapsedSeconds, reset };
};
