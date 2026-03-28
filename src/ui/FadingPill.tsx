import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Pill } from ".";
import type { PillStatus } from "./Pill";

const FADE_DURATION_MS = 1400;
const FADE_START_DELAY_MS = 100;

export const FadingPill = ({
  children,
  hidden,
  onClick = () => {},
  onFadeComplete,
  status = "blanc",
}: {
  children: React.ReactNode;
  status?: PillStatus;
  onClick?: React.Dispatch<void>;
  onFadeComplete?: () => void;
  hidden?: boolean;
}) => {
  const [isFading, setIsFading] = useState(false);
  const fadeCompleteCalledRef = useRef(false);

  // Sync ref via effect — avoids render-time ref write
  const onFadeCompleteRef = useRef(onFadeComplete);
  useEffect(() => { onFadeCompleteRef.current = onFadeComplete; });

  useEffect(() => {
    if (hidden && !fadeCompleteCalledRef.current) {
      const fadeTimer = setTimeout(() => {
        setIsFading(true);
      }, FADE_START_DELAY_MS);

      const completeTimer = setTimeout(() => {
        if (!fadeCompleteCalledRef.current) {
          fadeCompleteCalledRef.current = true;
          onFadeCompleteRef.current?.();
        }
      }, FADE_DURATION_MS + FADE_START_DELAY_MS);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(completeTimer);
      };
    }

    // Reset when hidden becomes false (new content)
    if (!hidden) {
      fadeCompleteCalledRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsFading(false);
    }
  }, [hidden]);

  const fadeClass = isFading
    ? "transition-opacity duration-[1400ms] ease-in opacity-0"
    : "opacity-100";

  return (
    <Pill status={status} onClick={onClick} className={fadeClass}>
      {children}
    </Pill>
  );
};
