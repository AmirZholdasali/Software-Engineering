/**
 * Pure booking-availability rules. Time is an integer number of minutes after 00:00 (0..1440).
 */

export type BookingInterval = { readonly start: number; readonly end: number };

export const MINUTES_PER_DAY = 1440;
export const MAX_BOOKING_MINUTES = 120;

/** 0 <= start < end <= 1440, both whole minutes. */
export function isValidInterval(start: number, end: number): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start < end &&
    end <= MINUTES_PER_DAY
  );
}

/**
 * Two half-open intervals overlap only if each one starts BEFORE the other ends.
 * Strict "<" (not "<=") is what lets touching intervals such as 600-660 and 660-720 pass.
 */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * True if the room can be booked for [start, end): valid interval, start strictly after `now`,
 * at most 120 minutes, room not blocked, no overlap with existing bookings.
 */
export function canBook({
  start,
  end,
  now,
  blocked,
  bookings,
}: {
  start: number;
  end: number;
  now: number;
  blocked: boolean;
  bookings: readonly BookingInterval[];
}): boolean {
  if (!isValidInterval(start, end)) return false;
  if (start <= now) return false;
  if (end - start > MAX_BOOKING_MINUTES) return false;
  if (blocked) return false;
  return !bookings.some((b) => intervalsOverlap(start, end, b.start, b.end));
}
