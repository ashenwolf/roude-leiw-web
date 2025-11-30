import { createContext } from "react";

export type AppPages = "home" | "excersise";

export interface NavigationContextType {
  currentPage: AppPages;
  navigateTo: (page: AppPages) => void;
}

export const NavigationContext = createContext<
  NavigationContextType | undefined
>(undefined);
