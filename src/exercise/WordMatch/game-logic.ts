import { shuffle } from "../../lib/shuffle";

import type { ColumnSide, GameState, SlotState, WordPair, WordResultMap } from "./types";

// ============================================================================
// Utility Functions
// ============================================================================

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => i + from);

// ============================================================================
// Word Result Tracking
// ============================================================================

const wordKey = (pair: WordPair) => `${pair[0]}|${pair[1]}`;

const markShown = (results: WordResultMap, pairs: WordPair[], pairIndices: number[]): WordResultMap =>
  pairIndices.reduce((acc, idx) => {
    const key = wordKey(pairs[idx]);
    const existing = acc[key] ?? { shown: 0, correct: 0, incorrect: 0 };
    return { ...acc, [key]: { ...existing, shown: existing.shown + 1 } };
  }, results);

const markCorrect = (results: WordResultMap, pairs: WordPair[], pairIndex: number): WordResultMap => {
  const key = wordKey(pairs[pairIndex]);
  const existing = results[key] ?? { shown: 0, correct: 0, incorrect: 0 };
  return { ...results, [key]: { ...existing, correct: existing.correct + 1 } };
};

const markIncorrect = (results: WordResultMap, pairs: WordPair[], pairIndex: number): WordResultMap => {
  const key = wordKey(pairs[pairIndex]);
  const existing = results[key] ?? { shown: 0, correct: 0, incorrect: 0 };
  return { ...results, [key]: { ...existing, incorrect: existing.incorrect + 1 } };
};

// ============================================================================
// Slot Helpers
// ============================================================================

const getVisiblePairs = (slots: SlotState[]): Set<number> =>
  new Set(
    slots
      .filter((s) => s.type === "active" || s.type === "selected" || s.type === "fail")
      .map((s) => s.pairIndex),
  );

const getProvisionalSlots = (
  slots: SlotState[],
  counterVisiblePairs: Set<number>,
): { position: number; nextPairIndex: number }[] =>
  slots
    .map((s, position) => ({ slot: s, position }))
    .filter(
      ({ slot }) =>
        slot.type === "fading" &&
        slot.nextPairIndex !== null &&
        !counterVisiblePairs.has(slot.nextPairIndex),
    )
    .map(({ slot, position }) => ({
      position,
      nextPairIndex: (slot as Extract<SlotState, { type: "fading" }>).nextPairIndex!,
    }));

const updateSlotAtPosition = (
  slots: SlotState[],
  position: number,
  newSlot: SlotState,
): SlotState[] => slots.map((slot, i) => (i === position ? newSlot : slot));

type NonEmptySlotState = Exclude<SlotState, { type: "empty" }>;

const updateSlotByPairIndex = (
  slots: SlotState[],
  pairIndex: number,
  updater: (slot: NonEmptySlotState) => SlotState,
): SlotState[] =>
  slots.map((slot) =>
    slot.type !== "empty" && slot.pairIndex === pairIndex ? updater(slot) : slot,
  );

const reshuffleProvisional = (state: GameState): GameState => {
  const leftVisible = getVisiblePairs(state.leftSlots);
  const rightVisible = getVisiblePairs(state.rightSlots);

  const leftProvisional = getProvisionalSlots(state.leftSlots, rightVisible);
  const rightProvisional = getProvisionalSlots(state.rightSlots, leftVisible);

  if (leftProvisional.length === 0) return state;

  const uniquePairs = [...new Set(leftProvisional.map((p) => p.nextPairIndex))];
  const shuffledPairs = shuffle([...uniquePairs]);
  const shuffledLeftPositions = shuffle(leftProvisional.map((p) => p.position));
  const shuffledRightPositions = shuffle(rightProvisional.map((p) => p.position));

  // Build position → nextPairIndex mappings
  const leftAssignments = new Map(shuffledPairs.map((pairIdx, i) => [shuffledLeftPositions[i], pairIdx]));
  const rightAssignments = new Map(shuffledPairs.map((pairIdx, i) => [shuffledRightPositions[i], pairIdx]));

  return {
    ...state,
    leftSlots: state.leftSlots.map((slot, i) =>
      leftAssignments.has(i) && slot.type === "fading"
        ? { ...slot, nextPairIndex: leftAssignments.get(i)! }
        : slot,
    ),
    rightSlots: state.rightSlots.map((slot, i) =>
      rightAssignments.has(i) && slot.type === "fading"
        ? { ...slot, nextPairIndex: rightAssignments.get(i)! }
        : slot,
    ),
  };
};

const isValueMatch = (pairs: WordPair[], leftPairIndex: number, rightPairIndex: number): boolean =>
  pairs[leftPairIndex][0] === pairs[rightPairIndex][0] ||
  pairs[leftPairIndex][1] === pairs[rightPairIndex][1];

// ============================================================================
// Events — returned by pure functions, consumed by React binding
// ============================================================================

export type GameEvent =
  | { type: "matched"; matchedCount: number; totalPairs: number }
  | { type: "completed"; wordResults: WordResultMap };

export type SelectionResult = {
  state: GameState;
  events: GameEvent[];
  failPair: { leftPairIndex: number; rightPairIndex: number } | null;
};

// ============================================================================
// Pure State Functions
// ============================================================================

export const initializeGame = (pairs: WordPair[], displayCount: number): GameState => {
  const allIndices = shuffle(range(0, pairs.length));
  const initialIndices = allIndices.slice(0, displayCount);
  const pool = allIndices.slice(displayCount);

  const shuffledRightIndices = shuffle([...initialIndices]);

  return {
    leftSlots: initialIndices.map((pairIndex) => ({ type: "active", pairIndex })),
    rightSlots: shuffledRightIndices.map((pairIndex) => ({ type: "active", pairIndex })),
    pairPool: pool,
    matchedCount: 0,
    wordResults: markShown({}, pairs, initialIndices),
  };
};

export const applySelection = (
  state: GameState,
  pairs: WordPair[],
  side: ColumnSide,
  position: number,
): SelectionResult => {
  const noChange: SelectionResult = { state, events: [], failPair: null };
  const totalPairs = pairs.length;

  const slots = side === "left" ? state.leftSlots : state.rightSlots;
  const slot = slots[position];

  if (slot.type !== "active" && slot.type !== "selected" && slot.type !== "fail") {
    return noChange;
  }

  const pairIndex = slot.pairIndex;

  // Toggle selection on same slot
  if (slot.type === "selected") {
    const newSlot: SlotState = { type: "active", pairIndex };
    const nextState = side === "left"
      ? { ...state, leftSlots: updateSlotAtPosition(state.leftSlots, position, newSlot) }
      : { ...state, rightSlots: updateSlotAtPosition(state.rightSlots, position, newSlot) };
    return { state: nextState, events: [], failPair: null };
  }

  // Switch selection on same side
  const sameSlots = side === "left" ? state.leftSlots : state.rightSlots;
  const sameSideSelectedIdx = sameSlots.findIndex((s) => s.type === "selected");

  if (sameSideSelectedIdx !== -1) {
    const prevSlot = sameSlots[sameSideSelectedIdx];
    if (prevSlot.type === "empty") return noChange;
    const updatedSlots = sameSlots
      .map((s, i) => (i === sameSideSelectedIdx ? { type: "active" as const, pairIndex: prevSlot.pairIndex } : s))
      .map((s, i) => (i === position ? { type: "selected" as const, pairIndex } : s));

    const nextState = side === "left"
      ? { ...state, leftSlots: updatedSlots }
      : { ...state, rightSlots: updatedSlots };
    return { state: nextState, events: [], failPair: null };
  }

  // Check other side for selection
  const otherSlots = side === "left" ? state.rightSlots : state.leftSlots;
  const otherSelected = otherSlots.find((s) => s.type === "selected");

  if (!otherSelected) {
    const newSlot: SlotState = { type: "selected", pairIndex };
    const nextState = side === "left"
      ? { ...state, leftSlots: updateSlotAtPosition(state.leftSlots, position, newSlot) }
      : { ...state, rightSlots: updateSlotAtPosition(state.rightSlots, position, newSlot) };
    return { state: nextState, events: [], failPair: null };
  }

  // Both sides selected — check match
  const otherPairIndex = otherSelected.pairIndex;
  const leftPairIndex = side === "left" ? pairIndex : otherPairIndex;
  const rightPairIndex = side === "right" ? pairIndex : otherPairIndex;

  if (isValueMatch(pairs, leftPairIndex, rightPairIndex)) {
    const nextPairIndex = state.pairPool.length > 0 ? state.pairPool[0] : null;
    const newPool = state.pairPool.slice(1);

    const newLeftSlots = updateSlotByPairIndex(state.leftSlots, leftPairIndex, (s) => ({
      type: "fading", pairIndex: s.pairIndex, nextPairIndex,
    }));
    const newRightSlots = updateSlotByPairIndex(state.rightSlots, rightPairIndex, (s) => ({
      type: "fading", pairIndex: s.pairIndex, nextPairIndex,
    }));

    const resultsWithCorrect = markCorrect(state.wordResults, pairs, leftPairIndex);
    const wordResults = nextPairIndex !== null
      ? markShown(resultsWithCorrect, pairs, [nextPairIndex])
      : resultsWithCorrect;

    const newMatchedCount = state.matchedCount + 1;
    const nextState = reshuffleProvisional({
      leftSlots: newLeftSlots, rightSlots: newRightSlots,
      pairPool: newPool, matchedCount: newMatchedCount, wordResults,
    });

    const events: GameEvent[] = [{ type: "matched", matchedCount: newMatchedCount, totalPairs }];
    if (newMatchedCount === totalPairs) {
      events.push({ type: "completed", wordResults: nextState.wordResults });
    }

    return { state: nextState, events, failPair: null };
  }

  // Mismatch
  const newLeftSlots = updateSlotByPairIndex(state.leftSlots, leftPairIndex, (s) => ({
    type: "fail", pairIndex: s.pairIndex,
  }));
  const newRightSlots = updateSlotByPairIndex(state.rightSlots, rightPairIndex, (s) => ({
    type: "fail", pairIndex: s.pairIndex,
  }));
  const wordResults = markIncorrect(
    markIncorrect(state.wordResults, pairs, leftPairIndex),
    pairs, rightPairIndex,
  );

  return {
    state: { ...state, leftSlots: newLeftSlots, rightSlots: newRightSlots, wordResults },
    events: [],
    failPair: { leftPairIndex, rightPairIndex },
  };
};

export const applyFadeComplete = (
  state: GameState,
  side: ColumnSide,
  position: number,
): GameState => {
  const slots = side === "left" ? state.leftSlots : state.rightSlots;
  const slot = slots[position];
  if (slot.type !== "fading") return state;

  const newSlot: SlotState = slot.nextPairIndex !== null
    ? { type: "active", pairIndex: slot.nextPairIndex }
    : { type: "empty" };

  return side === "left"
    ? { ...state, leftSlots: updateSlotAtPosition(state.leftSlots, position, newSlot) }
    : { ...state, rightSlots: updateSlotAtPosition(state.rightSlots, position, newSlot) };
};

export const applyClearFail = (
  state: GameState,
  leftPairIndex: number,
  rightPairIndex: number,
): GameState => ({
  ...state,
  leftSlots: updateSlotByPairIndex(state.leftSlots, leftPairIndex, (slot) =>
    slot.type === "fail" ? { type: "active", pairIndex: slot.pairIndex } : slot,
  ),
  rightSlots: updateSlotByPairIndex(state.rightSlots, rightPairIndex, (slot) =>
    slot.type === "fail" ? { type: "active", pairIndex: slot.pairIndex } : slot,
  ),
});
