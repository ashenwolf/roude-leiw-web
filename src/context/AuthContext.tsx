import { useState, useEffect, useCallback } from "react";

import { AuthContext } from "./auth.ts";

import type { ReactNode } from "react";
import type { AuthState } from "./auth.ts";

const fetchMe = async (): Promise<AuthState> => {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return { status: "unauthenticated" };

  const data = await response.json();
  return data.user
    ? {
        status: "authenticated",
        user: data.user,
        words: data.words,
        dailySessions: data.dailySessions,
        streak: data.streak,
      }
    : { status: "unauthenticated" };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    fetchMe().then(setAuth);
  }, []);

  const login = useCallback(() => {
    window.location.href = "/api/auth/google";
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth({ status: "unauthenticated" });
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
