import { randomUUID } from "node:crypto";
import { Schema, model, type Model } from "mongoose";
import type { OAuthValueHash, SessionTokenHash } from "../session-token.js";

export type AuthUserRecord = Readonly<{
  _id: string;
  googleSubject: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type AuthSessionRecord = Readonly<{
  _id: string;
  ownerId: string;
  tokenHash: SessionTokenHash;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type OAuthTransactionRecord = Readonly<{
  _id: string;
  stateHash: OAuthValueHash;
  nonceHash: OAuthValueHash;
  browserBindingHash: OAuthValueHash;
  codeChallengeHash: OAuthValueHash;
  redirectUriHash: OAuthValueHash;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type AuthRepository = Readonly<{
  findOrCreateGoogleUser: (googleSubject: string, email: string) => Promise<AuthUserRecord>;
  findUserById: (ownerId: string) => Promise<AuthUserRecord | null>;
  createOAuthTransaction: (input: Readonly<{
    stateHash: OAuthValueHash;
    nonceHash: OAuthValueHash;
    browserBindingHash: OAuthValueHash;
    codeChallengeHash: OAuthValueHash;
    redirectUriHash: OAuthValueHash;
    expiresAt: Date;
  }>) => Promise<void>;
  consumeOAuthTransaction: (
    stateHash: OAuthValueHash,
    browserBindingHash: OAuthValueHash,
    at: Date
  ) => Promise<OAuthTransactionRecord | null>;
  createSession: (input: Readonly<{
    ownerId: string;
    tokenHash: SessionTokenHash;
    expiresAt: Date;
  }>) => Promise<AuthSessionRecord>;
  findActiveSession: (tokenHash: SessionTokenHash, at: Date) => Promise<AuthSessionRecord | null>;
  revokeSession: (tokenHash: SessionTokenHash, revokedAt: Date) => Promise<boolean>;
}>;

export type AuthUserModel = Model<AuthUserRecord>;
export type AuthSessionModel = Model<AuthSessionRecord>;
export type OAuthTransactionModel = Model<OAuthTransactionRecord>;

export const authUserSchema = new Schema<AuthUserRecord>({
  _id: { type: String, required: true },
  googleSubject: { type: String, required: true, minlength: 1, maxlength: 255 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 }
}, { timestamps: true, versionKey: false });
authUserSchema.index({ googleSubject: 1 }, { unique: true, name: "auth_google_subject_unique" });

export const authSessionSchema = new Schema<AuthSessionRecord>({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true },
  tokenHash: { type: String, required: true, minlength: 64, maxlength: 64 },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date }
}, { timestamps: true, versionKey: false });
authSessionSchema.index({ tokenHash: 1 }, { unique: true, name: "auth_session_token_hash_unique" });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "auth_session_expiry_ttl" });
authSessionSchema.index({ ownerId: 1, revokedAt: 1, expiresAt: 1 }, { name: "auth_owner_active_sessions" });

export const oauthTransactionSchema = new Schema<OAuthTransactionRecord>({
  _id: { type: String, required: true },
  stateHash: { type: String, required: true, minlength: 64, maxlength: 64 },
  nonceHash: { type: String, required: true, minlength: 64, maxlength: 64 },
  browserBindingHash: { type: String, required: true, minlength: 64, maxlength: 64 },
  codeChallengeHash: { type: String, required: true, minlength: 64, maxlength: 64 },
  redirectUriHash: { type: String, required: true, minlength: 64, maxlength: 64 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false });
oauthTransactionSchema.index({ stateHash: 1 }, { unique: true, name: "auth_oauth_state_hash_unique" });
oauthTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "auth_oauth_transaction_expiry_ttl" });

export const AuthUserModelInstance = model<AuthUserRecord>("AuthUser", authUserSchema);
export const AuthSessionModelInstance = model<AuthSessionRecord>("AuthSession", authSessionSchema);
export const OAuthTransactionModelInstance = model<OAuthTransactionRecord>(
  "OAuthTransaction",
  oauthTransactionSchema
);

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === 11000;

type AuthRepositoryDependencies = Readonly<{
  userModel?: AuthUserModel;
  sessionModel?: AuthSessionModel;
  oauthTransactionModel?: OAuthTransactionModel;
}>;

export const createAuthRepository = ({
  userModel = AuthUserModelInstance,
  sessionModel = AuthSessionModelInstance,
  oauthTransactionModel = OAuthTransactionModelInstance
}: AuthRepositoryDependencies = {}): AuthRepository => Object.freeze({
  findOrCreateGoogleUser: async (googleSubject: string, email: string): Promise<AuthUserRecord> => {
    try {
      const user = await userModel.findOneAndUpdate(
        { googleSubject } as never,
        { $set: { email }, $setOnInsert: { _id: randomUUID(), googleSubject } },
        { new: true, upsert: true, runValidators: true }
      ).lean().exec();
      return user;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const existingUser = await userModel.findOne({ googleSubject } as never).lean().exec();
      if (!existingUser) throw error;
      return existingUser;
    }
  },
  findUserById: (ownerId): Promise<AuthUserRecord | null> =>
    userModel.findOne({ _id: ownerId } as never).lean().exec(),
  createOAuthTransaction: async ({ stateHash, nonceHash, browserBindingHash, codeChallengeHash, redirectUriHash, expiresAt }): Promise<void> => {
    await oauthTransactionModel.create({
      _id: randomUUID(),
      stateHash,
      nonceHash,
      browserBindingHash,
      codeChallengeHash,
      redirectUriHash,
      expiresAt
    });
  },
  consumeOAuthTransaction: (stateHash, browserBindingHash, at): Promise<OAuthTransactionRecord | null> =>
    oauthTransactionModel.findOneAndDelete({
      stateHash,
      browserBindingHash,
      expiresAt: { $gt: at }
    } as never).lean().exec(),
  createSession: async ({ ownerId, tokenHash, expiresAt }): Promise<AuthSessionRecord> => {
    const session = await sessionModel.create({
      _id: randomUUID(),
      ownerId,
      tokenHash,
      expiresAt
    });
    return session.toObject();
  },
  findActiveSession: (tokenHash, at): Promise<AuthSessionRecord | null> =>
    sessionModel.findOne({
      tokenHash,
      expiresAt: { $gt: at },
      revokedAt: { $exists: false }
    } as never).lean().exec(),
  revokeSession: async (tokenHash, revokedAt): Promise<boolean> => {
    const result = await sessionModel.updateOne({
      tokenHash,
      revokedAt: { $exists: false }
    } as never, { $set: { revokedAt } }).exec();
    return result.modifiedCount > 0;
  }
});
