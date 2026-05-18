import { createContext } from "react";

export type AppPages = "home" | "exercise" | "word-mix" | "fix-errors";

export type NavigationParams = Record<string, string>;

export interface NavigationContextType {
  currentPage: AppPages;
  params: NavigationParams;
  navigateTo: (page: AppPages, params?: NavigationParams) => void;
}

export const NavigationContext = createContext<NavigationContextType | undefined>(undefined);
