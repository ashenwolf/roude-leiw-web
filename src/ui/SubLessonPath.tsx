import { CheckCircleIcon, LockIcon } from "./icons";

import type { SubLessonView, ThemeView } from "../exam/exam-progression";

// Visual states mirror LessonCard's palette (locked / current / unlocked / complete)
// in a vertical path layout — one node per sub-lesson, in theme order.
const nodeClasses = (view: SubLessonView, isCurrent: boolean): string =>
  view.played
    ? "bg-green-100 border-green-400"
    : isCurrent
      ? "bg-lime-50 border-lime-400 ring-2 ring-lime-300 ring-offset-1"
      : view.unlocked
        ? "bg-white border-gray-200 hover:border-lime-300 hover:shadow-sm"
        : "bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed";

type SubLessonNodeProps = {
  view: SubLessonView;
  isCurrent: boolean;
  onSelect: () => void;
};

const SubLessonNode = ({ view, isCurrent, onSelect }: SubLessonNodeProps) => {
  const pct = view.progress ? Math.round(view.progress.percentage * 100) : 0;

  return (
    <button
      onClick={onSelect}
      disabled={!view.unlocked}
      className={`flex items-center gap-3 w-full rounded-xl border-2 p-3 transition-all duration-200 ${nodeClasses(view, isCurrent)}`}
    >
      <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-white/70 border border-gray-200">
        {view.played ? (
          <CheckCircleIcon className="w-5 h-5 text-green-500" />
        ) : view.unlocked ? (
          <span className="text-sm font-bold text-gray-600">{view.meta.id.split(".").pop()}</span>
        ) : (
          <LockIcon className="w-4 h-4 text-gray-400" />
        )}
      </span>

      <span className="flex flex-col items-start flex-1 min-w-0">
        <span className={`text-sm font-medium ${view.unlocked ? "text-gray-700" : "text-gray-400"}`}>
          {view.meta.title}
        </span>
        {view.unlocked && view.progress && (
          <span className="w-full mt-1.5 flex items-center gap-2">
            <span className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
              <span
                className="block h-full bg-lime-400 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-[10px] text-gray-400">{pct}%</span>
          </span>
        )}
      </span>
    </button>
  );
};

type SubLessonPathProps = {
  theme: ThemeView;
  onSelectSubLesson: (subLessonId: string) => void;
};

export const SubLessonPath = ({ theme, onSelectSubLesson }: SubLessonPathProps) => {
  const currentId = theme.subLessons.find((v) => v.unlocked && !v.played)?.meta.id;

  return (
    <div className="flex flex-col gap-2">
      {theme.subLessons.map((view) => (
        <SubLessonNode
          key={view.meta.id}
          view={view}
          isCurrent={view.meta.id === currentId}
          onSelect={() => onSelectSubLesson(view.meta.id)}
        />
      ))}
    </div>
  );
};
