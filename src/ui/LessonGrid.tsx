import type { Lesson } from "../exercise/letz-parser";
import type { LessonProgress } from "../exercise/progression";
import { CheckCircleIcon, LockIcon } from "./icons";

type LessonCardProps = {
  lesson: Lesson;
  progress: LessonProgress;
  isUnlocked: boolean;
  isCurrent: boolean;
  onSelect: () => void;
};

const LessonCard = ({ lesson, progress, isUnlocked, isCurrent, onSelect }: LessonCardProps) => {
  const pct = Math.round(progress.percentage * 100);
  const isComplete = progress.isComplete;

  return (
    <button
      onClick={onSelect}
      disabled={!isUnlocked}
      className={[
        "relative flex flex-col items-center justify-center",
        "w-full aspect-square rounded-xl p-2",
        "transition-all duration-200",
        isComplete
          ? "bg-green-100 border-2 border-green-400"
          : isCurrent
            ? "bg-lime-50 border-2 border-lime-400 ring-2 ring-lime-300 ring-offset-1"
            : isUnlocked
              ? "bg-white border-2 border-gray-200 hover:border-lime-300 hover:shadow-sm"
              : "bg-gray-100 border-2 border-gray-200 opacity-50 cursor-not-allowed",
      ].join(" ")}
    >
      {/* Lock overlay */}
      {!isUnlocked && (
        <LockIcon className="w-5 h-5 text-gray-400 opacity-60" />
      )}

      {/* Completion check */}
      {isComplete && (
        <CheckCircleIcon className="absolute top-1 right-1 w-5 h-5 text-green-500" />
      )}

      {/* Lesson title */}
      <span
        className={[
          "text-xs font-medium text-center leading-tight",
          isUnlocked ? "text-gray-700" : "text-gray-400",
        ].join(" ")}
      >
        {lesson.meta.title}
      </span>

      {/* Progress indicator */}
      {isUnlocked && !isComplete && (
        <div className="w-full mt-1.5 px-1">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-lime-400 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5 block text-center">
            {pct}%
          </span>
        </div>
      )}
    </button>
  );
};

type LessonGridProps = {
  lessons: Lesson[];
  progressMap: Record<string, LessonProgress>;
  unlockedIds: ReadonlyArray<string>;
  currentLessonId: string;
  onSelectLesson: (lessonId: string) => void;
};

export const LessonGrid = ({
  lessons,
  progressMap,
  unlockedIds,
  currentLessonId,
  onSelectLesson,
}: LessonGridProps) => (
  <div className="grid grid-cols-3 gap-3">
    {lessons.map((lesson) => (
      <LessonCard
        key={lesson.meta.id}
        lesson={lesson}
        progress={progressMap[lesson.meta.id] ?? { total: 0, mastered: 0, percentage: 0, isComplete: false }}
        isUnlocked={unlockedIds.includes(lesson.meta.id)}
        isCurrent={lesson.meta.id === currentLessonId}
        onSelect={() => onSelectLesson(lesson.meta.id)}
      />
    ))}
  </div>
);
