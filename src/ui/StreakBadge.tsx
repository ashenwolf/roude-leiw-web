import { FireIcon } from "./icons/FireIcon";
import { MoonIcon } from "./icons/MoonIcon";

type StreakBadgeProps = {
  current: number;
};

export const StreakBadge = ({ current }: StreakBadgeProps) => (
  <div className="flex items-center gap-1.5">
    {current > 0 ? (
      <FireIcon className="w-5 h-5 text-orange-500 animate-pulse" />
    ) : (
      <MoonIcon className="w-5 h-5 text-gray-400 opacity-40" />
    )}
    <span className="text-sm font-semibold text-gray-700">
      {current} {current === 1 ? "day" : "days"}
    </span>
  </div>
);
