import type React from "react";

export type IconProps = { className?: string };

export const IconBase = ({ className = "w-6 h-6", children }: IconProps & { children: React.ReactNode }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} aria-hidden="true">
    {children}
  </svg>
);
