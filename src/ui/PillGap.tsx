import type React from "react";

import { Pill } from "./Pill";

import type { PillStatus } from "./Pill";

/**
 * The unfilled counterpart of an inline `Pill`. The two alternate in the same
 * position, so their geometry must match — keep them side by side.
 *
 * `children` is the answer text rendered transparent, which sizes the gap to what
 * will fill it. Nothing in an answer area may grow on tap, or the tile pool slides
 * out from under a finger already in flight.
 */
export const PillGap = ({
  children,
  aimed = false,
  onClick = () => {},
}: {
  children: React.ReactNode;
  /** The gap the next tapped tile will fill. */
  aimed?: boolean;
  onClick?: React.Dispatch<void>;
}) => (
  <button
    type="button"
    onClick={() => onClick()}
    className={[
      // px-2 and the 2px border match an inline Pill, so filled and empty occupy
      // the same box; only the bottom border shows.
      "align-middle leading-tight px-2 border-2 border-transparent cursor-pointer transition",
      aimed ? "border-b-sky-400" : "border-b-gray-300",
    ].join(" ")}
  >
    <span className="text-transparent select-none" aria-hidden="true">
      {children}
    </span>
  </button>
);

/** A used-up tile: same box as its `Pill`, so the pool never reflows. */
export const PillSpent = ({ children }: { children: React.ReactNode }) => (
  <div className="h-10 px-4 rounded-lg border-2 border-gray-200 bg-gray-100 flex items-center">
    <span className="text-sm text-transparent select-none" aria-hidden="true">
      {children}
    </span>
  </div>
);

/** One pool tile: tappable, or spent and holding its place. */
export const PillTile = ({
  children,
  spent = false,
  status = "blanc",
  onClick = () => {},
}: {
  children: React.ReactNode;
  spent?: boolean;
  status?: PillStatus;
  onClick?: React.Dispatch<void>;
}) =>
  spent ? (
    <PillSpent>{children}</PillSpent>
  ) : (
    <Pill size="sm" status={status} onClick={onClick}>
      {children}
    </Pill>
  );
