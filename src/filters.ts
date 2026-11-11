/**
 * Room filtering rules F1-F3 and selection resolution (F4/F5). Pure functions: the catalog and
 * the criteria are only read, never changed.
 *
 * Pattern: Specification-style predicate list. Each rule is one small predicate and a room
 * matches only if every predicate holds, so rules can be tested and extended one at a time.
 */
import type { Equipment, Room } from "./rooms";

export type FilterCriteria = {
  readonly minCapacity: number;
  readonly equipment: readonly Equipment[];
};

export type RoomPredicate = (room: Room, criteria: FilterCriteria) => boolean;

/** F1: capacity >= requested number of people. */
export const hasCapacity: RoomPredicate = (room, criteria) => room.capacity >= criteria.minCapacity;

/** F2: the room has ALL selected equipment (an empty selection matches every room). */
export const hasAllEquipment: RoomPredicate = (room, criteria) =>
  criteria.equipment.every((item) => room.equipment.includes(item));

/** F3: a blocked room can never be a match. */
export const isNotBlocked: RoomPredicate = (room) => !room.blocked;

export const ROOM_FILTERS: readonly RoomPredicate[] = Object.freeze([hasCapacity, hasAllEquipment, isNotBlocked]);

/** Rooms that satisfy every filter rule, in catalog order. Returns a new array (may be empty: F4). */
export function filterRooms(rooms: readonly Room[], criteria: FilterCriteria): Room[] {
  return rooms.filter((room) => ROOM_FILTERS.every((matches) => matches(room, criteria)));
}

/**
 * F5: the room to show a decision for. Keeps the selected room while it is in the results,
 * otherwise falls back to the first match. Null means there is nothing to show (F4).
 */
export function resolveSelection(results: readonly Room[], selectedId: string): Room | null {
  return results.find((room) => room.id === selectedId) ?? results[0] ?? null;
}
