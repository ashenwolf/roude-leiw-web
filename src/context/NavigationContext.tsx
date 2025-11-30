import { useState } from "react";
import type { ReactNode } from "react";
import { NavigationContext } from "./navigation";
import type { AppPages } from "./navigation";

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState<AppPages>("home");

  const navigateTo = (page: AppPages) => {
    setCurrentPage(page);
  };

  return (
    <NavigationContext.Provider value={{ currentPage, navigateTo }}>
      {children}
    </NavigationContext.Provider>
  );
}
