/**
 * useAwpManager Hook
 *
 * Manages AWP endpoints with CAS-based blob exchange
 */

import {
  AwpCasManager,
  type PrefixedTool,
  type RegisteredEndpoint,
  type SkillInfo,
} from "@agent-web-portal/awp-client-browser";
import type { KeyStorage } from "@agent-web-portal/client";
import { AwpAuth } from "@agent-web-portal/client";
import { IndexedDBKeyStorage } from "@agent-web-portal/client-browser";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Stored endpoint for persistence
 */
interface StoredEndpoint {
  url: string;
  casEndpoint: string;
  alias?: string;
}

const ENDPOINTS_STORAGE_KEY = "awp-cas-agent-endpoints";
const CAS_ENDPOINT_STORAGE_KEY = "awp-cas-endpoint";
const DEFAULT_CAS_ENDPOINT = "http://localhost:3500/api";

// Get stored CAS endpoint
function getStoredCasEndpoint(): string {
  try {
    const stored = localStorage.getItem(CAS_ENDPOINT_STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch {
    // Ignore errors
  }
  return DEFAULT_CAS_ENDPOINT;
}

// Save CAS endpoint
function saveCasEndpoint(endpoint: string): void {
  try {
    localStorage.setItem(CAS_ENDPOINT_STORAGE_KEY, endpoint);
  } catch {
    // Ignore errors
  }
}

export interface UseAwpManagerResult {
  /** AWP CAS Manager instance */
  manager: AwpCasManager;
  /** Key storage for auth */
  keyStorage: KeyStorage;
  /** Client name for auth */
  clientName: string;
  /** Registered endpoints */
  endpoints: RegisteredEndpoint[];
  /** All available skills */
  skills: SkillInfo[];
  /** All available tools */
  tools: PrefixedTool[];
  /** Loading state */
  isLoading: boolean;
  /** Global CAS endpoint */
  casEndpoint: string;
  /** Whether CAS is authenticated */
  isCasAuthenticated: boolean;
  /** Set CAS endpoint */
  setCasEndpoint: (endpoint: string) => void;
  /** Set CAS auth status */
  setCasAuthenticated: (authenticated: boolean) => void;
  /** Register a new endpoint */
  registerEndpoint: (
    url: string,
    casEndpoint: string,
    alias?: string
  ) => Promise<RegisteredEndpoint>;
  /** Update an existing endpoint */
  updateEndpoint: (
    endpointId: string,
    url: string,
    casEndpoint: string,
    alias?: string
  ) => Promise<RegisteredEndpoint>;
  /** Unregister an endpoint */
  unregisterEndpoint: (endpointId: string) => void;
  /** Refresh skills and tools */
  refresh: () => Promise<void>;
  /** Update auth status for an endpoint */
  updateAuthStatus: (endpointId: string) => Promise<boolean>;
  /** Default CAS endpoint (for backward compat) */
  defaultCasEndpoint: string;
}

export function useAwpManager(): UseAwpManagerResult {
  const [casEndpoint, setCasEndpointState] = useState(() => getStoredCasEndpoint());
  const [isCasAuthenticated, setIsCasAuthenticated] = useState(false);
  const clientName = "AWP CAS Agent";

  const keyStorage = useMemo(() => new IndexedDBKeyStorage(), []);

  const manager = useMemo(() => {
    return new AwpCasManager({
      clientName,
      keyStorage,
      createAuth: (ks, name) =>
        new AwpAuth({
          clientName: name,
          keyStorage: ks,
        }),
    });
  }, [keyStorage]);

  const [endpoints, setEndpoints] = useState<RegisteredEndpoint[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [tools, setTools] = useState<PrefixedTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Set CAS endpoint and save to storage
  const setCasEndpoint = useCallback((endpoint: string) => {
    setCasEndpointState(endpoint);
    saveCasEndpoint(endpoint);
  }, []);

  // Load stored endpoints on mount
  useEffect(() => {
    const loadStoredEndpoints = async () => {
      setIsLoading(true);
      try {
        const stored = localStorage.getItem(ENDPOINTS_STORAGE_KEY);
        if (stored) {
          const storedEndpoints: StoredEndpoint[] = JSON.parse(stored);
          for (const ep of storedEndpoints) {
            await manager.registerEndpoint(ep.url, ep.casEndpoint, ep.alias);
          }
        }
        setEndpoints(manager.getEndpoints());
      } catch (error) {
        console.error("Failed to load stored endpoints:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredEndpoints();
  }, [manager]);

  // Check CAS auth status on mount
  useEffect(() => {
    const checkCasAuth = async () => {
      if (!casEndpoint) return;

      try {
        const auth = new AwpAuth({ clientName, keyStorage });
        const hasKey = await auth.hasValidKey(casEndpoint);
        setIsCasAuthenticated(hasKey);
      } catch (error) {
        console.error("Failed to check CAS auth:", error);
        setIsCasAuthenticated(false);
      }
    };

    checkCasAuth();
  }, [casEndpoint, keyStorage]);

  // Save endpoints to localStorage whenever they change
  const saveEndpoints = useCallback((eps: RegisteredEndpoint[]) => {
    const toStore: StoredEndpoint[] = eps.map((ep) => ({
      url: ep.url,
      casEndpoint: ep.casEndpoint,
      alias: ep.alias,
    }));
    localStorage.setItem(ENDPOINTS_STORAGE_KEY, JSON.stringify(toStore));
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [newSkills, newTools] = await Promise.all([
        manager.listAllSkills(),
        manager.listAllTools(),
      ]);
      setSkills(newSkills);
      setTools(newTools);
    } catch (error) {
      console.error("Failed to refresh skills/tools:", error);
    } finally {
      setIsLoading(false);
    }
  }, [manager]);

  // Refresh when endpoints change
  useEffect(() => {
    if (endpoints.length > 0) {
      refresh();
    } else {
      setSkills([]);
      setTools([]);
    }
  }, [endpoints, refresh]);

  const registerEndpoint = useCallback(
    async (url: string, endpointCas: string, alias?: string): Promise<RegisteredEndpoint> => {
      const registered = await manager.registerEndpoint(url, endpointCas, alias);
      const newEndpoints = manager.getEndpoints();
      setEndpoints(newEndpoints);
      saveEndpoints(newEndpoints);
      return registered;
    },
    [manager, saveEndpoints]
  );

  const updateEndpoint = useCallback(
    async (
      endpointId: string,
      url: string,
      endpointCas: string,
      alias?: string
    ): Promise<RegisteredEndpoint> => {
      // Unregister old endpoint first
      manager.unregisterEndpoint(endpointId);
      // Register with new settings
      const registered = await manager.registerEndpoint(url, endpointCas, alias);
      const newEndpoints = manager.getEndpoints();
      setEndpoints(newEndpoints);
      saveEndpoints(newEndpoints);
      return registered;
    },
    [manager, saveEndpoints]
  );

  const unregisterEndpoint = useCallback(
    (endpointId: string) => {
      manager.unregisterEndpoint(endpointId);
      const newEndpoints = manager.getEndpoints();
      setEndpoints(newEndpoints);
      saveEndpoints(newEndpoints);
    },
    [manager, saveEndpoints]
  );

  const updateAuthStatus = useCallback(
    async (endpointId: string): Promise<boolean> => {
      const result = await manager.updateAuthStatus(endpointId);
      setEndpoints([...manager.getEndpoints()]);
      return result;
    },
    [manager]
  );

  return {
    manager,
    keyStorage,
    clientName,
    endpoints,
    skills,
    tools,
    isLoading,
    casEndpoint,
    isCasAuthenticated,
    setCasEndpoint,
    setCasAuthenticated: setIsCasAuthenticated,
    registerEndpoint,
    updateEndpoint,
    unregisterEndpoint,
    refresh,
    updateAuthStatus,
    defaultCasEndpoint: casEndpoint,
  };
}
