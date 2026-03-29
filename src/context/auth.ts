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
  totalPairs: number;
  durationSeconds: number;
  correctMatches: number;
  incorrectMatches: number;
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
    };

export type AuthContextType = {
  auth: AuthState;
  login: () => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
