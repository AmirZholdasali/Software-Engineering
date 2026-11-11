/**
 * Turns booking-rule violations (booking.ts) into user-facing messages, plus input parsing/formatting.
 * Pure functions only: arguments are read, never changed (AC5).
 */
import { MAX_BOOKING_MINUTES, evaluateBooking, type Violation } from "./booking";
import type { Booking, Room } from "./rooms";

/** Derived from the rule module so the two lists can never drift apart. */
export type IssueCode = Violation["code"];
export type Issue = { code: IssueCode; message: string };
export type Decision = { available: boolean; issues: Issue[] };

/** "HH:MM" -> minutes. Accepts 00:00..24:00. Returns null if the text is not a valid time. */
export function parseTime(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24) return null;
  if (hours === 24 && minutes !== 0) return null; // only 24:00 itself is allowed
  return hours * 60 + minutes;
}

/** minutes -> "HH:MM" */
export function formatTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Number of people as a whole number >= 1. Returns null if the text is not one. */
export function parsePeople(text: string): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= 1 ? n : null;
}

/**
 * Asks the booking rules (AC1-AC4, see booking.ts) about one request and turns each violation
 * into a user-facing message. Pure function: it only reads its arguments, never changes them,
 * and returns a fresh result object (AC5).
 */
export function checkAvailability(room: Room, start: number, end: number, now: number): Decision {
  const { available, violations } = evaluateBooking<Booking>({
    start,
    end,
    now,
    blocked: room.blocked,
    bookings: room.bookings,
  });

  const issues: Issue[] = violations.map((v): Issue => {
    switch (v.code) {
      case "INVALID_RANGE":
        return {
          code: v.code,
          message: `Start (${formatTime(start)}) must be earlier than end (${formatTime(end)}), and both must be between 00:00 and 24:00.`,
        };
      case "IN_PAST":
        return {
          code: v.code,
          message: `Start (${formatTime(start)}) must be later than the current time (${formatTime(now)}).`,
        };
      case "TOO_LONG":
        return {
          code: v.code,
          message: `Bookings can last at most ${MAX_BOOKING_MINUTES} minutes. This request is ${end - start} minutes.`,
        };
      case "ROOM_BLOCKED":
        return {
          code: v.code,
          message: `${room.name} is blocked${room.blockedReason ? `: ${room.blockedReason}` : ""}.`,
        };
      case "OVERLAP":
        return {
          code: v.code,
          message: `Overlaps "${v.booking.title}" (${formatTime(v.booking.start)}-${formatTime(v.booking.end)}).`,
        };
    }
  });

  return { available, issues };
}
