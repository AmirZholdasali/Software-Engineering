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

export type BookingRequest<B extends BookingInterval = BookingInterval> = {
  start: number;
  end: number;
  now: number;
  blocked: boolean;
  bookings: readonly B[];
};

/** Which rule a request breaks. OVERLAP carries the existing booking it collides with. */
export type Violation<B extends BookingInterval = BookingInterval> =
  | { readonly code: "INVALID_RANGE" | "IN_PAST" | "TOO_LONG" | "ROOM_BLOCKED" }
  | { readonly code: "OVERLAP"; readonly booking: B };

export type Evaluation<B extends BookingInterval = BookingInterval> = {
  readonly available: boolean;
  readonly violations: Violation<B>[];
};

/** Thrown for input that is not a booking request at all (as opposed to a request that breaks a rule). */
export class MalformedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedInputError";
  }
}

/**
 * Rejects data the rules cannot reason about. `start`/`end` are NOT checked here: a bad interval
 * is the user's mistake and is reported as an INVALID_RANGE violation instead.
 */
function assertWellFormed(input: BookingRequest<BookingInterval>): void {
  if (typeof input !== "object" || input === null) {
    throw new MalformedInputError("booking request must be an object");
  }
  const { now, blocked, bookings } = input;
  if (!Number.isInteger(now) || now < 0 || now > MINUTES_PER_DAY) {
    throw new MalformedInputError(`now must be a whole number of minutes in 0..${MINUTES_PER_DAY}, got ${String(now)}`);
  }
  if (typeof blocked !== "boolean") {
    throw new MalformedInputError(`blocked must be a boolean, got ${String(blocked)}`);
  }
  if (!Array.isArray(bookings)) {
    throw new MalformedInputError("bookings must be an array");
  }
  bookings.forEach((b, i) => {
    if (typeof b !== "object" || b === null || !isValidInterval(b.start, b.end)) {
      throw new MalformedInputError(`bookings[${i}] must be a valid { start, end } interval`);
    }
  });
}

/**
 * Single source of truth for the booking rules (AC1-AC4). Pure: reads its argument, never mutates
 * it, and returns every rule the request breaks, in a stable order. Available means "no violations".
 * Throws MalformedInputError if `now`, `blocked` or `bookings` are not usable data.
 */
export function evaluateBooking<B extends BookingInterval>(input: BookingRequest<B>): Evaluation<B> {
  assertWellFormed(input);
  const { start, end, now, blocked, bookings } = input;
  const violations: Violation<B>[] = [];

  const validInterval = isValidInterval(start, end);
  if (!validInterval) violations.push({ code: "INVALID_RANGE" });
  if (start <= now) violations.push({ code: "IN_PAST" });

  // The remaining rules only make sense for a well-formed interval.
  if (validInterval) {
    if (end - start > MAX_BOOKING_MINUTES) violations.push({ code: "TOO_LONG" });
    if (blocked) violations.push({ code: "ROOM_BLOCKED" });
    for (const booking of bookings) {
      if (intervalsOverlap(start, end, booking.start, booking.end)) {
        violations.push({ code: "OVERLAP", booking });
      }
    }
  }

  return { available: violations.length === 0, violations };
}

/**
 * True if the room can be booked for [start, end): valid interval, start strictly after `now`,
 * at most 120 minutes, room not blocked, no overlap with existing bookings.
 */
export function canBook(input: BookingRequest): boolean {
  return evaluateBooking(input).available;
}
