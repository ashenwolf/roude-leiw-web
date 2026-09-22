import type React from "react";

import { Pill } from "./Pill";

import type { PillStatus } from "./Pill";

/**
 * An empty gap in running text — the unfilled counterpart of an inline `Pill`.
 *
 * Kept in the design system next to `Pill` because the two alternate in the same
 * position: a `@fill` blank is a `PillGap` until a tile lands in it and a `Pill`
 * afterwards, so their geometry has to match by construction. It renders as an
 * underline rather than an outlined chip — a gap in a sentence is not a control
 * dropped into it, and the quiet affordance mirrors the sentence builder's empty
 * answer row.
 *
 * `children` is the answer text, rendered transparent: it sizes the gap to what
 * will fill it, so dropping a tile in changes no geometry. That is load-bearing —
 * nothing in an exercise answer area may grow on tap, or the pool slides out from
 * under a finger already in flight.
 */
export const PillGap = ({
  children,
  aimed = false,
  onClick = () => {},
}: {
  children: React.ReactNode;
  /** The gap the next tapped tile will fill — the only affordance that changes. */
  aimed?: boolean;
  onClick?: React.Dispatch<void>;
}) => (
  <button
    type="button"
    onClick={() => onClick()}
    className={[
      // px-2 and the 2px border match an inline Pill exactly, so a filled and an
      // empty gap occupy the same box. Only the bottom border is visible.
      "align-middle leading-tight px-2 border-2 border-transparent cursor-pointer transition",
      aimed ? "border-b-sky-400" : "border-b-gray-300",
    ].join(" ")}
  >
    <span className="text-transparent select-none" aria-hidden="true">
      {children}
    </span>
  </button>
);

/**
 * A tile that has been used up — the same box as an inline-pool `Pill`, greyed and
 * inert, holding its space so the pool never reflows as tiles are consumed.
 */
export const PillSpent = ({ children }: { children: React.ReactNode }) => (
  <div className="h-10 px-4 rounded-lg border-2 border-gray-200 bg-gray-100 flex items-center">
    <span className="text-sm text-transparent select-none" aria-hidden="true">
      {children}
    </span>
  </div>
);

/**
 * One tile in an exercise tile pool: tappable, or spent and holding its place.
 *
 * Both exercises render exactly this pair, and both previously inlined the spent
 * variant's classes — so a change to the pool's metrics had to be made twice, in
 * two files, identically.
 */
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
