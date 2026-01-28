/**
 * Storage Context
 *
 * Provides storage provider access throughout the app
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { StorageProvider } from "@agent-web-portal/client";
import { HttpStorageProvider } from "@agent-web-portal/client-browser";

interface StorageContextValue {
  storage: StorageProvider | null;
}

const StorageContext = createContext<StorageContextValue>({ storage: null });

export interface StorageProviderProps {
  children: ReactNode;
  /** Base URL for the HTTP storage provider */
  baseUrl?: string;
  /** Custom storage provider (overrides baseUrl) */
  storage?: StorageProvider;
}

/**
 * StorageProvider component that provides storage access to the app
 */
export function StorageContextProvider({
  children,
  baseUrl = "http://localhost:3400",
  storage: customStorage,
}: StorageProviderProps) {
  const storage = useMemo(() => {
    if (customStorage) {
      return customStorage;
    }
    return new HttpStorageProvider({ baseUrl });
  }, [baseUrl, customStorage]);

  return (
    <StorageContext.Provider value={{ storage }}>
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Hook to access the storage provider
 */
export function useStorage(): StorageProvider | null {
  const { storage } = useContext(StorageContext);
  return storage;
}
