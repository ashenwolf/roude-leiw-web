import type React from "react";
import { UiColorMap, type UiColor } from ".";

const SizeMap = {
  md: "text-lg py-3 px-6",
  sm: "text-sm py-2 px-4",
} as const;

type ButtonSize = keyof typeof SizeMap;

export const Button = ({
  children,
  color = "primary",
  size = "md",
  onClick = () => {},
  disabled = false,
}: {
  children: React.ReactNode;
  color?: UiColor;
  size?: ButtonSize;
  onClick?: React.Dispatch<void>;
  disabled?: boolean;
}) => {
  const [bg, hover, shadow] = UiColorMap[color];
  const sizeClasses = SizeMap[size];

  return (
    <button
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      className={`${bg} w-full ${hover} ${shadow} ${sizeClasses} inset-shadow-[0_-2px_0px] text-black font-bold rounded-full disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
};
