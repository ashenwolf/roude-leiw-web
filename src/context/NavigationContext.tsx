import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { NavigationContext } from "./navigation";
import type { AppPages, NavigationParams } from "./navigation";

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState<AppPages>("home");
  const [params, setParams] = useState<NavigationParams>({});

  const navigateTo = useCallback((page: AppPages, newParams: NavigationParams = {}) => {
    setCurrentPage(page);
    setParams(newParams);
  }, []);

  return (
    <NavigationContext.Provider value={{ currentPage, params, navigateTo }}>
      {children}
    </NavigationContext.Provider>
  );
}
