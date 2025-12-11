import type React from "react";
import { useEffect, useState } from "react";

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
  sm: ["text-sm", "", "h-14"],
  md: ["text-md", "", "h-18"],
  lg: ["text-lg", "", "h-22"],
} as const;

type PillSize = keyof typeof PillSizeMap;

export const Pill = ({
  children,
  hidden,
  onClick = () => { },
  status = "blanc",
  size = "md",
}: {
  children: React.ReactNode;
  status?: PillStatus;
  onClick?: React.Dispatch<void>;
  size?: PillSize;
  hidden?: boolean;
}) => {
  const [bg, border, , shadow, text] = PillStatusColors[status];
  const [textSize, px, py] = PillSizeMap[size];
  const [hiding, setHiding] = useState("opacity-100");

  useEffect(() => {
    if (hidden) {
      setTimeout(() => setHiding("duration-1400 ease-in opacity-0"), 100);
    }
  }, [hidden]);

  return (
    <button
      onClick={() => onClick()}
      className={[
        bg,
        border,
        "border-2",
        // hover,
        "inset-shadow-[0_-3px_0px]",
        shadow,
        text,
        textSize,
        // "font-bold",
        px,
        py,
        "p-1",
        "rounded-lg",
        "cursor-pointer",
        "transition",
        hiding,
      ].join(" ")}
    >
      {children}
    </button>
  );
};
