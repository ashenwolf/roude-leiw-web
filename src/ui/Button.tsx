import type React from "react";
import { UiColorMap, type UiColor } from ".";

export const Button = ({
  children,
  color = "primary",
  onClick = () => {},
}: {
  children: React.ReactNode;
  color?: UiColor;
  onClick?: React.Dispatch<void>;
}) => {
  const [bg, hover, shadow] = UiColorMap[color];

  return (
    <button
      onClick={() => onClick()}
      className={`${bg} w-full text-lg ${hover} ${shadow} inset-shadow-[0_-2px_0px] text-black font-bold py-3 px-6 rounded-full cursor-pointer`}
    >
      {children}
    </button>
  );
};
