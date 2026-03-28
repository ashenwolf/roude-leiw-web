import type { PlayerLevelInfo } from "../exercise/xp";

type XPBarProps = {
  levelInfo: PlayerLevelInfo;
};

export const XPBar = ({ levelInfo }: XPBarProps) => {
  const { current, next, xp, progressInLevel } = levelInfo;

  return (
    <div className="w-full">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-semibold text-gray-700">
          Lvl {current.level} — {current.title}
        </span>
        <span className="text-xs text-gray-500">
          {xp} XP{next ? ` / ${next.xpRequired}` : ""}
        </span>
      </div>
      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-lime-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.round(progressInLevel * 100)}%` }}
        />
      </div>
      {next && (
        <p className="text-xs text-gray-400 mt-0.5 text-right">
          {next.xpRequired - xp} XP to {next.title}
        </p>
      )}
    </div>
  );
};
