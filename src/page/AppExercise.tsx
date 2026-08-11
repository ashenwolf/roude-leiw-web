import { useEffect, useRef } from "react";
import { usePostHog } from "@posthog/react";

import { useNavigation } from "../context/useNavigation";
import { FillBlank } from "../exercise/FillBlank";
import { correctSentence } from "../exercise/FillBlank/fill-logic";
import { SentenceBuilder } from "../exercise/SentenceBuilder";
import { WordMatch } from "../exercise/WordMatch";
import { selectLessonImage } from "../exercise/lesson-image";
import { computeUnlockedLessonIds } from "../exercise/progression";
import { SESSION_XP } from "../exercise/xp";
import { useActivityTimer } from "../exercise/use-activity-timer";
import { useExerciseSession } from "../exercise/use-exercise-session";
import { mergeWordStats } from "../lib/stats-merge";
import { useProgress } from "../persistence/hooks/use-progress";
import { refreshGuestProgress } from "../persistence/hooks/use-guest-progress";
import { Button } from "../ui/Button";
import { LessonImage } from "../ui/LessonImage";
import { ProgressBar } from "../ui/ProgressBar";
import { MilestonePopup, SectionMilestonePopup, CelebrationPopup } from "../ui/Popup";
import { DebugPanel } from "../ui/DebugPanel";

import type { AppPages, NavigationParams } from "../context/navigation";
import type { WordStats } from "../context/auth";
import type { LessonImageView } from "../exercise/lesson-image";
import type { Lesson } from "../exercise/letz-parser";
import type { SessionMode } from "../exercise/mode-config";
import type { ProgressView } from "../exercise/session-progress";
import type { Exercise } from "../exercise/types";
import type { WordResultMap } from "../exercise/WordMatch/types";
import type { SessionStatus } from "../exercise/session-reducer";

// ── Sub-components ──────────────────────────────────────────────────────

const ExerciseLoading = () => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="animate-pulse text-gray-500 text-lg">Loading lessons...</div>
  </div>
);

type ExerciseErrorProps = { error: string | null; onBack: () => void };
const ExerciseError = ({ error, onBack }: ExerciseErrorProps) => (
  <div className="flex flex-col items-center gap-4 py-8">
    <h2 className="text-xl font-bold text-red-600">Failed to load lessons</h2>
    <p className="text-gray-600">{error}</p>
    <Button onClick={onBack}>Back to Home</Button>
  </div>
);

/** All user-facing copy for a Mode in one place — extend when adding a Mode. */
type ModeLabels = {
  title: string;
  readyText: (totalSlots: number) => string;
  emptyText: string;
};

const MODE_LABELS: Record<SessionMode["kind"], ModeLabels> = {
  lesson: {
    title: "Word Match Exercise",
    readyText: (n) => `Complete ${n} exercises to finish the session.`,
    emptyText: "Nothing to practice here yet.",
  },
  "word-mix": {
    title: "Word Mix",
    readyText: () => "Test yourself across all words you've seen.",
    emptyText: "Nothing to practice here yet.",
  },
  "fix-errors": {
    title: "Fix Your Mistakes",
    readyText: () => "Drill the words and phrases you got wrong.",
    emptyText: "No mistakes to fix right now — nice work!",
  },
  exam: {
    title: "Theme Practice",
    readyText: (n) => `Practice this topic for the Sproochentest — ${n} exercises.`,
    emptyText: "This sub-lesson has no content yet.",
  },
};

type ExerciseReadyProps = {
  totalSlots: number;
  onStart: () => void;
  onBack: () => void;
  mode: SessionMode;
  lessonImage: LessonImageView | null;
};
const ExerciseReady = ({ totalSlots, onStart, onBack, mode, lessonImage }: ExerciseReadyProps) => (
  <div className="flex flex-col items-center gap-6 py-8">
    <h2 className="text-2xl font-bold text-gray-800">{MODE_LABELS[mode.kind].title}</h2>
    <p className="text-gray-600 text-center">{MODE_LABELS[mode.kind].readyText(totalSlots)}</p>
    {/* Shown before Start too: a picture Session is about this photo, so the
        learner should be looking at it while the session loads. */}
    {lessonImage && <LessonImage view={lessonImage} />}
    <div className="w-full max-w-xs">
      <Button onClick={onStart}>Start</Button>
    </div>
    <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors">
      Back
    </button>
  </div>
);

// Defensive guard for an empty session queue (e.g. Fix Errors with an empty
// error pool): without it, Start would transition to `active` with no exercise
// to render — a dead end.
type ExerciseEmptyProps = { mode: SessionMode; onBack: () => void };
const ExerciseEmpty = ({ mode, onBack }: ExerciseEmptyProps) => (
  <div className="flex flex-col items-center gap-6 py-8">
    <h2 className="text-2xl font-bold text-gray-800">{MODE_LABELS[mode.kind].title}</h2>
    <p className="text-gray-600 text-center">{MODE_LABELS[mode.kind].emptyText}</p>
    <div className="w-full max-w-xs">
      <Button onClick={onBack}>Back</Button>
    </div>
  </div>
);

/**
 * The answer to show a learner who just got a Slot wrong. Word-match Slots never
 * fail as a Slot, so they have nothing to reveal.
 */
const correctAnswerOf = (batch: Exercise | undefined): string | undefined => {
  if (batch?.type === "sentence-builder") return batch.item.acceptedAnswers[0];
  if (batch?.type === "fill-blank") return correctSentence(batch.item);
  return undefined;
};

type ExerciseActiveProps = {
  state: SessionStatus;
  currentSlotIndex: number;
  completedSections: number;
  lastSlotOutcome: "success" | "mistake" | null;
  progressView: ProgressView;
  currentBatch: Exercise | undefined;
  /** Lesson photo/placeholder — persists across Slots for the whole Session. */
  lessonImage: LessonImageView | null;
  onSlotComplete: (wordResults: WordResultMap) => void;
  onSlotProgress: (done: number, total: number) => void;
  onInteraction: () => void;
  onDismissMilestone: () => void;
  onSessionComplete: () => void;
  onTryAgain: () => void;
  onBack: () => void;
};

const ExerciseActive = ({
  state,
  currentSlotIndex,
  completedSections,
  lastSlotOutcome,
  progressView,
  currentBatch,
  lessonImage,
  onSlotComplete,
  onSlotProgress,
  onInteraction,
  onDismissMilestone,
  onSessionComplete,
  onTryAgain,
  onBack,
}: ExerciseActiveProps) => (
  // pb keeps the old spacing now that <main> has no bottom padding. Gaps here are
  // tight on purpose: a full-bleed 16:9 lesson photo eats ~240px of an ~850px
  // viewport, and the assembled row plus token pool have to fit under it without
  // scrolling. Don't restore the roomier spacing without re-measuring that.
  // The -mt-2 claws back part of <main>'s pt-6 for this page only — a slim
  // progress bar doesn't need 1.5rem of air above it. It eats padding that
  // already exists, so nothing clips.
  <div className="flex flex-col gap-2 pb-3 -mt-2">
    <ProgressBar view={progressView} />

    {/* Outside the keyed Exercise components on purpose: a picture-description
        Session describes ONE photo, so the photo must not remount per Slot. */}
    {lessonImage && <LessonImage view={lessonImage} />}

    {currentBatch?.type === "word-match" && (
      <WordMatch
        key={`slot-${currentSlotIndex}`}
        pairs={currentBatch.pairs}
        onComplete={onSlotComplete}
        onMatch={onSlotProgress}
      />
    )}

    {currentBatch?.type === "sentence-builder" && (
      <SentenceBuilder
        key={`slot-${currentSlotIndex}`}
        item={currentBatch.item}
        onResult={onSlotComplete}
        onInteraction={onInteraction}
      />
    )}

    {currentBatch?.type === "fill-blank" && (
      <FillBlank
        key={`slot-${currentSlotIndex}`}
        item={currentBatch.item}
        onResult={onSlotComplete}
        onInteraction={onInteraction}
      />
    )}

    <div>
      <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors text-sm">
        ← Back
      </button>
    </div>

    <MilestonePopup
      visible={state === "slot_complete"}
      onDismiss={onDismissMilestone}
      outcome={lastSlotOutcome ?? "success"}
      correctAnswer={
        lastSlotOutcome === "mistake" ? correctAnswerOf(currentBatch) : undefined
      }
    />

    <SectionMilestonePopup
      visible={state === "section_complete"}
      onDismiss={onDismissMilestone}
      section={completedSections}
    />

    <CelebrationPopup
      visible={state === "session_complete"}
      onDismiss={onSessionComplete}
      onTryAgain={onTryAgain}
    />
  </div>
);

// ── Mode derivation & unlock effects (pure) ─────────────────────────────

const toSessionMode = (page: AppPages, params: NavigationParams): SessionMode => {
  switch (page) {
    case "word-mix": return { kind: "word-mix" };
    case "fix-errors": return { kind: "fix-errors" };
    case "exam-session": return { kind: "exam", subLessonId: params.subLessonId ?? "" };
    default: return { kind: "lesson", lessonId: params.lessonId };
  }
};

type UnlockContext = {
  lessons: Lesson[];
  words: Record<string, WordStats>;
  wordResults: WordResultMap;
  unlockedLessons: string[];
  sessionCompleted: boolean;
};

/**
 * Ids this flush should append to the persisted unlock set.
 *
 * Lesson Mode derives course unlocks from stats, so it runs on abandon too —
 * unlock is earned by answering, not by finishing. Exam ids ride the same
 * channel but only on a completed Session: they mark the SubLesson as PLAYED
 * (sticky access + error-pool scope), while what opens the next step in the
 * Theme is the pass-gate on stats — see src/exam/exam-progression.ts.
 * Word Mix and Fix Errors unlock nothing.
 */
const collectUnlockIds = (mode: SessionMode, ctx: UnlockContext): string[] => {
  switch (mode.kind) {
    case "lesson": {
      const persisted = new Set(ctx.unlockedLessons);
      return computeUnlockedLessonIds(
        ctx.lessons,
        mergeWordStats(ctx.words, ctx.wordResults),
        ctx.unlockedLessons,
      ).filter((id) => !persisted.has(id));
    }
    case "exam":
      return ctx.sessionCompleted && !ctx.unlockedLessons.includes(mode.subLessonId)
        ? [mode.subLessonId]
        : [];
    default:
      return [];
  }
};

// ── Page Component ──────────────────────────────────────────────────────

export const AppExercise = () => {
  const { navigateTo, params, currentPage } = useNavigation();
  const { words, unlockedLessons, syncBatch } = useProgress();
  const timer = useActivityTimer();
  const posthog = usePostHog();

  const mode = toSessionMode(currentPage, params);

  // session is defined first so handlers below can reference it without TDZ risk
  const session = useExerciseSession({ userWords: words, unlockedLessons, mode });

  // Accumulate word results and duration across all slots. Flushed once on
  // session complete or abandon so local state and the remote POST update together.
  const pendingResults = useRef<WordResultMap>({});
  const pendingDuration = useRef<number>(0);

  // Anchor the activity timer when a new slot becomes visible so the user's
  // think-time before the first interaction is measured against this moment.
  useEffect(() => {
    if (session.state === "active") timer.start();
  }, [session.state, session.currentSlotIndex, timer]);

  // Exam sessions come from (and return to) the theme page, not Home.
  const goBack = () => {
    refreshGuestProgress();
    navigateTo(mode.kind === "exam" ? "exam" : "home");
  };

  // Merge accumulated results into local + remote state, then clear the buffer.
  const flushProgress = (sessionCompleted: boolean, xpEarned = 0) => {
    const wordResults = pendingResults.current;
    const durationSeconds = pendingDuration.current;
    pendingResults.current = {};
    pendingDuration.current = 0;

    const unlockIds = collectUnlockIds(mode, {
      lessons: session.lessons,
      words,
      wordResults,
      unlockedLessons,
      sessionCompleted,
    });
    syncBatch(wordResults, durationSeconds, unlockIds, xpEarned);
  };

  const handleSlotSync = (wordResults: WordResultMap) => {
    const durationSeconds = timer.getElapsedSeconds();
    timer.reset();
    posthog?.capture("slot_completed", {
      slot_index: session.currentSlotIndex,
      total_slots: session.totalSlots,
      lesson_id: params.lessonId,
      duration_seconds: durationSeconds,
    });
    pendingResults.current = mergeWordStats(pendingResults.current, wordResults);
    pendingDuration.current += durationSeconds;
    session.handleSlotComplete(wordResults); // determines outcome + re-queues if end of plan
  };

  const handleSlotProgress = (done: number, total: number) => {
    timer.registerInteraction();
    session.handleSlotProgress(done, total);
  };

  const handleTryAgain = () => {
    posthog?.capture("session_restarted", { lesson_id: params.lessonId });
    flushProgress(true); // try-again is only reachable from the completion popup
    timer.reset();
    session.resetSession();
  };

  const handleAbandon = () => {
    posthog?.capture("exercise_abandoned", {
      lesson_id: params.lessonId,
      slot_index: session.currentSlotIndex,
      total_slots: session.totalSlots,
    });
    flushProgress(false);
    goBack();
  };

  const handleSessionComplete = () => {
    posthog?.capture("session_completed", { lesson_id: params.lessonId });
    flushProgress(true, SESSION_XP[mode.kind]);
    goBack();
  };

  const lessonImage = selectLessonImage(session.lessons, session.currentLessonId);

  if (session.state === "loading") return <ExerciseLoading />;
  if (session.state === "error") return <ExerciseError error={session.error} onBack={goBack} />;
  if (session.state === "ready") {
    if (session.totalSlots === 0) return <ExerciseEmpty mode={mode} onBack={goBack} />;
    const handleStart = () => {
      posthog?.capture("exercise_started", {
        lesson_id: params.lessonId,
        mode: mode.kind,
        total_slots: session.totalSlots,
      });
      session.startSession();
    };
    return (
      <ExerciseReady
        totalSlots={session.totalSlots}
        onStart={handleStart}
        onBack={goBack}
        mode={mode}
        lessonImage={lessonImage}
      />
    );
  }

  return (
    <>
      <ExerciseActive
        state={session.state}
        currentSlotIndex={session.currentSlotIndex}
        completedSections={session.completedSections}
        lastSlotOutcome={session.lastSlotOutcome}
        progressView={session.progressView}
        currentBatch={session.currentBatch}
        lessonImage={lessonImage}
        onSlotComplete={handleSlotSync}
        onSlotProgress={handleSlotProgress}
        onInteraction={timer.registerInteraction}
        onDismissMilestone={session.dismissMilestone}
        onSessionComplete={handleSessionComplete}
        onTryAgain={handleTryAgain}
        onBack={handleAbandon}
      />
      <DebugPanel
        lessons={session.lessons}
        userWords={words}
        currentBatchPairs={session.currentBatch?.type === "word-match" ? session.currentBatch.pairs : []}
        currentLessonId={session.currentLessonId}
      />
    </>
  );
};
