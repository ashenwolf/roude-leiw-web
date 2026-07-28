// ── Session XP awards ──────────────────────────────────────────────────────
//
// XP is awarded once per completed session (all blocks done), not per-slot and
// not derived from mastery state. This means XP can only ever increase.
//
// Scale assumptions:
//   A1-B2 = 4 CEFR levels × 12 modules = 48 modules
//   ~8 sessions per module to reach unlock threshold
//   = ~384 sessions to complete A1-B2
//   = ~38,400 XP at 100 XP/session → reaching level 12-13

export const SESSION_XP = {
  lesson: 100,
  "fix-errors": 90,
  "word-mix": 80,
  exam: 100,
} as const satisfies Record<string, number>;

// ── Level table ────────────────────────────────────────────────────────────
//
// 20 levels aligned to CEFR milestones at 100 XP/session, 8 sessions/module:
//   A1 complete ≈ level 6  (96 sessions = 9,600 XP)
//   A2 complete ≈ level 9  (192 sessions = 19,200 XP)
//   B1 complete ≈ level 11 (288 sessions = 28,800 XP)
//   B2 complete ≈ level 13 (384 sessions = 38,400 XP)
//   C1 complete ≈ level 15 (480 sessions = 48,000 XP)
//   C2 complete ≈ level 17 (576 sessions = 57,600 XP)

export type PlayerLevel = {
  level: number;
  title: string;
  xpRequired: number;
};

const XP_LEVELS: ReadonlyArray<PlayerLevel> = [
  { level: 1,  title: "Beginner",     xpRequired: 0 },
  { level: 2,  title: "Explorer",     xpRequired: 600 },
  { level: 3,  title: "Learner",      xpRequired: 1_500 },
  { level: 4,  title: "Practitioner", xpRequired: 3_000 },
  { level: 5,  title: "Student",      xpRequired: 5_000 },
  { level: 6,  title: "Scholar",      xpRequired: 8_000 },   // ≈ A1 complete
  { level: 7,  title: "Adept",        xpRequired: 11_500 },
  { level: 8,  title: "Skilled",      xpRequired: 15_500 },
  { level: 9,  title: "Advanced",     xpRequired: 20_000 },  // ≈ A2 complete
  { level: 10, title: "Expert",       xpRequired: 25_000 },
  { level: 11, title: "Professional", xpRequired: 31_000 },  // ≈ B1 complete
  { level: 12, title: "Specialist",   xpRequired: 37_500 },
  { level: 13, title: "Master",       xpRequired: 44_500 },  // ≈ B2 complete
  { level: 14, title: "Grand Master", xpRequired: 52_000 },
  { level: 15, title: "Champion",     xpRequired: 60_500 },  // ≈ C1 complete
  { level: 16, title: "Elite",        xpRequired: 70_000 },
  { level: 17, title: "Legend",       xpRequired: 80_500 },  // ≈ C2 complete
  { level: 18, title: "Virtuoso",     xpRequired: 92_000 },
  { level: 19, title: "Grandmaster",  xpRequired: 104_500 },
  { level: 20, title: "Supreme",      xpRequired: 118_000 },
] as const;

export type PlayerLevelInfo = {
  current: PlayerLevel;
  next: PlayerLevel | null;
  xp: number;
  xpInLevel: number;
  xpToNext: number;
  progressInLevel: number;
};

export const computePlayerLevel = (xp: number): PlayerLevelInfo => {
  const currentIdx = XP_LEVELS.reduce(
    (best, lvl, idx) => (xp >= lvl.xpRequired ? idx : best),
    0,
  );
  const current = XP_LEVELS[currentIdx];
  const next = XP_LEVELS[currentIdx + 1] ?? null;
  const xpInLevel = xp - current.xpRequired;
  const xpToNext = next ? next.xpRequired - current.xpRequired : 0;
  const progressInLevel = xpToNext > 0 ? xpInLevel / xpToNext : 1;

  return { current, next, xp, xpInLevel, xpToNext, progressInLevel };
};
