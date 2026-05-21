import { useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";

import { useNavigation } from "../context/useNavigation";
import { loadLessonMeta, loadLessonsUpToCursor } from "../exercise/lesson-loader";
import { projectHomeLessonsView } from "../exercise/lesson-rows";
import { computeOverallStats, computeLessonProgress, collectLessonKeys } from "../exercise/progression";
import { UNLOCK_LESSON_THRESHOLD } from "../exercise/constants";
import { computeXP, computePlayerLevel } from "../exercise/xp";
import { useProgress } from "../persistence/hooks/use-progress";
import { Button } from "../ui/Button";
import { RefreshIcon, ShuffleIcon } from "../ui/icons";
import { LessonGrid } from "../ui/LessonGrid";
import { StatsRow } from "../ui/StatsRow";
import { StreakBadge } from "../ui/StreakBadge";
import { XPBar } from "../ui/XPBar";

import type { Lesson } from "../exercise/letz-parser";
import type { LessonMeta } from "../exercise/lesson-loader";

export const AppHome = () => {
  const { navigateTo } = useNavigation();
  const posthog = usePostHog();
  const { words, streak, dailySessions, unlockedLessons } = useProgress();

  // Phase 1: manifest — renders lesson titles immediately (no .letz fetches).
  const [lessonMetas, setLessonMetas] = useState<LessonMeta[]>([]);
  const [metasLoading, setMetasLoading] = useState(true);

  // Phase 2: full content for unlocked lessons only — populates progress + unlock.
  const [lessons, setLessons] = useState<Lesson[]>([]);

  // Snapshot words at mount so the cascade predicate is stable (AppHome remounts
  // on every navigation, so we always get the latest stats).
  const wordsRef = useRef(words);

  // Phase 1: load manifest
  useEffect(() => {
    loadLessonMeta()
      .then((metas) => {
        setLessonMetas(metas);
        setMetasLoading(false);
      })
      .catch(() => setMetasLoading(false));
  }, []);

  // Snapshot the persisted unlocked set alongside words so the cascade keeps
  // fetching lessons that were once unlocked even if their predecessor has
  // since drifted below the 80% threshold (sticky unlock).
  const persistedUnlockedRef = useRef(unlockedLessons);

  // Phase 2: cascade-load unlocked .letz files (runs once metas are ready).
  // Stops after the first lesson that is neither currently passing nor in the
  // persisted-unlocked set, so we only fetch lessons the user has access to.
  useEffect(() => {
    if (lessonMetas.length === 0) return;
    const currentWords = wordsRef.current;
    const persisted = new Set(persistedUnlockedRef.current);
    loadLessonsUpToCursor(
      lessonMetas,
      (lesson) =>
        persisted.has(lesson.meta.id) ||
        computeLessonProgress(lesson, currentWords).percentage >= UNLOCK_LESSON_THRESHOLD,
    ).then(setLessons);
  }, [lessonMetas]);

  // Single producer: everything AppHome needs about lessons + progress.
  // Uses loaded (unlocked) lessons only — locked lessons show as empty in progressMap.
  const view = useMemo(
    () => projectHomeLessonsView(lessons, words, unlockedLessons),
    [lessons, words, unlockedLessons],
  );
  const { progressMap, unlockedIds, currentLessonId, totalElements } = view;

  const validKeys = useMemo(() => collectLessonKeys(lessons), [lessons]);

  const overallStats = useMemo(() => computeOverallStats(words, validKeys), [words, validKeys]);

  const xp = useMemo(() => computeXP(words, validKeys), [words, validKeys]);
  const levelInfo = useMemo(() => computePlayerLevel(xp), [xp]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayMinutes = (dailySessions[todayKey]?.durationSeconds ?? 0) / 60;

  // Group lesson metas by section, preserving manifest order. Sections within a
  // level appear in manifest order; lessons within a section keep their order.
  const sections = useMemo(() => {
    const ordered: { sectionId: string; sectionTitle: string; lessons: LessonMeta[] }[] = [];
    const indexById = new Map<string, number>();
    for (const meta of lessonMetas) {
      const idx = indexById.get(meta.sectionId);
      if (idx === undefined) {
        indexById.set(meta.sectionId, ordered.length);
        ordered.push({ sectionId: meta.sectionId, sectionTitle: meta.sectionTitle, lessons: [meta] });
      } else {
        ordered[idx].lessons.push(meta);
      }
    }
    return ordered;
  }, [lessonMetas]);

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

  const handleStartWordMix = () => {
    posthog?.capture("word_mix_started");
    navigateTo("word-mix");
  };

  const handleStartFixErrors = () => {
    posthog?.capture("fix_errors_started");
    navigateTo("fix-errors");
  };

  if (metasLoading) {
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
          masteredElements={overallStats.masteredElements}
          totalElements={totalElements}
          accuracy={overallStats.overallAccuracy}
          todayMinutes={todayMinutes}
        />

        {/* Lesson grid — titles from manifest (all lessons); progress from loaded subset */}
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <div key={section.sectionId}>
              <h3 className="text-sm font-semibold text-gray-600 mb-2">
                {section.sectionId} - {section.sectionTitle}
              </h3>
              <LessonGrid
                lessons={section.lessons}
                progressMap={progressMap}
                unlockedIds={unlockedIds}
                currentLessonId={currentLessonId}
                onSelectLesson={handleSelectLesson}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Practice mode buttons — sticky at bottom */}
      <div className="mt-auto sticky bottom-0 bg-white pt-2 pb-0 mx-[-1.5rem] mb-[-1.5rem] px-6 border-t border-gray-100">
        <div className="flex gap-2">
          <Button color="word-mix" size="sm" onClick={handleStartWordMix}>
            <span className="flex items-center justify-center gap-1.5">
              <ShuffleIcon className="w-4 h-4" /> Word Mix
            </span>
          </Button>
          <Button color="fix-errors" size="sm" onClick={handleStartFixErrors}>
            <span className="flex items-center justify-center gap-1.5">
              <RefreshIcon className="w-4 h-4" /> Fix Errors
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};
