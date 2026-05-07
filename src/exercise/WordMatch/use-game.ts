import { useEffect, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";

import type { PillStatus } from "../../ui/Pill";

import { initializeGame, applySelection, applyFadeComplete, applyClearFail } from "./game-logic";
import type { ColumnSide, GameState, SlotState, WordPair, WordResultMap } from "./types";
import { DISPLAY_SLOTS } from "./types";

// ============================================================================
// Types
// ============================================================================

type UseGameProps = {
  pairs: WordPair[];
  onComplete?: (wordResults: WordResultMap) => void;
  onMatch?: (matchedCount: number, totalPairs: number) => void;
};

type UseGameReturn = {
  displayCount: number;
  matchedCount: number;
  totalPairs: number;
  progress: number;
  wordResults: WordResultMap;
  getSlotStatus: (side: ColumnSide, position: number) => PillStatus;
  getSlotWord: (side: ColumnSide, position: number) => string;
  isSlotFading: (side: ColumnSide, position: number) => boolean;
  isSlotEmpty: (side: ColumnSide, position: number) => boolean;
  handleSelection: (side: ColumnSide, position: number) => void;
  handleFadeComplete: (side: ColumnSide, position: number) => void;
};

// ============================================================================
// Status mapping
// ============================================================================

const STATUS_MAP: Record<SlotState["type"], PillStatus> = {
  active: "blanc",
  selected: "selected",
  fail: "fail",
  fading: "success",
  empty: "blanc",
};

// ============================================================================
// Hook — React Compiler handles memoization, no manual useCallback needed
// ============================================================================

export const useGame = ({ pairs, onComplete, onMatch }: UseGameProps): UseGameReturn => {
  const posthog = usePostHog();
  const displayCount = Math.min(DISPLAY_SLOTS, pairs.length);
  const totalPairs = pairs.length;

  const [gameState, setGameState] = useState<GameState>(() =>
    initializeGame(pairs, displayCount),
  );

  // Fail timeout tracking — mutable container, not synced from props
  const failTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup timeouts on unmount
  useEffect(() => () => {
    failTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
  }, []);

  // ── Slot Queries ──────────────────────────────────────────────────────

  const getSlots = (side: ColumnSide) =>
    side === "left" ? gameState.leftSlots : gameState.rightSlots;

  const getSlotWord = (side: ColumnSide, position: number): string => {
    const slot = getSlots(side)[position];
    if (slot.type === "empty") return "";
    return side === "left" ? pairs[slot.pairIndex][0] : pairs[slot.pairIndex][1];
  };

  const isSlotFading = (side: ColumnSide, position: number): boolean =>
    getSlots(side)[position]?.type === "fading";

  const isSlotEmpty = (side: ColumnSide, position: number): boolean =>
    getSlots(side)[position]?.type === "empty";

  const getSlotStatus = (side: ColumnSide, position: number): PillStatus =>
    STATUS_MAP[getSlots(side)[position].type];

  // ── Event Handlers ────────────────────────────────────────────────────
  // These read gameState directly — safe because click handlers are serialized.
  // Callbacks (onComplete, onMatch) invoked synchronously after state computation.
  // React Compiler auto-memoizes; no manual useCallback needed.

  const handleSelection = (side: ColumnSide, position: number) => {
    const { state: next, events, failPair } = applySelection(gameState, pairs, side, position);
    if (next === gameState) return;

    setGameState(next);

    // Schedule fail clearance timer (legitimate async side effect)
    if (failPair) {
      posthog?.capture("word_match_failed", {
        lu: pairs[failPair.leftPairIndex][0],
        en: pairs[failPair.rightPairIndex][1],
      });

      const timeoutKey = `${failPair.leftPairIndex}-${failPair.rightPairIndex}`;
      const existing = failTimeoutsRef.current.get(timeoutKey);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        setGameState((s) => applyClearFail(s, failPair.leftPairIndex, failPair.rightPairIndex));
        failTimeoutsRef.current.delete(timeoutKey);
      }, 1000);
      failTimeoutsRef.current.set(timeoutKey, timeout);
    }

    // Invoke callbacks synchronously — no effects, no cascades
    events.forEach((event) => {
      if (event.type === "matched") {
        const otherSlots = side === "left" ? gameState.rightSlots : gameState.leftSlots;
        const otherSelected = otherSlots.find((s) => s.type === "selected");
        const clickedSlots = side === "left" ? gameState.leftSlots : gameState.rightSlots;
        const clickedPairIndex = clickedSlots[position]?.type !== "empty"
          ? clickedSlots[position].pairIndex
          : undefined;
        const matchedPairIndex = side === "left" ? clickedPairIndex : otherSelected?.pairIndex;
        if (matchedPairIndex !== undefined) {
          posthog?.capture("word_matched", {
            lu: pairs[matchedPairIndex][0],
            en: pairs[matchedPairIndex][1],
            matched_count: event.matchedCount,
            total_pairs: event.totalPairs,
          });
        }
        onMatch?.(event.matchedCount, event.totalPairs);
      }
      if (event.type === "completed") onComplete?.(event.wordResults);
    });
  };

  const handleFadeComplete = (side: ColumnSide, position: number) => {
    setGameState((current) => applyFadeComplete(current, side, position));
  };

  return {
    displayCount,
    matchedCount: gameState.matchedCount,
    totalPairs,
    progress: totalPairs > 0 ? gameState.matchedCount / totalPairs : 0,
    wordResults: gameState.wordResults,
    getSlotStatus,
    getSlotWord,
    isSlotFading,
    isSlotEmpty,
    handleSelection,
    handleFadeComplete,
  };
};
