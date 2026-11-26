/**
 * Tochiwears — housekeeping job
 * Deletes expired stock reservations and sessions. Expired rows are already
 * ignored by every query; this only keeps the tables small.
 */

import { lt } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, stockReservations } from '@/db/schema';

export async function purgeExpired() {
  const now = new Date();
  const [reservations, expiredSessions] = await Promise.all([
    db.delete(stockReservations).where(lt(stockReservations.expiresAt, now)).returning({ id: stockReservations.id }),
    db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
  ]);
  if (reservations.length || expiredSessions.length) {
    console.log(
      `🧹 Purged ${reservations.length} expired reservations, ${expiredSessions.length} expired sessions`,
    );
  }
}

/** Run every `intervalMs` (default 10 min). Returns a stop function. */
export function startHousekeeping(intervalMs = 10 * 60 * 1000) {
  const run = () => purgeExpired().catch((err) => console.error('Housekeeping failed:', err));
  const timer = setInterval(run, intervalMs);
  timer.unref();
  run();
  return () => clearInterval(timer);
}
