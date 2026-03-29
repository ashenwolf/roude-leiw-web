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
  totalPairs: number;
  durationSeconds: number;
  correctMatches: number;
  incorrectMatches: number;
};

export type StreakInfo = {
  current: number;
  longest: number;
};

export type UserData = {
  profile: UserProfile;
  words: Record<string, WordStats>;
  dailySessions: Record<string, DailySession>;
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
};
