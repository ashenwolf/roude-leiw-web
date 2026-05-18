import { describe, it, expect } from "vitest";
import { computeProgressView } from "../../../src/exercise/session-progress.ts";

// Helpers — 3 blocks of 5 slots (the Lesson mode shape)
const BOUNDS = [5, 10, 15] as const;

describe("computeProgressView", () => {
  it("all sections empty at start", () => {
    const view = computeProgressView(0, 0, 15, BOUNDS);
    expect(view.sections).toHaveLength(3);
    expect(view.sections.every((s) => s.fill === 0)).toBe(true);
    expect(view.overflow).toBeNull();
  });

  it("first slot in-progress contributes partial fill to section 1", () => {
    const view = computeProgressView(0, 0.5, 15, BOUNDS);
    expect(view.sections[0].fill).toBeCloseTo(0.1); // 0.5 / 5
    expect(view.sections[1].fill).toBe(0);
  });

  it("slot 5 done → section 1 full, section 2 at 0", () => {
    const view = computeProgressView(5, 0, 15, BOUNDS);
    expect(view.sections[0].fill).toBe(1);
    expect(view.sections[0].isDone).toBe(true);
    expect(view.sections[1].fill).toBe(0);
  });

  it("slot 7 done → section 1 full, section 2 at 2/5", () => {
    const view = computeProgressView(7, 0, 15, BOUNDS);
    expect(view.sections[0].isDone).toBe(true);
    expect(view.sections[1].fill).toBeCloseTo(2 / 5);
    expect(view.sections[2].fill).toBe(0);
  });

  it("all 15 slots done → all sections full, no overflow", () => {
    const view = computeProgressView(15, 0, 15, BOUNDS);
    expect(view.sections.every((s) => s.isDone)).toBe(true);
    expect(view.overflow).toBeNull();
  });

  it("overflow slot present → 4th bar appears", () => {
    const view = computeProgressView(15, 0, 17, BOUNDS);
    expect(view.overflow).not.toBeNull();
    expect(view.overflow!.fill).toBe(0);
  });

  it("overflow 1 of 2 done → overflow bar at 50%", () => {
    const view = computeProgressView(16, 0, 17, BOUNDS);
    expect(view.overflow!.fill).toBeCloseTo(0.5);
  });

  it("no overflow when totalSlots === plannedSlots", () => {
    expect(computeProgressView(15, 0, 15, BOUNDS).overflow).toBeNull();
  });

  it("word-mix shape — 3 blocks of 1 slot each", () => {
    const wordMixBounds = [1, 2, 3] as const;
    const view = computeProgressView(1, 0, 3, wordMixBounds);
    expect(view.sections[0].isDone).toBe(true);
    expect(view.sections[1].fill).toBe(0);
  });

  it("empty boundaries returns empty sections", () => {
    const view = computeProgressView(0, 0, 0, []);
    expect(view.sections).toHaveLength(0);
    expect(view.overflow).toBeNull();
  });
});
