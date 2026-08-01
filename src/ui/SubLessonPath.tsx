import { CheckCircleIcon, LockIcon } from "./icons";

import type { SubLessonView, ThemeView } from "../exam/exam-progression";

// One node per sub-lesson in a vertical path. Visual states mirror LessonCard's
// palette (locked / current / unlocked / passed). The green check means PASSED
// (fully mastered) — the same thing that opens the next node, so a checked node
// is never followed by a locked one.
type NodeState = "passed" | "current" | "unlocked" | "locked";

const NODE_STATES: Record<NodeState, { className: string }> = {
  passed: { className: "bg-green-100 border-green-400" },
  current: { className: "bg-lime-50 border-lime-400 ring-2 ring-lime-300 ring-offset-1" },
  unlocked: { className: "bg-white border-gray-200 hover:border-lime-300 hover:shadow-sm" },
  locked: { className: "bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed" },
};

const nodeState = (view: SubLessonView, isCurrent: boolean): NodeState => {
  if (view.passed) return "passed";
  if (!view.unlocked) return "locked";
  return isCurrent ? "current" : "unlocked";
};

const NodeBadge = ({ state, step }: { state: NodeState; step: string }) => {
  if (state === "passed") return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
  if (state === "locked") return <LockIcon className="w-4 h-4 text-gray-400" />;
  return <span className="text-sm font-bold text-gray-600">{step}</span>;
};

type SubLessonNodeProps = {
  view: SubLessonView;
  isCurrent: boolean;
  onSelect: () => void;
};

const SubLessonNode = ({ view, isCurrent, onSelect }: SubLessonNodeProps) => {
  const state = nodeState(view, isCurrent);
  const pct = view.progress ? Math.round(view.progress.percentage * 100) : 0;

  return (
    <button
      onClick={onSelect}
      disabled={!view.unlocked}
      className={`flex items-center gap-3 w-full rounded-xl border-2 p-3 transition-all duration-200 ${NODE_STATES[state].className}`}
    >
      <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-white/70 border border-gray-200">
        <NodeBadge state={state} step={view.meta.id.split(".").pop() ?? ""} />
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
  const currentId = theme.subLessons.find((v) => v.unlocked && !v.passed)?.meta.id;

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
