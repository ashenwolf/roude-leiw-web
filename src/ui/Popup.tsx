import type React from "react";
import { useEffect, useState } from "react";

import { Button } from "./Button";

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

  // Handle mount/unmount and animation states
  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      // Small delay to ensure DOM is ready for animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      // Wait for exit animation to complete before unmounting
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Auto-dismiss for milestone variant
  useEffect(() => {
    if (visible && autoDismissMs && autoDismissMs > 0) {
      const timer = setTimeout(() => {
        onDismiss?.();
      }, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [visible, autoDismissMs, onDismiss]);

  if (!shouldRender) return null;

  const styles = variantStyles[variant];
  const translateClass = isAnimating ? "translate-y-0" : "translate-y-full";
  const backdropOpacity = isAnimating ? "opacity-100" : "opacity-0";

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 ${styles.backdrop} transition-opacity duration-300 ${backdropOpacity}`}
        onClick={onDismiss}
      />

      {/* Slide-up container */}
      <div
        className={`relative bg-white ${styles.container} transform transition-transform duration-300 ease-out ${translateClass}`}
      >
        <div className="flex flex-col items-center gap-4">
          {children}

          {variant === "complete" && onDismiss && (
            <div className="w-full mt-4">
              <Button onClick={onDismiss}>{actionLabel}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Convenience components for common use cases
export const MilestonePopup = ({
  visible,
  onDismiss,
  batchNumber,
  totalBatches,
}: {
  visible: boolean;
  onDismiss: () => void;
  batchNumber: number;
  totalBatches: number;
}) => (
  <Popup
    variant="milestone"
    visible={visible}
    onDismiss={onDismiss}
    autoDismissMs={2000}
  >
    <div className="text-center">
      <div className="text-4xl mb-2">🎯</div>
      <h3 className="text-xl font-bold text-gray-800">
        Set {batchNumber} of {totalBatches} Complete!
      </h3>
      <p className="text-gray-600 mt-1">Keep going!</p>
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
      <div className="text-6xl mb-4">🎉</div>
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
