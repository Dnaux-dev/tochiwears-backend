/**
 * Tochiwears — User & Authentication schema
 */

import { relations } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum('user_role', ['customer', 'admin', 'super_admin']);

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull().unique(),
    /** Hashed with bcrypt, never store plaintext */
    passwordHash: text('password_hash'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    phone: text('phone'), // E.164 format: +234...
    role: userRole('role').notNull().default('customer'),
    emailVerified: boolean('email_verified').notNull().default(false),
    /** For guest checkouts that later convert to accounts */
    guestEmail: text('guest_email'),
    ...timestamps,
  },
  (t) => [
    index('users_email_idx').on(t.email),
    index('users_role_idx').on(t.role),
  ],
);

/* ------------------------------------------------------------------ */
/* Sessions — for user authentication                                  */
/* ------------------------------------------------------------------ */

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. "OAuth", "password" */
    provider: text('provider').notNull().default('password'),
    /**
     * Session token. Stored in httpOnly cookie.
     * Generate with crypto.randomBytes(32).toString('hex')
     */
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_token_idx').on(t.token),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Password Resets                                                     */
/* ------------------------------------------------------------------ */

export const passwordResets = pgTable(
  'password_resets',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Unique token sent in reset email */
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('password_resets_user_id_idx').on(t.userId),
    index('password_resets_token_idx').on(t.token),
  ],
);

/* ------------------------------------------------------------------ */
/* Email Verification                                                  */
/* ------------------------------------------------------------------ */

export const emailVerifications = pgTable(
  'email_verifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Unique token sent in verification email */
    token: text('token').notNull().unique(),
    newEmail: text('new_email'), // If verifying email change
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verified: boolean('verified').notNull().default(false),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('email_verifications_user_id_idx').on(t.userId),
    index('email_verifications_token_idx').on(t.token),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  passwordResets: many(passwordResets),
  emailVerifications: many(emailVerifications),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, {
    fields: [passwordResets.userId],
    references: [users.id],
  }),
}));

export const emailVerificationsRelations = relations(
  emailVerifications,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerifications.userId],
      references: [users.id],
    }),
  }),
);

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type EmailVerification = typeof emailVerifications.$inferSelect;