import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";

import { useNavigation } from "../context/useNavigation";
import { loadAllLessons } from "../exercise/lesson-loader";
import { projectHomeLessonsView } from "../exercise/lesson-rows";
import { computeOverallStats } from "../exercise/progression";
import { computeXP, computePlayerLevel } from "../exercise/xp";
import { useProgress } from "../persistence/hooks/use-progress";
import { Button } from "../ui/Button";
import { RefreshIcon, ShuffleIcon } from "../ui/icons";
import { LessonGrid } from "../ui/LessonGrid";
import { StatsRow } from "../ui/StatsRow";
import { StreakBadge } from "../ui/StreakBadge";
import { XPBar } from "../ui/XPBar";

import type { Lesson } from "../exercise/letz-parser";

export const AppHome = () => {
  const { navigateTo } = useNavigation();
  const posthog = usePostHog();
  const { words, streak, dailySessions } = useProgress();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all lessons on mount
  useEffect(() => {
    loadAllLessons()
      .then((loaded) => {
        setLessons(loaded);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Single producer: everything AppHome needs about lessons + progress
  const view = useMemo(() => projectHomeLessonsView(lessons, words), [lessons, words]);
  const { progressMap, unlockedIds, currentLessonId, totalWords } = view;

  const overallStats = useMemo(() => computeOverallStats(words), [words]);

  const xp = useMemo(() => computeXP(words), [words]);
  const levelInfo = useMemo(() => computePlayerLevel(xp), [xp]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayMinutes = (dailySessions[todayKey]?.durationSeconds ?? 0) / 60;

  const handleSelectLesson = (lessonId: string) => {
    if (unlockedIds.includes(lessonId)) {
      posthog?.capture("lesson_selected", { lesson_id: lessonId });
      navigateTo("exercise", { lessonId });
    }
  };

  const handleStartLearning = () => {
    posthog?.capture("lesson_started", { lesson_id: currentLessonId });
    navigateTo("exercise", { lessonId: currentLessonId });
  };

  const handleStartMadness = () => {
    posthog?.capture("madness_started");
    navigateTo("madness");
  };

  const handleStartMistakes = () => {
    posthog?.capture("mistakes_started");
    navigateTo("mistakes");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-pulse text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Scrollable content */}
      <div className="flex flex-col gap-5 pb-4">
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
          totalWords={totalWords}
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

      {/* Practice mode buttons — sticky at bottom */}
      <div className="mt-auto sticky bottom-0 bg-white pt-2 pb-0 mx-[-1.5rem] mb-[-1.5rem] px-6 border-t border-gray-100">
        <div className="flex gap-2">
          <Button color="madness" size="sm" onClick={handleStartMadness}>
            <span className="flex items-center justify-center gap-1.5">
              <ShuffleIcon className="w-4 h-4" /> Word Mix
            </span>
          </Button>
          <Button color="mistakes" size="sm" onClick={handleStartMistakes}>
            <span className="flex items-center justify-center gap-1.5">
              <RefreshIcon className="w-4 h-4" /> Fix Mistakes
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};
