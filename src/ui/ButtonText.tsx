import type React from "react";

/**
 * A quiet text-only control — the "Back" affordance, and anything else that must
 * be tappable without competing with the primary `Button`.
 *
 * In the system because the same class string had been hand-written at four call
 * sites across two pages, in two sizes, with the arrow glyph inconsistently part
 * of the label. `withArrow` owns the glyph so the spacing is decided once.
 */

const ButtonTextSizeMap = {
  sm: "text-sm",
  md: "text-base",
} as const;

export type ButtonTextSize = keyof typeof ButtonTextSizeMap;

export const ButtonText = ({
  children,
  onClick,
  size = "sm",
  withArrow = false,
}: {
  children: React.ReactNode;
  onClick: React.Dispatch<void>;
  size?: ButtonTextSize;
  /** Prefix a back-arrow glyph — for navigation away from the current view. */
  withArrow?: boolean;
}) => (
  <button
    type="button"
    onClick={() => onClick()}
    className={`${ButtonTextSizeMap[size]} text-gray-500 hover:text-gray-700 cursor-pointer transition-colors`}
  >
    {withArrow ? `← ${children}` : children}
  </button>
);
