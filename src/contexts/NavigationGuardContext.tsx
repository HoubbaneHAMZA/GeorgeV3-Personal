'use client';

import { createContext, useContext, ReactNode, useCallback, useState, useRef } from 'react';

interface NavigationGuardContextValue {
  isBlocked: boolean;
  requestNavigation: (href: string) => boolean;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  isBlocked: false,
  requestNavigation: () => true,
});

export function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}

interface NavigationGuardProviderProps {
  children: ReactNode;
  isBlocked: boolean;
  onNavigationBlocked: (href: string) => void;
}

export function NavigationGuardProvider({
  children,
  isBlocked,
  onNavigationBlocked,
}: NavigationGuardProviderProps) {
  const requestNavigation = useCallback(
    (href: string) => {
      if (isBlocked) {
        onNavigationBlocked(href);
        return false;
      }
      return true;
    },
    [isBlocked, onNavigationBlocked]
  );

  return (
    <NavigationGuardContext.Provider value={{ isBlocked, requestNavigation }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}
