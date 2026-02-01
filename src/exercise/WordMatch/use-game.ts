import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PillStatus } from "../../ui/Pill";

import type { ColumnSide, GameState, SlotState, WordPair } from "./types";
import { DISPLAY_SLOTS } from "./types";

// ============================================================================
// Utility Functions
// ============================================================================

const shuffle = <T,>(array: T[]): T[] =>
  array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => i + from);

// ============================================================================
// Derived Helpers
// ============================================================================

/** Get pairIndices that are currently visible (not fading, not empty) */
const getVisiblePairs = (slots: SlotState[]): Set<number> =>
  new Set(
    slots
      .filter((s) => s.type === "active" || s.type === "selected" || s.type === "fail")
      .map((s) => s.pairIndex)
  );

/** Get fading slots that can be reshuffled (counter-slot not yet visible) */
const getProvisionalSlots = (
  slots: SlotState[],
  counterVisiblePairs: Set<number>
): { position: number; nextPairIndex: number }[] =>
  slots
    .map((s, position) => ({ slot: s, position }))
    .filter(
      ({ slot }) =>
        slot.type === "fading" &&
        slot.nextPairIndex !== null &&
        !counterVisiblePairs.has(slot.nextPairIndex)
    )
    .map(({ slot, position }) => ({
      position,
      nextPairIndex: (slot as Extract<SlotState, { type: "fading" }>).nextPairIndex!,
    }));

// ============================================================================
// State Update Functions
// ============================================================================

const updateSlotAtPosition = (
  slots: SlotState[],
  position: number,
  newSlot: SlotState
): SlotState[] => slots.map((slot, i) => (i === position ? newSlot : slot));

const updateSlotByPairIndex = (
  slots: SlotState[],
  pairIndex: number,
  updater: (slot: SlotState) => SlotState
): SlotState[] =>
  slots.map((slot) =>
    slot.type !== "empty" && slot.pairIndex === pairIndex ? updater(slot) : slot
  );

/** Reshuffle provisional assignments among all unlocked fading slots */
const reshuffleProvisional = (state: GameState): GameState => {
  const leftVisible = getVisiblePairs(state.leftSlots);
  const rightVisible = getVisiblePairs(state.rightSlots);

  const leftProvisional = getProvisionalSlots(state.leftSlots, rightVisible);
  const rightProvisional = getProvisionalSlots(state.rightSlots, leftVisible);

  // Nothing to reshuffle
  if (leftProvisional.length === 0) return state;

  // Collect unique pairs to redistribute (use Set to dedupe)
  const uniquePairs = [...new Set(leftProvisional.map((p) => p.nextPairIndex))];

  // Get all provisional positions for each side
  const leftPositions = leftProvisional.map((p) => p.position);
  const rightPositions = rightProvisional.map((p) => p.position);

  // Shuffle the pairs assignment order
  const shuffledPairs = shuffle([...uniquePairs]);

  // Shuffle positions independently for each side
  const shuffledLeftPositions = shuffle([...leftPositions]);
  const shuffledRightPositions = shuffle([...rightPositions]);

  // Build new slot arrays
  const newLeftSlots = [...state.leftSlots];
  const newRightSlots = [...state.rightSlots];

  // Assign each pair to a position on each side
  // Each pair needs exactly one slot on left and one on right
  shuffledPairs.forEach((nextPairIndex, i) => {
    const leftPos = shuffledLeftPositions[i];
    const rightPos = shuffledRightPositions[i];

    const leftSlot = newLeftSlots[leftPos];
    const rightSlot = newRightSlots[rightPos];

    if (leftSlot.type === "fading") {
      newLeftSlots[leftPos] = { ...leftSlot, nextPairIndex };
    }
    if (rightSlot.type === "fading") {
      newRightSlots[rightPos] = { ...rightSlot, nextPairIndex };
    }
  });

  return { ...state, leftSlots: newLeftSlots, rightSlots: newRightSlots };
};

// ============================================================================
// Game Initialization
// ============================================================================

const initializeGame = (pairCount: number, displayCount: number): GameState => {
  const allIndices = shuffle(range(0, pairCount));
  const initialIndices = allIndices.slice(0, displayCount);
  const pool = allIndices.slice(displayCount);

  // Shuffle right side independently for variety
  const shuffledRightIndices = shuffle([...initialIndices]);

  const leftSlots: SlotState[] = initialIndices.map((pairIndex) => ({
    type: "active",
    pairIndex,
  }));

  const rightSlots: SlotState[] = shuffledRightIndices.map((pairIndex) => ({
    type: "active",
    pairIndex,
  }));

  return { leftSlots, rightSlots, pairPool: pool, matchedCount: 0 };
};

// ============================================================================
// Custom Hook
// ============================================================================

type UseGameProps = {
  pairs: WordPair[];
  onComplete?: () => void;
  onMatch?: (matchedCount: number, totalPairs: number) => void;
};

type UseGameReturn = {
  displayCount: number;
  matchedCount: number;
  totalPairs: number;
  progress: number;
  getSlotStatus: (side: ColumnSide, position: number) => PillStatus;
  getSlotWord: (side: ColumnSide, position: number) => string;
  isSlotFading: (side: ColumnSide, position: number) => boolean;
  isSlotEmpty: (side: ColumnSide, position: number) => boolean;
  handleSelection: (side: ColumnSide, position: number) => void;
  handleFadeComplete: (side: ColumnSide, position: number) => void;
};

export const useGame = ({ pairs, onComplete, onMatch }: UseGameProps): UseGameReturn => {
  const displayCount = Math.min(DISPLAY_SLOTS, pairs.length);
  const totalPairs = pairs.length;

  // Single unified game state (includes matchedCount for atomic updates)
  const [gameState, setGameState] = useState<GameState>(() =>
    initializeGame(pairs.length, displayCount)
  );

  // Derive matchedCount from game state
  const matchedCount = gameState.matchedCount;

  // Fail timeout refs for cleanup
  const failTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Store onMatch callback in ref to avoid stale closure
  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;

  // Track pairs reference to detect when new batch is loaded
  const pairsRef = useRef(pairs);

  // Track previous matchedCount to detect new matches
  const prevMatchedCountRef = useRef(0);

  // Reset game state when pairs change (new batch)
  useEffect(() => {
    if (pairsRef.current !== pairs) {
      pairsRef.current = pairs;
      const newDisplayCount = Math.min(DISPLAY_SLOTS, pairs.length);
      setGameState(initializeGame(pairs.length, newDisplayCount));
      prevMatchedCountRef.current = 0;
      // Clear any pending fail timeouts
      failTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      failTimeoutsRef.current.clear();
    }
  }, [pairs]);

  // Fire onMatch callback when matchedCount increases (no side effects in state updaters)
  useEffect(() => {
    if (matchedCount > prevMatchedCountRef.current) {
      onMatchRef.current?.(matchedCount, totalPairs);
      prevMatchedCountRef.current = matchedCount;
    }
  }, [matchedCount, totalPairs]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      failTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Slot Queries
  // ──────────────────────────────────────────────────────────────────────────

  const getSlots = useCallback(
    (side: ColumnSide) => (side === "left" ? gameState.leftSlots : gameState.rightSlots),
    [gameState.leftSlots, gameState.rightSlots]
  );

  const getSlotWord = useCallback(
    (side: ColumnSide, position: number): string => {
      const slot = getSlots(side)[position];
      if (slot.type === "empty") return "";
      const pairIndex = slot.pairIndex;
      return side === "left" ? pairs[pairIndex][0] : pairs[pairIndex][1];
    },
    [getSlots, pairs]
  );

  const isSlotFading = useCallback(
    (side: ColumnSide, position: number): boolean =>
      getSlots(side)[position]?.type === "fading",
    [getSlots]
  );

  const isSlotEmpty = useCallback(
    (side: ColumnSide, position: number): boolean =>
      getSlots(side)[position]?.type === "empty",
    [getSlots]
  );

  const getSlotStatus = useCallback(
    (side: ColumnSide, position: number): PillStatus => {
      const slot = getSlots(side)[position];

      const statusMap: Record<SlotState["type"], PillStatus> = {
        active: "blanc",
        selected: "selected",
        fail: "fail",
        fading: "success",
        empty: "blanc",
      };

      return statusMap[slot.type];
    },
    [getSlots]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Selection & Match Handling
  // ──────────────────────────────────────────────────────────────────────────

  const handleSelection = useCallback(
    (side: ColumnSide, position: number) => {
      setGameState((state) => {
        const slots = side === "left" ? state.leftSlots : state.rightSlots;
        const slot = slots[position];

        // Only active slots can be selected
        if (slot.type !== "active" && slot.type !== "selected") {
          return state;
        }

        const pairIndex = slot.pairIndex;

        // Toggle selection on same slot
        if (slot.type === "selected") {
          const newSlot: SlotState = { type: "active", pairIndex };
          return side === "left"
            ? { ...state, leftSlots: updateSlotAtPosition(state.leftSlots, position, newSlot) }
            : { ...state, rightSlots: updateSlotAtPosition(state.rightSlots, position, newSlot) };
        }

        // Check if same side already has a selection (switch selection)
        const sameSlots = side === "left" ? state.leftSlots : state.rightSlots;
        const sameSideSelectedIdx = sameSlots.findIndex((s) => s.type === "selected");

        if (sameSideSelectedIdx !== -1) {
          // Deselect the previous selection on same side, select the new one
          const prevSlot = sameSlots[sameSideSelectedIdx];
          const deselectedSlot: SlotState = { type: "active", pairIndex: prevSlot.pairIndex };
          const newSlot: SlotState = { type: "selected", pairIndex };

          const updatedSlots = sameSlots
            .map((s, i) => (i === sameSideSelectedIdx ? deselectedSlot : s))
            .map((s, i) => (i === position ? newSlot : s));

          return side === "left"
            ? { ...state, leftSlots: updatedSlots }
            : { ...state, rightSlots: updatedSlots };
        }

        // Check if other side has a selection
        const otherSlots = side === "left" ? state.rightSlots : state.leftSlots;
        const otherSelected = otherSlots.find((s) => s.type === "selected");

        if (!otherSelected) {
          // No selection on other side - just select this one
          const newSlot: SlotState = { type: "selected", pairIndex };
          return side === "left"
            ? { ...state, leftSlots: updateSlotAtPosition(state.leftSlots, position, newSlot) }
            : { ...state, rightSlots: updateSlotAtPosition(state.rightSlots, position, newSlot) };
        }

        // Both sides have selection - check for match
        const otherPairIndex = otherSelected.pairIndex;
        const isMatch = pairIndex === otherPairIndex;

        if (isMatch) {
          // Match found! Mark both as fading
          // Get next pair from pool
          const nextPairIndex = state.pairPool.length > 0 ? state.pairPool[0] : null;
          const newPool = state.pairPool.slice(1);

          // Update both slots to fading with next pair assignment
          const newLeftSlots = updateSlotByPairIndex(state.leftSlots, pairIndex, (s) => ({
            type: "fading",
            pairIndex: s.pairIndex,
            nextPairIndex,
          }));

          const newRightSlots = updateSlotByPairIndex(state.rightSlots, pairIndex, (s) => ({
            type: "fading",
            pairIndex: s.pairIndex,
            nextPairIndex,
          }));

          // Also deselect the other side (it was selected)
          const finalRightSlots =
            side === "left"
              ? updateSlotByPairIndex(newRightSlots, otherPairIndex, (s) => ({
                  type: "fading",
                  pairIndex: s.pairIndex,
                  nextPairIndex,
                }))
              : newRightSlots;

          const finalLeftSlots =
            side === "right"
              ? updateSlotByPairIndex(newLeftSlots, otherPairIndex, (s) => ({
                  type: "fading",
                  pairIndex: s.pairIndex,
                  nextPairIndex,
                }))
              : newLeftSlots;

          // Reshuffle provisional assignments (matchedCount incremented atomically)
          const newState: GameState = {
            leftSlots: finalLeftSlots,
            rightSlots: finalRightSlots,
            pairPool: newPool,
            matchedCount: state.matchedCount + 1,
          };

          return reshuffleProvisional(newState);
        } else {
          // Mismatch - mark both as fail
          const leftPairIndex = side === "left" ? pairIndex : otherPairIndex;
          const rightPairIndex = side === "right" ? pairIndex : otherPairIndex;

          const newLeftSlots = updateSlotByPairIndex(state.leftSlots, leftPairIndex, (s) => ({
            type: "fail",
            pairIndex: s.pairIndex,
          }));

          const newRightSlots = updateSlotByPairIndex(state.rightSlots, rightPairIndex, (s) => ({
            type: "fail",
            pairIndex: s.pairIndex,
          }));

          // Schedule timeout to clear fail state
          const timeoutKey = `${leftPairIndex}-${rightPairIndex}`;
          const existingTimeout = failTimeoutsRef.current.get(timeoutKey);
          if (existingTimeout) clearTimeout(existingTimeout);

          const timeout = setTimeout(() => {
            setGameState((s) => {
              const clearedLeft = updateSlotByPairIndex(s.leftSlots, leftPairIndex, (slot) =>
                slot.type === "fail" ? { type: "active", pairIndex: slot.pairIndex } : slot
              );
              const clearedRight = updateSlotByPairIndex(s.rightSlots, rightPairIndex, (slot) =>
                slot.type === "fail" ? { type: "active", pairIndex: slot.pairIndex } : slot
              );
              return { ...s, leftSlots: clearedLeft, rightSlots: clearedRight };
            });
            failTimeoutsRef.current.delete(timeoutKey);
          }, 1000);

          failTimeoutsRef.current.set(timeoutKey, timeout);

          return { ...state, leftSlots: newLeftSlots, rightSlots: newRightSlots };
        }
      });
    },
    []
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Fade Complete - Transition to active or empty
  // ──────────────────────────────────────────────────────────────────────────

  const handleFadeComplete = useCallback(
    (side: ColumnSide, position: number) => {
      setGameState((state) => {
        const slots = side === "left" ? state.leftSlots : state.rightSlots;
        const slot = slots[position];

        if (slot.type !== "fading") return state;

        const { nextPairIndex } = slot;

        const newSlot: SlotState =
          nextPairIndex !== null
            ? { type: "active", pairIndex: nextPairIndex }
            : { type: "empty" };

        return side === "left"
          ? { ...state, leftSlots: updateSlotAtPosition(state.leftSlots, position, newSlot) }
          : { ...state, rightSlots: updateSlotAtPosition(state.rightSlots, position, newSlot) };
      });
    },
    []
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Completion Detection
  // ──────────────────────────────────────────────────────────────────────────

  // Game is complete when all slots are empty (all pairs matched and faded out)
  const isGameComplete = useMemo(() => {
    if (pairs.length === 0) return false;
    const allLeftEmpty = gameState.leftSlots.every((slot) => slot.type === "empty");
    const allRightEmpty = gameState.rightSlots.every((slot) => slot.type === "empty");
    return allLeftEmpty && allRightEmpty;
  }, [gameState.leftSlots, gameState.rightSlots, pairs.length]);

  useEffect(() => {
    if (isGameComplete) {
      onComplete?.();
    }
  }, [isGameComplete, onComplete]);

  // Calculate progress as ratio of matched pairs to total
  const progress = totalPairs > 0 ? matchedCount / totalPairs : 0;

  return {
    displayCount,
    matchedCount,
    totalPairs,
    progress,
    getSlotStatus,
    getSlotWord,
    isSlotFading,
    isSlotEmpty,
    handleSelection,
    handleFadeComplete,
  };
};
