import type React from "react";

import type { IconProps } from "./icons";

/**
 * A circular icon-only button, and the accompanying width reservation.
 *
 * Distinct from `Button`, which is a full-width pill with a label and carries a
 * `UiColor` fill — the wrong affordance for a secondary control sitting beside
 * text (an audio replay, a dismiss). This one is quiet: no fill until hover,
 * sized by its own scale rather than by padding around a label.
 *
 * `IconButtonSpacer` exists because centring text with one control beside it
 * needs an invisible mirror on the other side, and that mirror must be the same
 * width as the button by construction — two hand-written `w-9 h-9` divs drift the
 * moment a size changes.
 */

const IconButtonSizeMap = {
  // `sm` is the 36px touch target used beside a prompt line, with the 24px icon the
  // audio control shipped with — the icon nearly fills the box on purpose, since
  // there is no label to balance it.
  sm: ["w-9 h-9", "w-6 h-6"],
  md: ["w-11 h-11", "w-7 h-7"],
} as const;

export type IconButtonSize = keyof typeof IconButtonSizeMap;

const IconButtonToneMap = {
  /** A supporting control: no chrome until touched. */
  quiet: "text-sky-600 hover:bg-sky-50 active:bg-sky-100",
  /** Same shape, lower emphasis — for a control that must not draw the eye. */
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
  /** The icon component itself, so the button owns the icon's size. */
  icon: (props: IconProps) => React.ReactNode;
  /** Accessible name — an icon-only control has no text to read. */
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
 * An invisible box the exact size of an `IconButton` at the same scale.
 *
 * Use it to reserve the button's width — on the opposite side of centred text, or
 * in place of a button that is not drawn — so the layout never reflows when the
 * control appears or disappears.
 */
export const IconButtonSpacer = ({ size = "sm" }: { size?: IconButtonSize }) => (
  <div aria-hidden="true" className={`${IconButtonSizeMap[size][0]} shrink-0`} />
);
