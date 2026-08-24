import type { ReactNode } from "react";

type Props = { className?: string; children: ReactNode };

const cx = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");

/**
 * Prompt and answer-in-progress, centred in the space above the tile pool.
 *
 * Centring is only safe because everything in here keeps a constant height as the
 * learner answers — a filled blank is pre-sized to its word, an assembled row is
 * pre-sized to the whole token set. Put anything that grows on tap in here and
 * every tap will re-centre the exercise, moving the tile the learner aims at next.
 */
export const ExerciseAnswerArea = ({ className, children }: Props) => (
  <div className={cx("flex-1 flex flex-col justify-center", className)}>{children}</div>
);

/**
 * The pool of tappable tiles, anchored just above the bottom bar and thus within
 * easy thumb reach. A used tile leaves a same-sized placeholder behind, so the
 * pool's geometry is fixed for the life of the Slot and tapping a tile never
 * moves its neighbours.
 */
export const ExerciseTilePool = ({ className, children }: Props) => (
  <div className={cx("flex flex-wrap justify-center content-start px-2 pb-4", className)}>
    {children}
  </div>
);
