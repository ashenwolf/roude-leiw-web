import type React from "react";

import type { IconProps } from "./icons";

/**
 * A quiet icon-only control, for something secondary beside text (audio replay, a
 * dismiss) where `Button`'s labelled colour-filled pill is the wrong affordance.
 */

const IconButtonSizeMap = {
  // The icon nearly fills the box: there is no label to balance it.
  sm: ["w-9 h-9", "w-6 h-6"],
  md: ["w-11 h-11", "w-7 h-7"],
} as const;

export type IconButtonSize = keyof typeof IconButtonSizeMap;

const IconButtonToneMap = {
  quiet: "text-sky-600 hover:bg-sky-50 active:bg-sky-100",
  muted: "text-gray-500 hover:bg-gray-100 active:bg-gray-200",
} as const;

export type IconButtonTone = keyof typeof IconButtonToneMap;

export const IconButton = ({
  icon: Icon,
  label,
  onClick,
  size = "sm",
  tone = "quiet",
}: {
  /** The component, not an element: the button sizes the icon. */
  icon: (props: IconProps) => React.ReactNode;
  /** Accessible name — there is no text to read. */
  label: string;
  onClick: React.Dispatch<void>;
  size?: IconButtonSize;
  tone?: IconButtonTone;
}) => {
  const [box, iconSize] = IconButtonSizeMap[size];

  return (
    <button
      type="button"
      onClick={() => onClick()}
      aria-label={label}
      className={`${box} ${IconButtonToneMap[tone]} shrink-0 rounded-full flex items-center justify-center cursor-pointer transition`}
    >
      <Icon className={iconSize} />
    </button>
  );
};

/**
 * An invisible box exactly an `IconButton` wide, for the far side of centred text
 * or in place of a button that is not drawn, so nothing reflows when it appears.
 */
export const IconButtonSpacer = ({ size = "sm" }: { size?: IconButtonSize }) => (
  <div aria-hidden="true" className={`${IconButtonSizeMap[size][0]} shrink-0`} />
);
