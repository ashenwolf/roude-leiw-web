import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";

import { useNavigation } from "../context/useNavigation";
import { loadLessonMeta, loadLessonsUpToCursor } from "../exercise/lesson-loader";
import { projectHomeLessonsView } from "../exercise/lesson-rows";
import { selectErrorPool } from "../exercise/error-pool";
import { computeOverallStats, computeLessonProgress, collectLessonKeys } from "../exercise/progression";
import { UNLOCK_LESSON_THRESHOLD } from "../exercise/constants";
import { computePlayerLevel } from "../exercise/xp";
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
  const { words, streak, dailySessions, unlockedLessons, totalXP, todayXP } = useProgress();

  // Phase 1: manifest — renders lesson titles immediately (no .letz fetches).
  const [lessonMetas, setLessonMetas] = useState<LessonMeta[]>([]);
  const [metasLoading, setMetasLoading] = useState(true);

  // Phase 2: full content for unlocked lessons only — populates progress + unlock.
  const [lessons, setLessons] = useState<Lesson[]>([]);

  // Phase 1: load manifest
  useEffect(() => {
    loadLessonMeta()
      .then((metas) => {
        setLessonMetas(metas);
        setMetasLoading(false);
      })
      .catch(() => setMetasLoading(false));
  }, []);

  // Phase 2: cascade-load unlocked .letz files. Re-runs whenever stats arrive or
  // change — on a hard reload `/api/auth/me` resolves AFTER mount, so `words` and
  // `unlockedLessons` start empty and only populate later; freezing them at mount
  // would stop the cascade at the first lesson and leave completed lessons'
  // successors locked-and-unloaded. The cascade stops after the first lesson that
  // is neither currently passing nor in the persisted-unlocked set (sticky
  // unlock), so we only fetch lessons the user has access to. The AbortController
  // drops a stale resolution if `words` changes again mid-fetch.
  useEffect(() => {
    if (lessonMetas.length === 0) return;
    const controller = new AbortController();
    const persisted = new Set(unlockedLessons);
    loadLessonsUpToCursor(
      lessonMetas,
      (lesson) =>
        persisted.has(lesson.meta.id) ||
        computeLessonProgress(lesson, words).percentage >= UNLOCK_LESSON_THRESHOLD,
    ).then((loaded) => {
      if (!controller.signal.aborted) setLessons(loaded);
    });
    return () => controller.abort();
  }, [lessonMetas, words, unlockedLessons]);

  // Single producer: everything AppHome needs about lessons + progress.
  // Uses loaded (unlocked) lessons only — locked lessons show as empty in progressMap.
  const view = useMemo(
    () => projectHomeLessonsView(lessons, words, unlockedLessons),
    [lessons, words, unlockedLessons],
  );
  const { progressMap, unlockedIds, currentLessonId, totalElements } = view;

  const validKeys = useMemo(() => collectLessonKeys(lessons), [lessons]);

  const overallStats = useMemo(() => computeOverallStats(words, validKeys), [words, validKeys]);

  const levelInfo = useMemo(() => computePlayerLevel(totalXP), [totalXP]);

  // Single source of truth for "struggling content" (see CLAUDE.md, Centralized
  // error pool). While phase-2 lessons are still loading, `lessons` is empty and
  // both pools come back empty → button stays disabled (safe default).
  const errorPool = useMemo(() => selectErrorPool(words, lessons), [words, lessons]);
  const fixErrorsDisabled = errorPool.words.length === 0 && errorPool.phrases.length === 0;

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
          todayXP={todayXP}
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
          <Button color="fix-errors" size="sm" onClick={handleStartFixErrors} disabled={fixErrorsDisabled}>
            <span className="flex items-center justify-center gap-1.5">
              <RefreshIcon className="w-4 h-4" /> Fix Errors
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};
