import test from "node:test";
import assert from "node:assert/strict";
import { AuthApiUnavailableError, createAuthApi } from "../auth.api.js";
import { initialAuthState, reduceAuthState } from "../auth-state.js";

void test("auth client reads authenticated and unauthenticated states with cookies included", async () => {
  const calls: { url: string; credentials?: RequestCredentials; method?: string }[] = [];
  const api = createAuthApi({
    baseUrl: "http://127.0.0.1:4000/",
    fetchImpl: (input, init) => {
      calls.push({
        url: String(input),
        ...(init?.credentials ? { credentials: init.credentials } : {}),
        ...(init?.method ? { method: init.method } : {})
      });
      return Promise.resolve(
        calls.length === 1
          ? Response.json({ authenticated: true })
          : Response.json({ error: { code: "authentication_required" } }, { status: 401 })
      );
    }
  });

  assert.equal(api.loginUrl, "http://127.0.0.1:4000/auth/google/login");
  assert.equal(await api.currentUser(), true);
  assert.equal(await api.currentUser(), false);
  assert.deepEqual(calls, [
    {
      url: "http://127.0.0.1:4000/auth/me",
      credentials: "include"
    },
    {
      url: "http://127.0.0.1:4000/auth/me",
      credentials: "include"
    }
  ]);
});

void test("auth client treats a missing auth route as unavailable and surfaces safe failures", async () => {
  const unavailable = createAuthApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(new Response(null, { status: 404 }))
  });
  await assert.rejects(unavailable.currentUser(), AuthApiUnavailableError);

  const failed = createAuthApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({
      error: { message: "Authentication service unavailable." }
    }, { status: 503 }))
  });
  await assert.rejects(failed.currentUser(), /Authentication service unavailable/u);
});

void test("logout includes cookies and waits for a successful API response", async () => {
  let request: { url: string; method?: string; credentials?: RequestCredentials } | undefined;
  const api = createAuthApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: (input, init) => {
      request = {
        url: String(input),
        ...(init?.method ? { method: init.method } : {}),
        ...(init?.credentials ? { credentials: init.credentials } : {})
      };
      return Promise.resolve(new Response(null, { status: 204 }));
    }
  });

  await api.logout();
  assert.deepEqual(request, {
    url: "http://127.0.0.1:4000/auth/logout",
    method: "POST",
    credentials: "include"
  });

  const failed = createAuthApi({
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: () => Promise.resolve(Response.json({
      error: { message: "Request origin is not allowed." }
    }, { status: 403 }))
  });
  await assert.rejects(failed.logout(), /Request origin is not allowed/u);
});

void test("auth state transitions cover loading, logged-out, logged-in, and logout outcomes", () => {
  assert.deepEqual(initialAuthState, { status: "loading" });
  const loggedOut = reduceAuthState(initialAuthState, { type: "unauthenticated" });
  assert.deepEqual(loggedOut, { status: "unauthenticated" });

  const loggedIn = reduceAuthState(initialAuthState, { type: "authenticated" });
  assert.deepEqual(loggedIn, { status: "authenticated", loggingOut: false });

  const loggingOut = reduceAuthState(loggedIn, { type: "logout-started" });
  assert.deepEqual(loggingOut, { status: "authenticated", loggingOut: true });
  const logoutFailed = reduceAuthState(loggingOut, {
    type: "logout-failed",
    message: "Could not sign out."
  });
  assert.deepEqual(logoutFailed, {
    status: "authenticated",
    loggingOut: false,
    error: "Could not sign out."
  });
  assert.deepEqual(
    reduceAuthState(loggingOut, { type: "logout-succeeded" }),
    { status: "unauthenticated" }
  );
  assert.deepEqual(
    reduceAuthState(initialAuthState, { type: "failed", message: "Status check failed." }),
    { status: "error", message: "Status check failed." }
  );
  assert.deepEqual(
    reduceAuthState(initialAuthState, { type: "unavailable" }),
    { status: "unavailable" }
  );
});
