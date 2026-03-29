import { useRef } from "react";

const IDLE_THRESHOLD_S = 15;

export const useActivityTimer = () => {
  const lastInteractionAt = useRef<number | null>(null);
  const accumulatedS = useRef<number>(0);

  const registerInteraction = (): void => {
    const nowS = Date.now() / 1000;
    const gap = lastInteractionAt.current !== null
      ? nowS - lastInteractionAt.current
      : IDLE_THRESHOLD_S + 1;
    accumulatedS.current = accumulatedS.current + (gap <= IDLE_THRESHOLD_S ? gap : 0);
    lastInteractionAt.current = nowS;
  };

  const getElapsedSeconds = (): number => accumulatedS.current;

  const reset = (): void => {
    accumulatedS.current = 0;
    lastInteractionAt.current = null;
  };

  return { registerInteraction, getElapsedSeconds, reset };
};
