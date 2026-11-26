/**
 * Tochiwears — Delivery fees
 * Fees come from `delivery_zones`: each active zone covers a set of states at
 * one flat fee. A state may be in at most one active zone.
 */

import { and, asc, eq, ne } from 'drizzle-orm';
import { db, type DbExecutor } from '@/db';
import { deliveryZones, type DeliveryZone } from '@/db/schema';
import { ApiError } from '@/lib/http';
import { NIGERIAN_STATES } from '@/lib/nigeria';

function activeZones(executor: DbExecutor = db) {
  return executor
    .select()
    .from(deliveryZones)
    .where(eq(deliveryZones.active, true))
    .orderBy(asc(deliveryZones.feeKobo), asc(deliveryZones.name));
}

/** Every state with its fee; `available: false` when no active zone covers it. */
export async function listDeliveryFees() {
  const zones = await activeZones();
  return NIGERIAN_STATES.map((state) => {
    const zone = zones.find((z) => z.states.includes(state));
    return {
      state,
      available: !!zone,
      feeKobo: zone?.feeKobo ?? null,
      zoneId: zone?.id ?? null,
      zoneName: zone?.name ?? null,
      estimatedDaysMin: zone?.estimatedDaysMin ?? null,
      estimatedDaysMax: zone?.estimatedDaysMax ?? null,
    };
  });
}

/** Fee for checkout. Throws 400 if no active zone delivers to the state. */
export async function getDeliveryFee(state: string, executor: DbExecutor = db): Promise<number> {
  const zone = (await activeZones(executor)).find((z) => z.states.includes(state));
  if (!zone) throw new ApiError(400, `Delivery to ${state} is not available yet`);
  return zone.feeKobo;
}

/** Reject saving a zone whose states already belong to another active zone. */
export async function assertStatesFree(
  states: string[],
  excludeZoneId?: string,
  executor: DbExecutor = db,
) {
  const others = await executor
    .select({ id: deliveryZones.id, name: deliveryZones.name, states: deliveryZones.states })
    .from(deliveryZones)
    .where(
      and(eq(deliveryZones.active, true), excludeZoneId ? ne(deliveryZones.id, excludeZoneId) : undefined),
    );
  const conflicts = others.flatMap((zone) =>
    zone.states.filter((s) => states.includes(s)).map((state) => ({ state, zone: zone.name, zoneId: zone.id })),
  );
  if (conflicts.length) {
    throw new ApiError(409, 'Some states already belong to another active zone. Remove them there first.', {
      conflicts,
    });
  }
}

export function withStateCount(zone: DeliveryZone) {
  return { ...zone, stateCount: zone.states.length };
}
