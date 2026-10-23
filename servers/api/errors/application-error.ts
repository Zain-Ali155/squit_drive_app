import type { ApplicationError } from "./types.js";

type ApplicationErrorInput = Readonly<{
  code: ApplicationError["code"];
  message: string;
  status: ApplicationError["status"];
  details?: NonNullable<ApplicationError["details"]>;
}>;

export const createApplicationError = (input: ApplicationErrorInput): ApplicationError =>
  Object.freeze(Object.assign(new Error(input.message), { kind: "application-error" as const, ...input }));

export const isApplicationError = (error: unknown): error is ApplicationError =>
  typeof error === "object" && error !== null && "kind" in error && error.kind === "application-error";
