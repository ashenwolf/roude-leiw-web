/**
 * Pure producer: maps session slot state → ProgressView for rendering.
 * No React, no I/O. Any exercise session that tracks slot progress can use this.
 */

export type ProgressSection = {
  fill: number;    // 0–1
  isDone: boolean;
};

export type ProgressView = {
  sections: ProgressSection[];
  overflow: ProgressSection | null; // null = no re-queued slots
};

/**
 * Computes the progress bar state from the current slot position.
 *
 * @param completedSlots  - number of fully completed slots
 * @param slotProgress    - fractional progress within the current slot (0–1)
 * @param totalSlots      - total slots in the queue (including overflow)
 * @param blockBoundaries - cumulative slot counts at each Block end (from ModeConfig)
 */
export const computeProgressView = (
  completedSlots: number,
  slotProgress: number,
  totalSlots: number,
  blockBoundaries: ReadonlyArray<number>,
): ProgressView => {
  const plannedSlots = blockBoundaries.length > 0
    ? blockBoundaries[blockBoundaries.length - 1]
    : 0;

  const sections: ProgressSection[] = blockBoundaries.map((boundary, i) => {
    const start = i === 0 ? 0 : blockBoundaries[i - 1];
    const size = boundary - start;
    const done = Math.max(0, Math.min(completedSlots - start, size));
    const isCurrent = completedSlots >= start && completedSlots < boundary;
    const fill = Math.min((done + (isCurrent ? slotProgress : 0)) / size, 1);
    return { fill, isDone: fill >= 1 };
  });

  const overflowCount = Math.max(0, totalSlots - plannedSlots);
  if (overflowCount === 0) return { sections, overflow: null };

  const overflowDone = Math.max(0, completedSlots - plannedSlots);
  const isCurrentOverflow = completedSlots >= plannedSlots;
  const overflowFill = Math.min((overflowDone + (isCurrentOverflow ? slotProgress : 0)) / overflowCount, 1);

  return { sections, overflow: { fill: overflowFill, isDone: false } };
};
