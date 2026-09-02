import type { LessonMeta } from "../exercise/lesson-loader";
import type { LessonProgress } from "../exercise/progression";
import { CheckCircleIcon, LockIcon } from "./icons";

type LessonCardProps = {
  lesson: LessonMeta;
  progress: LessonProgress | undefined;
  isUnlocked: boolean;
  isCurrent: boolean;
  onSelect: () => void;
};

const LessonCard = ({ lesson, progress, isUnlocked, isCurrent, onSelect }: LessonCardProps) => {
  // Bar reads `credit`, label reads the gate: `mastered` alone sits at 0% through
  // two Sessions of real work.
  const pct = progress ? Math.round(progress.credit * 100) : 0;
  const isComplete = progress?.isComplete ?? false;

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
        {lesson.title}
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
            {progress?.mastered ?? 0}/{progress?.total ?? 0}
          </span>
        </div>
      )}
    </button>
  );
};

type LessonGridProps = {
  /** All lessons from the manifest — used for titles and card layout. */
  lessons: LessonMeta[];
  /** Progress for loaded (unlocked) lessons only; absent for locked lessons. */
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
        key={lesson.id}
        lesson={lesson}
        progress={progressMap[lesson.id]}
        isUnlocked={unlockedIds.includes(lesson.id)}
        isCurrent={lesson.id === currentLessonId}
        onSelect={() => onSelectLesson(lesson.id)}
      />
    ))}
  </div>
);
