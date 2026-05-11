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
  fullWidth = true,
  onClick = () => {},
  disabled = false,
}: {
  children: React.ReactNode;
  color?: UiColor;
  size?: ButtonSize;
  fullWidth?: boolean;
  onClick?: React.Dispatch<void>;
  disabled?: boolean;
}) => {
  const [bg, hover, shadow, text] = UiColorMap[color];
  const sizeClasses = SizeMap[size];

  return (
    <button
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      className={`${bg} ${fullWidth ? "w-full" : ""} ${hover} ${shadow} ${sizeClasses} ${text} inset-shadow-[0_-2px_0px] font-bold rounded-full disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
};
