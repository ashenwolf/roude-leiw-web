export const UiColorMap = {
  primary: ["bg-lime-300", "hover:bg-lime-500", "inset-shadow-lime-500"],
  secondary: [],
} as const;

export type UiColor = keyof typeof UiColorMap;

export { Button } from "./Button";
export { Pill } from "./Pill";
export { AppWrapper } from "./AppWrapper";
export { Popup, MilestonePopup, CelebrationPopup } from "./Popup";
export { ProgressBar } from "./ProgressBar";
export { LessonGrid } from "./LessonGrid";
export { XPBar } from "./XPBar";
export { StatsRow } from "./StatsRow";
export { StreakBadge } from "./StreakBadge";
