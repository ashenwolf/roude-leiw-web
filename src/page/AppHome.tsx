import { useEffect, useMemo, useState } from "react";

import { useNavigation } from "../context/useNavigation";
import { fetchManifest, fetchLesson } from "../exercise/lesson-loader";
import { computeLessonProgress, computeUnlockedLessonIds, findCurrentLessonId, computeOverallStats } from "../exercise/progression";
import { computeXP, computePlayerLevel } from "../exercise/xp";
import { useProgress } from "../persistence/hooks/use-progress";
import { Button } from "../ui/Button";
import { LessonGrid } from "../ui/LessonGrid";
import { StatsRow } from "../ui/StatsRow";
import { StreakBadge } from "../ui/StreakBadge";
import { XPBar } from "../ui/XPBar";

import type { Lesson } from "../exercise/letz-parser";
import type { LessonProgress } from "../exercise/progression";

export const AppHome = () => {
  const { navigateTo } = useNavigation();
  const { words, streak, dailySessions } = useProgress();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all lessons on mount
  useEffect(() => {
    fetchManifest()
      .then((manifest) =>
        Promise.all(
          manifest.levels.flatMap((level) =>
            level.lessons.map((l) => fetchLesson(level.id, l.file)),
          ),
        ),
      )
      .then((loaded) => {
        setLessons(loaded);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Derived progression state
  const unlockedIds = useMemo(
    () => computeUnlockedLessonIds(lessons, words),
    [lessons, words],
  );

  const currentLessonId = useMemo(
    () => findCurrentLessonId(lessons, words),
    [lessons, words],
  );

  const progressMap = useMemo(
    () =>
      Object.fromEntries(
        lessons.map((lesson) => [lesson.meta.id, computeLessonProgress(lesson, words)]),
      ) as Record<string, LessonProgress>,
    [lessons, words],
  );

  const overallStats = useMemo(() => computeOverallStats(words), [words]);

  const xp = useMemo(() => computeXP(words), [words]);
  const levelInfo = useMemo(() => computePlayerLevel(xp), [xp]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayMinutes = (dailySessions[todayKey]?.durationSeconds ?? 0) / 60;

  const handleSelectLesson = (lessonId: string) => {
    if (unlockedIds.includes(lessonId)) {
      navigateTo("exercise", { lessonId });
    }
  };

  const handleStartLearning = () => {
    navigateTo("exercise", { lessonId: currentLessonId });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-pulse text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header row: level + streak */}
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-500">Level A1</span>
        <StreakBadge current={streak?.current ?? 0} />
      </div>

      {/* XP Progress */}
      <XPBar levelInfo={levelInfo} />

      {/* Start learning CTA */}
      <Button onClick={handleStartLearning}>Start Learning</Button>

      {/* Stats */}
      <StatsRow
        masteredWords={overallStats.masteredWords}
        totalWords={lessons.reduce((sum, l) => sum + l.entries.length, 0)}
        accuracy={overallStats.overallAccuracy}
        streak={streak?.current ?? 0}
        todayMinutes={todayMinutes}
      />

      {/* Lesson grid */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-2">Lessons</h3>
        <LessonGrid
          lessons={lessons}
          progressMap={progressMap}
          unlockedIds={unlockedIds}
          currentLessonId={currentLessonId}
          onSelectLesson={handleSelectLesson}
        />
      </div>
    </div>
  );
};
