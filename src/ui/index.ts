export const UiColorMap = {
  primary: ["bg-lime-300", "hover:bg-lime-400", "inset-shadow-lime-500"],
  madness: ["bg-violet-200", "hover:bg-violet-300", "inset-shadow-violet-400"],
  mistakes: ["bg-amber-200", "hover:bg-amber-300", "inset-shadow-amber-400"],
} as const;

export type UiColor = keyof typeof UiColorMap;

export { Button } from "./Button";
export { Pill } from "./Pill";
export { AppWrapper } from "./AppWrapper";
export { Popup, MilestonePopup, SectionMilestonePopup, CelebrationPopup } from "./Popup";
export { ProgressBar } from "./ProgressBar";
export { LessonGrid } from "./LessonGrid";
export { XPBar } from "./XPBar";
export { StatsRow } from "./StatsRow";
export { StreakBadge } from "./StreakBadge";
