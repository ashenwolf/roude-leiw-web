import type React from "react";

const PillStatusColors = {
  blanc: [
    "bg-white",
    "border-gray-200",
    "bg-gray-200",
    "inset-shadow-gray-200",
    "text-gray-800",
  ],
  selected: [
    "bg-sky-100",
    "border-sky-300",
    "bg-sky-300",
    "inset-shadow-sky-300",
    "text-sky-500",
  ],
  success: [
    "bg-green-100",
    "border-green-400",
    "bg-green-400",
    "inset-shadow-green-400",
    "text-green-600",
  ],
  fail: [
    "bg-rose-100",
    "border-rose-300",
    "bg-rose-300",
    "inset-shadow-rose-300",
    "text-rose-400",
  ],
} as const;

export type PillStatus = keyof typeof PillStatusColors;

const PillSizeMap = {
  // `inline` is for a pill sitting inside running text (a filled @fill blank). It
  // sets no font size — it inherits the surrounding text's — and hugs the word
  // instead of taking a fixed height, so the pill reads as part of the sentence
  // rather than as a control dropped into it.
  inline: ["", "px-2", "leading-tight"],
  sm: ["text-sm", "px-4", "h-10"],
  md: ["text-md", "", "h-18"],
  lg: ["text-lg", "", "h-22"],
} as const;

type PillSize = keyof typeof PillSizeMap;

export const Pill = ({
  children,
  className = "",
  onClick = () => { },
  status = "blanc",
  size = "md",
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: React.Dispatch<void>;
  status?: PillStatus;
  size?: PillSize;
}) => {
  const [bg, border, , shadow, text] = PillStatusColors[status];
  // Third slot is the vertical metric: a fixed height for the standalone sizes,
  // a line-height for `inline` (which must grow with the text it sits in).
  const [textSize, px, vertical] = PillSizeMap[size];

  return (
    <button
      onClick={() => onClick()}
      className={[
        bg,
        border,
        "border-2",
        "inset-shadow-[0_-3px_0px]",
        shadow,
        text,
        textSize,
        px,
        vertical,
        "p-1",
        "rounded-lg",
        "cursor-pointer",
        "transition",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
};
