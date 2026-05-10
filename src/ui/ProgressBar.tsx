import type { ProgressView } from "../exercise/session-progress";

type ProgressBarProps = {
  view: ProgressView;
};

export const ProgressBar = ({ view }: ProgressBarProps) => (
  <div className="w-full flex items-center gap-2">
    {view.sections.map((section, i) => (
      <div key={i} className="flex-1 h-4 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={[
            "h-full rounded-full transition-all duration-300 ease-out",
            section.isDone ? "bg-green-500" : "bg-lime-400",
          ].join(" ")}
          style={{ width: `${section.fill * 100}%` }}
        />
      </div>
    ))}

    {view.overflow && (
      <div className="w-10 h-4 rounded-full bg-orange-100 overflow-hidden flex-shrink-0">
        <div
          className="h-full rounded-full bg-orange-400 transition-all duration-300 ease-out"
          style={{ width: `${view.overflow.fill * 100}%` }}
        />
      </div>
    )}
  </div>
);
