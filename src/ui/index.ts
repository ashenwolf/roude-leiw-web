export const UiColorMap = {
  primary: ["bg-[#3DCEF3]", "hover:bg-[#00B4DC]", "inset-shadow-[#0090B0]", "text-black"],
  "word-mix": ["bg-violet-200", "hover:bg-violet-300", "inset-shadow-violet-400", "text-black"],
  "fix-errors": ["bg-amber-200", "hover:bg-amber-300", "inset-shadow-amber-400", "text-black"],
  exam: ["bg-rose-200", "hover:bg-rose-300", "inset-shadow-rose-400", "text-black"],
} as const;

export type UiColor = keyof typeof UiColorMap;

export { Button } from "./Button";
export { Pill } from "./Pill";
export { AppWrapper } from "./AppWrapper";
export { Popup, MilestonePopup, SectionMilestonePopup, CelebrationPopup } from "./Popup";
export { ProgressBar } from "./ProgressBar";
export { LessonGrid } from "./LessonGrid";
export { LessonImage } from "./LessonImage";
export { XPBar } from "./XPBar";
export { StatsRow } from "./StatsRow";
export { StreakBadge } from "./StreakBadge";
