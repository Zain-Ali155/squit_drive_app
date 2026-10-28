export type AuthState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "unauthenticated" }>
  | Readonly<{ status: "authenticated"; loggingOut: boolean; error?: string }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "error"; message: string }>;

export type AuthAction =
  | Readonly<{ type: "authenticated" }>
  | Readonly<{ type: "unauthenticated" }>
  | Readonly<{ type: "unavailable" }>
  | Readonly<{ type: "failed"; message: string }>
  | Readonly<{ type: "logout-started" }>
  | Readonly<{ type: "logout-succeeded" }>
  | Readonly<{ type: "logout-failed"; message: string }>;

export const initialAuthState: AuthState = Object.freeze({ status: "loading" });

export const reduceAuthState = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case "authenticated":
      return { status: "authenticated", loggingOut: false };
    case "unauthenticated":
      return { status: "unauthenticated" };
    case "unavailable":
      return { status: "unavailable" };
    case "failed":
      return { status: "error", message: action.message };
    case "logout-started":
      return state.status === "authenticated"
        ? { status: "authenticated", loggingOut: true }
        : state;
    case "logout-succeeded":
      return { status: "unauthenticated" };
    case "logout-failed":
      return state.status === "authenticated"
        ? { status: "authenticated", loggingOut: false, error: action.message }
        : state;
  }
};
