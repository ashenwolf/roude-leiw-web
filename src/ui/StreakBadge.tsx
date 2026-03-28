type StreakBadgeProps = {
  current: number;
};

export const StreakBadge = ({ current }: StreakBadgeProps) => (
  <div className="flex items-center gap-1.5">
    <span className={`text-lg ${current > 0 ? "animate-pulse" : "opacity-40"}`}>
      {current > 0 ? "\uD83D\uDD25" : "\u2744\uFE0F"}
    </span>
    <span className="text-sm font-semibold text-gray-700">
      {current} {current === 1 ? "day" : "days"}
    </span>
  </div>
);
