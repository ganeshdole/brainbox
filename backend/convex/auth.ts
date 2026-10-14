import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server";
import { nullable } from "./validators.ts";
import { serverMutation, serverQuery, strip } from "./lib/server.ts";

// Persistence for the Auth.js adapter in src/store/convex-auth.ts: users (our
// Accounts), OAuth account links, and magic-link verification tokens. The
// session strategy is JWT, so there is no sessions table.

const profile = {
  name: v.optional(nullable(v.string())),
  firstName: v.optional(nullable(v.string())),
  lastName: v.optional(nullable(v.string())),
  image: v.optional(nullable(v.string())),
};

async function userById(ctx: QueryCtx, id: string) {
  return ctx.db
    .query("users")
    .withIndex("with_id", (q) => q.eq("id", id))
    .unique();
}

export const createUser = serverMutation({
  args: { email: v.string(), emailVerified: nullable(v.number()), ...profile },
  handler: async (ctx, input) => {
    const taken = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", input.email))
      .unique();
    if (taken) throw new Error("a user with this email already exists");
    const record = { ...input, id: crypto.randomUUID() };
    await ctx.db.insert("users", record);
    return record;
  },
});

export const getUser = serverQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await userById(ctx, id);
    return row && strip(row);
  },
});

export const getUserByEmail = serverQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const row = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    return row && strip(row);
  },
});

export const getUserByAccount = serverQuery({
  args: { provider: v.string(), providerAccountId: v.string() },
  handler: async (ctx, { provider, providerAccountId }) => {
    const link = await ctx.db
      .query("authAccounts")
      .withIndex("by_provider_account", (q) =>
        q.eq("provider", provider).eq("providerAccountId", providerAccountId),
      )
      .unique();
    if (!link) return null;
    const row = await userById(ctx, link.userId);
    return row && strip(row);
  },
});

export const updateUser = serverMutation({
  args: {
    id: v.string(),
    email: v.optional(v.string()),
    emailVerified: v.optional(nullable(v.number())),
    ...profile,
  },
  handler: async (ctx, { id, ...patch }) => {
    const row = await userById(ctx, id);
    if (!row) throw new Error(`no user ${id}`);
    await ctx.db.patch(row._id, patch);
    const updated = await ctx.db.get(row._id);
    if (!updated) throw new Error(`user ${id} vanished during update`);
    return strip(updated);
  },
});

export const linkAccount = serverMutation({
  args: {
    userId: v.string(),
    type: v.string(),
    provider: v.string(),
    providerAccountId: v.string(),
    refresh_token: v.optional(v.string()),
    access_token: v.optional(v.string()),
    expires_at: v.optional(v.number()),
    token_type: v.optional(v.string()),
    scope: v.optional(v.string()),
    id_token: v.optional(v.string()),
    session_state: v.optional(v.string()),
  },
  handler: async (ctx, account) => {
    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("by_provider_account", (q) =>
        q.eq("provider", account.provider).eq("providerAccountId", account.providerAccountId),
      )
      .unique();
    if (existing) await ctx.db.replace(existing._id, account);
    else await ctx.db.insert("authAccounts", account);
  },
});

export const createVerificationToken = serverMutation({
  args: { identifier: v.string(), token: v.string(), expires: v.number() },
  handler: async (ctx, token) => {
    await ctx.db.insert("verificationTokens", token);
  },
});

/** Returns the token and deletes it: a magic link works once. */
export const useVerificationToken = serverMutation({
  args: { identifier: v.string(), token: v.string() },
  handler: async (ctx, { identifier, token }) => {
    const row = await ctx.db
      .query("verificationTokens")
      .withIndex("by_identifier_token", (q) => q.eq("identifier", identifier).eq("token", token))
      .unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    return strip(row);
  },
});
