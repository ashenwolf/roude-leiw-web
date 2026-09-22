import type React from "react";

/** A text-only control that must not compete with the primary `Button`. */

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
  /** Prefix a back-arrow glyph, so its spacing is decided once. */
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
