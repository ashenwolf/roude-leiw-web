import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "./Button";
import { CelebrationIcon, ThumbsDownIcon, ThumbsUpIcon, TrophyIcon } from "./icons";

type PopupVariant = "milestone" | "complete";

type PopupProps = {
  children: React.ReactNode;
  variant?: PopupVariant;
  visible: boolean;
  onDismiss?: () => void;
  autoDismissMs?: number;
  actionLabel?: string;
};

const variantStyles: Record<PopupVariant, { container: string; backdrop: string }> = {
  milestone: {
    container: "rounded-t-3xl py-6 px-8",
    backdrop: "bg-black/30",
  },
  complete: {
    container: "rounded-t-3xl py-10 px-8",
    backdrop: "bg-black/50",
  },
};

export const Popup = ({
  children,
  variant = "complete",
  visible,
  onDismiss,
  autoDismissMs,
  actionLabel = "Continue",
}: PopupProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Single-fire guarantee: dismiss only fires once per show cycle
  const hasDismissedRef = useRef(false);

  const handleDismiss = useCallback(() => {
    if (hasDismissedRef.current) return;
    hasDismissedRef.current = true;
    onDismiss?.();
  }, [onDismiss]);

  // Mount/unmount animation: setState is intentional — we must mount DOM before triggering CSS transition
  useEffect(() => {
    if (visible) {
      hasDismissedRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Auto-dismiss timer
  useEffect(() => {
    if (visible && autoDismissMs && autoDismissMs > 0) {
      const timer = setTimeout(handleDismiss, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [visible, autoDismissMs, handleDismiss]);

  if (!shouldRender) return null;

  const styles = variantStyles[variant];
  const translateClass = isAnimating ? "translate-y-0" : "translate-y-full";
  const backdropOpacity = isAnimating ? "opacity-100" : "opacity-0";

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 ${styles.backdrop} transition-opacity duration-300 ${backdropOpacity}`}
        onClick={handleDismiss}
      />

      {/* Slide-up container */}
      <div
        className={`relative bg-white ${styles.container} transform transition-transform duration-300 ease-out ${translateClass}`}
      >
        <div className="flex flex-col items-center gap-4">
          {children}

          {variant === "complete" && onDismiss && (
            <div className="w-full mt-4">
              <Button onClick={handleDismiss}>{actionLabel}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Convenience components for common use cases

/** Brief auto-dismissing popup after each individual slot. */
export const MilestonePopup = ({
  visible,
  onDismiss,
  outcome = "success",
  correctAnswer,
}: {
  visible: boolean;
  onDismiss: () => void;
  outcome?: "success" | "mistake";
  /** Correct answer to display on a mistake — e.g. the accepted sentence translation. */
  correctAnswer?: string;
}) => (
  <Popup variant="complete" visible={visible} onDismiss={onDismiss} actionLabel="Continue">
    {outcome === "success" ? (
      <div className="text-center">
        <ThumbsUpIcon className="w-8 h-8 mx-auto mb-1 text-green-500" />
        <p className="text-gray-700 font-semibold">Nice one!</p>
      </div>
    ) : (
      <div className="text-center">
        <ThumbsDownIcon className="w-8 h-8 mx-auto mb-1 text-rose-400" />
        <p className="text-rose-500 font-semibold">Not quite — keep going!</p>
        {correctAnswer && (
          <div className="mt-3 px-3 py-2 bg-rose-50 rounded-lg border border-rose-200">
            <p className="text-xs text-rose-400 mb-1">Correct answer</p>
            <p className="text-sm text-rose-700 font-medium">{correctAnswer}</p>
          </div>
        )}
      </div>
    )}
  </Popup>
);

/** User-dismissed popup after completing a full section (5 slots). */
export const SectionMilestonePopup = ({
  visible,
  onDismiss,
  section,
}: {
  visible: boolean;
  onDismiss: () => void;
  section: number;
}) => (
  <Popup variant="complete" visible={visible} onDismiss={onDismiss} actionLabel="Keep going!">
    <div className="text-center">
      <TrophyIcon className="w-12 h-12 mx-auto mb-3 text-amber-500" />
      <h3 className="text-2xl font-bold text-gray-800">Section {section} Complete!</h3>
      <p className="text-gray-500 mt-1">{section < 3 ? `${3 - section} section${3 - section > 1 ? "s" : ""} to go` : "Last one done!"}</p>
    </div>
  </Popup>
);

export const CelebrationPopup = ({
  visible,
  onDismiss,
  onTryAgain,
}: {
  visible: boolean;
  onDismiss: () => void;
  onTryAgain?: () => void;
}) => (
  <Popup variant="complete" visible={visible} onDismiss={onDismiss}>
    <div className="text-center">
      <CelebrationIcon className="w-16 h-16 mx-auto mb-4 text-green-500" />
      <h2 className="text-2xl font-bold text-green-600">Exercise Complete!</h2>
      <p className="text-gray-600 mt-2">Great job matching all the words!</p>
    </div>
    {onTryAgain && (
      <button
        onClick={onTryAgain}
        className="text-sky-500 font-medium hover:text-sky-600 transition-colors"
      >
        Try Again
      </button>
    )}
  </Popup>
);
