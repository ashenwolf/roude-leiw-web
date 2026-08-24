import type { ReactNode } from "react";

type Props = { children: ReactNode };

/**
 * Docks children to the bottom of the frame, Duolingo-style: `mt-auto` pushes
 * it there when the content above leaves slack, `sticky bottom-0` keeps it
 * visible while that content scrolls. Must render directly under `<main>`
 * with no other horizontal padding in between — `mx-[-1.5rem] px-6` cancels
 * exactly `<main>`'s own padding for an edge-to-edge bar.
 */
export const PinnedBottomBar = ({ children }: Props) => (
  <div className="mt-auto sticky bottom-0 bg-white pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] mx-[-1.5rem] px-6 border-t border-gray-100">
    {children}
  </div>
);
