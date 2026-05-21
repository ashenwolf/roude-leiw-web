export type Env = {
  KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_URL: string;
};

// --- KV Data Shapes ---

export type UserProfile = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: string;
  providerId: string;
  currentLevel: string;
  createdAt: string;
};

export type WordStats = {
  shown: number;
  correct: number;
  incorrect: number;
};

export type DailySession = {
  totalItems: number;
  durationSeconds: number;
  correct: number;
  incorrect: number;
  /** XP earned this calendar day. Older records may omit — treat absence as 0. */
  xp?: number;
};

export type StreakInfo = {
  current: number;
  longest: number;
};

export type UserData = {
  profile: UserProfile;
  words: Record<string, WordStats>;
  dailySessions: Record<string, DailySession>;
  /**
   * Cumulative XP across all sessions. Stored separately from dailySessions so
   * it survives the MAX_DAILY_SESSIONS pruning window (5 years). Older records
   * may omit it; treat absence as 0.
   */
  totalXP?: number;
  /**
   * Lesson ids the user has ever unlocked. Sticky — only ever grows. Older
   * records may omit it; treat absence as "compute from stats only".
   */
  unlockedLessons?: string[];
  /** Monotonic counter bumped on every save. Detects concurrent writes; older records may omit it. */
  version?: number;
};

// --- Session ---

export type SessionData = {
  userId: string;
  createdAt: number;
};

// --- API Request/Response ---

export type WordResult = {
  key: string; // "{lu}|{en}"
  shown: number;
  correct: number;
  incorrect: number;
};

export type ProgressSyncRequest = {
  wordResults: WordResult[];
  durationSeconds: number;
  date: string; // "YYYY-MM-DD"
  /**
   * XP earned this sync. For slot syncs this is 0 (omit); for a session-complete
   * sync this is the session's XP award. Optional so older clients still work.
   */
  xpEarned?: number;
  /**
   * Lesson ids the client now considers unlocked. Server unions this with the
   * previously stored set — never removes. Optional to keep older clients
   * working without bumps.
   */
  newlyUnlockedLessons?: string[];
};
