import { useState } from "react";

import {
  classifyWord,
  computeLessonProgress,
  computeOverallStats,
  MASTERY,
  wordKey,
} from "../exercise/progression";
import type { Lesson } from "../exercise/letz-parser";
import type { WordStats } from "../context/auth";
import type { WordPair } from "../exercise/WordMatch/types";

type Props = {
  lessons: Lesson[];
  userWords: Record<string, WordStats>;
  currentBatchPairs: WordPair[];
  currentLessonId: string;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

type WordRowProps = {
  lu: string;
  en: string;
  stats: WordStats | undefined;
};

const WordRow = ({ lu, en, stats }: WordRowProps) => {
  const mastery = classifyWord(stats);
  const attempts = (stats?.correct ?? 0) + (stats?.incorrect ?? 0);
  const acc = attempts > 0 ? pct(stats!.correct / attempts) : "—";
  const needCorrect = MASTERY.correctToMaster - (stats?.correct ?? 0);

  const color =
    mastery === "mastered" ? "text-green-300"
    : mastery === "struggling" ? "text-red-400"
    : mastery === "learning" ? "text-blue-300"
    : "text-gray-500";

  const hint =
    mastery === "mastered" ? "" :
    mastery === "unseen" ? `needs ${MASTERY.correctToMaster} correct` :
    needCorrect > 0 ? `needs ${needCorrect} more correct` :
    "";

  return (
    <tr className={color}>
      <td className="pr-3 pl-4">{lu} = {en}</td>
      <td className="text-right pr-3">{stats?.shown ?? 0}</td>
      <td className="text-right pr-3">{stats?.correct ?? 0}/{attempts}</td>
      <td className="text-right pr-3">{acc}</td>
      <td className="text-right pr-3">{mastery}</td>
      <td className="text-gray-500 pl-2 italic">{hint}</td>
    </tr>
  );
};

type LessonRowProps = {
  lesson: Lesson;
  userWords: Record<string, WordStats>;
  isCurrent: boolean;
};

const LessonRow = ({ lesson, userWords, isCurrent }: LessonRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const progress = computeLessonProgress(lesson, userWords);

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-green-950/40 ${isCurrent ? "text-white" : "text-gray-400"}`}
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="pr-4 py-0.5">
          <span className="text-green-800 mr-1">{expanded ? "▼" : "▶"}</span>
          {isCurrent && <span className="text-yellow-400 mr-1">→</span>}
          {lesson.meta.id} "{lesson.meta.title}"
        </td>
        <td className="text-right pr-4">{progress.mastered}</td>
        <td className="text-right pr-4">{progress.total}</td>
        <td className="text-right pr-4">{pct(progress.percentage)}</td>
        <td className="text-right">{progress.isComplete ? "✓" : "·"}</td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={5} className="pb-2">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-gray-600">
                  <th className="text-left pl-4 pr-3">word</th>
                  <th className="text-right pr-3">shown</th>
                  <th className="text-right pr-3">correct/att</th>
                  <th className="text-right pr-3">acc</th>
                  <th className="text-right pr-3">level</th>
                  <th className="text-left pl-2">to master</th>
                </tr>
              </thead>
              <tbody>
                {lesson.entries.map((entry) => (
                  <WordRow
                    key={wordKey(entry.lu, entry.en)}
                    lu={entry.lu}
                    en={entry.en}
                    stats={userWords[wordKey(entry.lu, entry.en)]}
                  />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
};

export const DebugPanel = ({ lessons, userWords, currentBatchPairs, currentLessonId }: Props) => {
  const [open, setOpen] = useState(false);

  if (lessons.length === 0) return null;

  const overall = computeOverallStats(userWords);
  const lessonProgresses = lessons.map((l) => ({ lesson: l, progress: computeLessonProgress(l, userWords) }));
  const totalLessonWords = lessonProgresses.reduce((sum, { progress }) => sum + progress.total, 0);
  const masteredLessonWords = lessonProgresses.reduce((sum, { progress }) => sum + progress.mastered, 0);
  const unseenCount = totalLessonWords - overall.totalWords;

  const summaryText = `${masteredLessonWords}/${totalLessonWords} mastered (${pct(totalLessonWords > 0 ? masteredLessonWords / totalLessonWords : 0)}) · acc ${pct(overall.overallAccuracy)}`;

  return (
    <div className="hidden md:block fixed bottom-0 left-0 right-0 z-50 font-mono text-xs bg-neutral-950/95 text-green-400 border-t border-green-900">
      <button
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-green-950/60 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-green-300">DEBUG · {summaryText}</span>
        <span className="text-green-600">{open ? "▼" : "▲"}</span>
      </button>

      {open && (
        <div className="max-h-[65vh] overflow-y-auto px-4 pb-4 space-y-4 divide-y divide-green-900">
          {/* Mastery rules */}
          <section className="pt-3">
            <div className="text-yellow-400 font-bold mb-1">Mastery Rules</div>
            <div className="text-gray-300">
              <span className="text-green-300">mastered</span> = correct ≥ {MASTERY.correctToMaster}
            </div>
            <div className="text-gray-300">
              <span className="text-red-400">struggling</span> = shown ≥ {MASTERY.minShown} AND accuracy &lt; {pct(MASTERY.accuracyThreshold)}
            </div>
            <div className="text-gray-300">
              <span className="text-blue-300">learning</span> = seen but not yet mastered or struggling
            </div>
            <div className="text-gray-500 mt-1">lesson % = mastered words / total words in lesson</div>
          </section>

          {/* Overall breakdown */}
          <section className="pt-3">
            <div className="text-yellow-400 font-bold mb-1">Word Breakdown (all lessons)</div>
            <div className="flex gap-6 text-gray-300">
              <span><span className="text-gray-500">unseen</span> {unseenCount}</span>
              <span><span className="text-blue-300">learning</span> {overall.learningWords}</span>
              <span><span className="text-red-400">struggling</span> {overall.strugglingWords}</span>
              <span><span className="text-green-300">mastered</span> {overall.masteredWords}</span>
              <span><span className="text-gray-500">accuracy</span> {pct(overall.overallAccuracy)}</span>
            </div>
          </section>

          {/* Per-lesson progress — click to expand words */}
          <section className="pt-3">
            <div className="text-yellow-400 font-bold mb-1">Lesson Progress <span className="text-gray-500 font-normal">(click row to see words)</span></div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left pr-4">Lesson</th>
                  <th className="text-right pr-4">Mastered</th>
                  <th className="text-right pr-4">Total</th>
                  <th className="text-right pr-4">%</th>
                  <th className="text-right">Done</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson) => (
                  <LessonRow
                    key={lesson.meta.id}
                    lesson={lesson}
                    userWords={userWords}
                    isCurrent={lesson.meta.id === currentLessonId}
                  />
                ))}
              </tbody>
            </table>
          </section>

          {/* Current batch words */}
          {currentBatchPairs.length > 0 && (
            <section className="pt-3">
              <div className="text-yellow-400 font-bold mb-1">
                Current Batch ({currentBatchPairs.length} pairs)
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left pr-3">lu = en</th>
                    <th className="text-right pr-3">shown</th>
                    <th className="text-right pr-3">correct/att</th>
                    <th className="text-right pr-3">acc</th>
                    <th className="text-right pr-3">level</th>
                    <th className="text-left pl-2">to master</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBatchPairs.map(([lu, en]) => (
                    <WordRow
                      key={wordKey(lu, en)}
                      lu={lu}
                      en={en}
                      stats={userWords[wordKey(lu, en)]}
                    />
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
