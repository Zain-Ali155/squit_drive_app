"use client";

import { useEffect, useMemo, useReducer, useState, type ReactElement } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@workspace/ui";
import { resolveBrowserApiBaseUrl } from "@/config/api";
import { AuthApiUnavailableError, createAuthApi } from "../auth.api";
import { initialAuthState, reduceAuthState } from "../auth-state";

type AuthControlsProps = Readonly<{ apiBaseUrl: string; className?: string; compactLabel?: boolean; hiddenOnDrive?: boolean }>;

export const AuthControls = ({ apiBaseUrl, className, compactLabel = false, hiddenOnDrive = false }: AuthControlsProps): ReactElement | null => {
  const pathname = usePathname();
  const api = useMemo(() => createAuthApi({ baseUrl: resolveBrowserApiBaseUrl(apiBaseUrl) }), [apiBaseUrl]);
  const [state, dispatch] = useReducer(reduceAuthState, initialAuthState);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (pathname === "/shared" || (hiddenOnDrive && pathname.startsWith("/drive"))) return;
    let active = true;
    void api.currentUser().then((authenticated) => {
      if (active) dispatch({ type: authenticated ? "authenticated" : "unauthenticated" });
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof AuthApiUnavailableError) {
        dispatch({ type: "unavailable" });
        return;
      }
      dispatch({
        type: "failed",
        message: cause instanceof Error ? cause.message : "Could not check sign-in status."
      });
    });
    return () => { active = false; };
  }, [api, hiddenOnDrive, pathname, retryCount]);

  const logout = async (): Promise<void> => {
    dispatch({ type: "logout-started" });
    try {
      await api.logout();
      dispatch({ type: "logout-succeeded" });
    } catch (cause) {
      dispatch({
        type: "logout-failed",
        message: cause instanceof Error ? cause.message : "Could not sign out."
      });
    }
  };

  if (pathname === "/shared" || (hiddenOnDrive && pathname.startsWith("/drive")) || state.status === "unavailable") return null;

  return (
    <div aria-live="polite" className={className ?? "flex min-h-12 items-center justify-end gap-3 border-b border-border px-4 py-2 sm:px-6"}>
      {state.status === "loading" && <span role="status" className="text-sm text-muted-foreground">Checking sign-in status…</span>}
      {state.status === "unauthenticated" && (
        <Button asChild size="sm">
          <a href={api.loginUrl}>{compactLabel ? <><span className="sm:hidden">Sign in</span><span className="hidden sm:inline">Sign in with Google</span></> : "Sign in with Google"}</a>
        </Button>
      )}
      {state.status === "authenticated" && (
        <>
          {state.error && <span className="text-sm text-destructive">{state.error}</span>}
          <Button disabled={state.loggingOut} onClick={() => { void logout(); }} size="sm" variant="outline">
            {state.loggingOut ? "Signing out…" : "Sign out"}
          </Button>
        </>
      )}
      {state.status === "error" && (
        <>
          <span className="text-sm text-destructive">{state.message}</span>
          <Button onClick={() => setRetryCount((count) => count + 1)} size="sm" variant="outline">
            Retry
          </Button>
        </>
      )}
    </div>
  );
};
