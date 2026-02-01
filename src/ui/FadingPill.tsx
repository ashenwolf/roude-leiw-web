import type React from "react";
import { useEffect, useState } from "react";
import { Pill } from ".";
import type { PillStatus } from "./Pill";

export const FadingPill = ({
  children,
  hidden,
  onClick = () => { },
  status = "blanc",
}: {
  children: React.ReactNode;
  status?: PillStatus;
  onClick?: React.Dispatch<void>;
  hidden?: boolean;
}) => {
  const [fadeClass, setFadeClass] = useState("opacity-100");

  useEffect(() => {
    if (hidden) {
      setTimeout(() => setFadeClass("duration-1400 ease-in opacity-0"), 100);
    }
  }, [hidden]);

  return (
    <Pill status={status} onClick={onClick} className={fadeClass}>
      {children}
    </Pill>
  );
};
