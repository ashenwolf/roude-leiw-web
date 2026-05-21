import { createContext } from "react";

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  currentLevel: string;
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

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "authenticated";
      user: User;
      words: Record<string, WordStats>;
      dailySessions: Record<string, DailySession>;
      streak: StreakInfo;
      unlockedLessons: string[];
      /** Cumulative XP. Stored separately from daily sessions so it survives session pruning. */
      totalXP: number;
    };

export type AuthContextType = {
  auth: AuthState;
  login: () => void;
  logout: () => void;
  /**
   * Optimistically apply a stats delta to the local auth state without waiting
   * for the server round-trip. Must be called before (or alongside) the POST so
   * Home re-renders immediately after a Session ends.
   * See CLAUDE.md > Architecture Reference > Post-Session refresh invariant.
   */
  applyStatsDelta: (
    wordResults: Record<string, WordStats>,
    durationSeconds: number,
    date: string,
    newlyUnlockedLessons?: string[],
  ) => void;
  /** Optimistically credit XP for a completed session. Called separately from
   *  applyStatsDelta because XP is awarded once at session-end, not per-slot. */
  applyXPDelta: (xpEarned: number, date: string) => void;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
