import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";

import { useNavigation } from "../context/useNavigation";
import { loadExamMeta, fetchSubLesson } from "../exam/exam-catalog";
import { computeExamView, selectSubLessonsToLoad } from "../exam/exam-progression";
import { useProgress } from "../persistence/hooks/use-progress";
import { GraduationCapIcon } from "../ui/icons";
import { SubLessonPath } from "../ui/SubLessonPath";

import type { SubLessonMeta } from "../exam/exam-catalog";
import type { Lesson } from "../exercise/letz-parser";

export const AppExam = () => {
  const { navigateTo } = useNavigation();
  const posthog = usePostHog();
  const { words, unlockedLessons } = useProgress();

  // Phase 1: manifest — theme/sub-lesson titles render immediately.
  const [metas, setMetas] = useState<SubLessonMeta[]>([]);
  const [metasLoading, setMetasLoading] = useState(true);

  // Phase 2: content for unlocked/played sub-lessons only — populates progress rings.
  const [loaded, setLoaded] = useState<Record<string, Lesson>>({});

  useEffect(() => {
    loadExamMeta()
      .then((m) => {
        setMetas(m);
        setMetasLoading(false);
      })
      .catch(() => setMetasLoading(false));
  }, []);

  // Re-runs when the played set changes (auth resolves after mount, and a
  // completed session grows it) — same rationale as AppHome's cascade.
  useEffect(() => {
    if (metas.length === 0) return;
    const controller = new AbortController();
    const toLoad = selectSubLessonsToLoad(metas, unlockedLessons);
    Promise.all(toLoad.map((meta) => fetchSubLesson(meta).then((lesson) => [meta.id, lesson] as const)))
      .then((entries) => {
        if (!controller.signal.aborted) setLoaded(Object.fromEntries(entries));
      })
      .catch(() => {}); // theme page stays usable with titles only
    return () => controller.abort();
  }, [metas, unlockedLessons]);

  const view = useMemo(
    () => computeExamView(metas, loaded, words, unlockedLessons),
    [metas, loaded, words, unlockedLessons],
  );

  const handleSelectSubLesson = (subLessonId: string) => {
    posthog?.capture("exam_sub_lesson_selected", { sub_lesson_id: subLessonId });
    navigateTo("exam-session", { subLessonId });
  };

  if (metasLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-pulse text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-center gap-2">
        <GraduationCapIcon className="w-6 h-6 text-rose-500" />
        <h2 className="text-xl font-bold text-gray-800">Sproochentest Prep</h2>
      </div>
      <p className="text-sm text-gray-500 -mt-3">
        Themed practice for the speaking exam. Pick a topic — each one builds up
        from vocabulary to answering questions.
      </p>

      {view.themes.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No themes available yet.</p>
      ) : (
        view.themes.map((theme) => (
          <div key={theme.id}>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">{theme.title}</h3>
            <SubLessonPath theme={theme} onSelectSubLesson={handleSelectSubLesson} />
          </div>
        ))
      )}

      <button
        onClick={() => navigateTo("home")}
        className="text-gray-500 hover:text-gray-700 transition-colors text-sm self-start"
      >
        ← Back to Home
      </button>
    </div>
  );
};
