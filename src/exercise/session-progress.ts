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

export const computeProgressView = (
  completedSlots: number,
  slotProgress: number,
  totalSlots: number,
  plannedSlots: number,
  sectionSize: number = 5,
): ProgressView => {
  const sectionCount = Math.ceil(plannedSlots / sectionSize);

  const sections: ProgressSection[] = Array.from({ length: sectionCount }, (_, s) => {
    const start = s * sectionSize;
    const done = Math.max(0, Math.min(completedSlots - start, sectionSize));
    const isCurrent = completedSlots >= start && completedSlots < start + sectionSize;
    const inProgressContribution = isCurrent ? slotProgress : 0;
    const fill = Math.min((done + inProgressContribution) / sectionSize, 1);
    return { fill, isDone: fill >= 1 };
  });

  const overflowCount = Math.max(0, totalSlots - plannedSlots);
  if (overflowCount === 0) return { sections, overflow: null };

  const overflowDone = Math.max(0, completedSlots - plannedSlots);
  const isCurrentOverflow = completedSlots >= plannedSlots;
  const overflowContrib = isCurrentOverflow ? slotProgress : 0;
  const overflowFill = Math.min((overflowDone + overflowContrib) / overflowCount, 1);

  return { sections, overflow: { fill: overflowFill, isDone: false } };
};
