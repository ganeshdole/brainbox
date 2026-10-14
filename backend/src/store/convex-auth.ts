import type { Adapter, AdapterAccount, AdapterUser } from "@auth/core/adapters";

import { api } from "../../convex/_generated/api.js";
import type { ConvexCaller } from "../convex-caller.ts";

/**
 * Auth.js persistence on Convex (convex/auth.ts): users, OAuth account links
 * and magic-link tokens. Sessions are JWTs, so the session methods are absent,
 * as with the Postgres store's unused sessions table.
 */
export function createConvexAuthAdapter(convex: ConvexCaller): Adapter {
  return {
    async createUser(user) {
      return toUser(
        await convex.mutation(api.auth.createUser, {
          email: user.email,
          emailVerified: user.emailVerified?.getTime() ?? null,
          ...profileOf(user),
        }),
      );
    },
    async getUser(id) {
      const row = await convex.query(api.auth.getUser, { id });
      return row && toUser(row);
    },
    async getUserByEmail(email) {
      const row = await convex.query(api.auth.getUserByEmail, { email });
      return row && toUser(row);
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const row = await convex.query(api.auth.getUserByAccount, { provider, providerAccountId });
      return row && toUser(row);
    },
    async updateUser(user) {
      return toUser(
        await convex.mutation(api.auth.updateUser, {
          id: user.id,
          ...(user.email !== undefined && { email: user.email }),
          ...(user.emailVerified !== undefined && { emailVerified: user.emailVerified?.getTime() ?? null }),
          ...profileOf(user),
        }),
      );
    },
    async linkAccount(account) {
      await convex.mutation(api.auth.linkAccount, accountFields(account));
    },
    async createVerificationToken(token) {
      await convex.mutation(api.auth.createVerificationToken, {
        identifier: token.identifier,
        token: token.token,
        expires: token.expires.getTime(),
      });
      return token;
    },
    async useVerificationToken({ identifier, token }) {
      const row = await convex.mutation(api.auth.useVerificationToken, { identifier, token });
      return row && { ...row, expires: new Date(row.expires) };
    },
  };
}

interface StoredUser {
  id: string;
  email: string;
  emailVerified: number | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
}

function toUser(row: StoredUser): AdapterUser {
  return { ...row, emailVerified: row.emailVerified === null ? null : new Date(row.emailVerified) };
}

/** The profile fields Auth.js set, leaving out the ones it did not mention. */
function profileOf(user: Partial<AdapterUser>) {
  return {
    ...(user.name !== undefined && { name: user.name }),
    ...(user.firstName !== undefined && { firstName: user.firstName }),
    ...(user.lastName !== undefined && { lastName: user.lastName }),
    ...(user.image !== undefined && { image: user.image }),
  };
}

/** The columns the Postgres `accounts` table keeps. Auth.js passes along every
 *  token field the provider returned; Convex rejects fields it was not told
 *  about, so only these travel. */
function accountFields(account: AdapterAccount) {
  const { refresh_token, access_token, expires_at, token_type, scope, id_token, session_state } = account;
  return {
    userId: account.userId,
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    ...(typeof refresh_token === "string" && { refresh_token }),
    ...(typeof access_token === "string" && { access_token }),
    ...(typeof expires_at === "number" && { expires_at }),
    ...(typeof token_type === "string" && { token_type }),
    ...(typeof scope === "string" && { scope }),
    ...(typeof id_token === "string" && { id_token }),
    ...(typeof session_state === "string" && { session_state }),
  };
}
