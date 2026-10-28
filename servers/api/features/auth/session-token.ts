import { createHash, randomBytes } from "node:crypto";

declare const sessionTokenHashBrand: unique symbol;
declare const oauthValueHashBrand: unique symbol;

export type SessionTokenHash = string & Readonly<{ [sessionTokenHashBrand]: true }>;
export type OAuthValueHash = string & Readonly<{ [oauthValueHashBrand]: true }>;

export type SessionTokenMaterial = Readonly<{
  token: string;
  tokenHash: SessionTokenHash;
}>;

export const isOpaqueSessionToken = (value: string): boolean => /^[A-Za-z0-9_-]{43}$/u.test(value);

export const hashSessionToken = (token: string): SessionTokenHash =>
  createHash("sha256").update(token, "utf8").digest("hex") as SessionTokenHash;

export const hashOAuthValue = (value: string): OAuthValueHash =>
  createHash("sha256").update(value, "utf8").digest("hex") as OAuthValueHash;

export const createSessionToken = (): SessionTokenMaterial => {
  const token = randomBytes(32).toString("base64url");
  return Object.freeze({ token, tokenHash: hashSessionToken(token) });
};
