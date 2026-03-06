"use client";

import { useEffect, useState } from "react";

const AUTH_ENABLED_STORAGE_KEY = "pf_auth_enabled_v1";
const AUTH_CHANGED_EVENT = "pf_auth_changed_v1";

function readAuthEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const raw = window.localStorage.getItem(AUTH_ENABLED_STORAGE_KEY);

  if (raw === null) {
    return true;
  }

  return raw === "1" || raw.toLowerCase() === "true";
}

export function setLocalAuthEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  useEffect(() => {
    const sync = () => {
      setIsAuthenticated(readAuthEnabled());
      setLoading(false);
    };

    sync();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === AUTH_ENABLED_STORAGE_KEY) {
        sync();
      }
    };

    const onChanged = () => {
      sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(AUTH_CHANGED_EVENT, onChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUTH_CHANGED_EVENT, onChanged);
    };
  }, []);

  return {
    loading,
    isAuthenticated,
    userId: null as string | null,
    email: isAuthenticated ? "local@east" : null,
  };
}

