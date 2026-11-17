/**
 * "Explain availability" (Practice #11): types, errors and the pure context builder.
 *
 * The deterministic checker (booking.ts -> availability.ts) is the ONLY source of truth. An explanation
 * is text generated FROM the checker's result; it can never change it. The adapter port below
 * (`GenerateExplanation`) is the single seam between the app and any text generator (today a mock).
 *
 * Pattern: Adapter (port). The app depends on one function type, so the mock can later be swapped for
 * a real LLM client without touching the checker or the UI.
 */
import { MAX_BOOKING_MINUTES, intervalsOverlap, isTouching } from "./booking";
import { formatTime, type Decision, type IssueCode } from "./availability";
import type { Equipment, Room } from "./rooms";

type BookingFact = Readonly<{ title: string; start: string; end: string }>;

/** Everything an explanation generator may know. Minimal on purpose: no full booking list, no catalog. */
export type ExplanationContext = Readonly<{
  room: Readonly<{
    id: string;
    name: string;
    kind: string;
    capacity: number;
    equipment: readonly Equipment[];
    blocked: boolean;
    blockedReason?: string;
  }>;
  /** Times are "HH:MM" strings, exactly as the user sees them. */
  request: Readonly<{ start: string; end: string; now: string; durationMinutes: number; people: number | null }>;
  /** The booking rule the generator needs to word TOO_LONG correctly (single source: booking.ts). */
  limits: Readonly<{ maxDurationMinutes: number }>;
  /** The checker's verdict. Read-only input for the generator, never an output of it. */
  result: Readonly<{ available: boolean; reasonCodes: readonly IssueCode[] }>;
  /** Existing bookings the request overlaps (only when OVERLAP is a reason). */
  conflicts: readonly BookingFact[];
  /** Bookings that end or start exactly at the request's edge (only when the room is available). */
  touching: readonly BookingFact[];
}>;

export type ExplanationErrorCode = "EMPTY_INPUT" | "TIMEOUT" | "API_ERROR" | "EMPTY_OUTPUT" | "CONTRADICTION";

export class ExplanationError extends Error {
  readonly code: ExplanationErrorCode;
  constructor(code: ExplanationErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ExplanationError";
    this.code = code;
  }
}

export type GenerateExplanationOptions = Readonly<{ signal?: AbortSignal; timeoutMs?: number }>;

/** The port: resolves to a short plain-text explanation, or rejects with ExplanationError. */
export type GenerateExplanation = (
  context: ExplanationContext,
  options?: GenerateExplanationOptions,
) => Promise<string>;

export type ExplanationRequest = {
  start: number | null;
  end: number | null;
  now: number | null;
  people: number | null;
};

const toFact = (b: { title: string; start: number; end: number }): BookingFact =>
  Object.freeze({ title: b.title, start: formatTime(b.start), end: formatTime(b.end) });

/**
 * Builds the generator's input from the checker's result. Pure: reads its arguments, returns a new
 * deeply frozen object (AC1/AC4). Returns null when there is nothing valid to explain (no room, an
 * unparsed time, or no decision yet), which is the "empty input" case: the caller must not ask a generator.
 */
export function buildExplanationContext(
  room: Room | null,
  request: ExplanationRequest,
  decision: Decision | null,
): ExplanationContext | null {
  const { start, end, now, people } = request;
  if (room === null || decision === null || start === null || end === null || now === null) return null;

  const reasonCodes = decision.issues.map((issue) => issue.code);
  const conflicts = reasonCodes.includes("OVERLAP")
    ? room.bookings.filter((b) => intervalsOverlap(start, end, b.start, b.end)).map(toFact)
    : [];
  const touching = decision.available
    ? room.bookings.filter((b) => isTouching(start, end, b.start, b.end)).map(toFact)
    : [];

  return Object.freeze({
    room: Object.freeze({
      id: room.id,
      name: room.name,
      kind: room.kind,
      capacity: room.capacity,
      equipment: Object.freeze([...room.equipment]),
      blocked: room.blocked,
      ...(room.blockedReason !== undefined && { blockedReason: room.blockedReason }),
    }),
    request: Object.freeze({
      start: formatTime(start),
      end: formatTime(end),
      now: formatTime(now),
      durationMinutes: end - start,
      people,
    }),
    limits: Object.freeze({ maxDurationMinutes: MAX_BOOKING_MINUTES }),
    result: Object.freeze({ available: decision.available, reasonCodes: Object.freeze(reasonCodes) }),
    conflicts: Object.freeze(conflicts),
    touching: Object.freeze(touching),
  });
}

/**
 * True if `text` states the opposite of the checker's verdict. A deliberately simple keyword check
 * (AC1), not language understanding. Only text the context itself supplied is ignored, because it is
 * data, not a claim: the room name and the titles in `conflicts` / `touching`. Anything else, quoted or not,
 * is checked.
 *   verdict available   -> must not say "unavailable", "not available" or "blocked"
 *   verdict unavailable -> must not say "available" or "free" (negated forms such as "not available" are fine)
 */
function contradictsVerdict(text: string, context: ExplanationContext): boolean {
  const knownData = [context.room.name, ...context.conflicts.map((b) => b.title), ...context.touching.map((b) => b.title)]
    .filter((value) => value !== "")
    .sort((a, b) => b.length - a.length); // longest first, so a title that contains another is removed whole
  const claims = knownData.reduce((rest, value) => rest.split(value).join(" "), text);
  if (context.result.available) return /\bunavailable\b|\bnot\s+available\b|\bblocked\b/i.test(claims);
  return /\b(?:available|free)\b/i.test(claims.replace(/\bnot\s+(?:available|free)\b/gi, " "));
}

/**
 * Rejects with ExplanationError("TIMEOUT") if `promise` has not settled after `ms`. The timer is always
 * cleared. This does not cancel the underlying work: the caller aborts its own signal for that.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ExplanationError("TIMEOUT", `no answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Output guard. Returns the trimmed text, or throws ExplanationError:
 * EMPTY_OUTPUT if it is not a non-empty string, CONTRADICTION if it contradicts `context.result.available`.
 */
export function normalizeExplanation(text: unknown, context: ExplanationContext): string {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed === "") throw new ExplanationError("EMPTY_OUTPUT");
  if (contradictsVerdict(trimmed, context)) throw new ExplanationError("CONTRADICTION");
  return trimmed;
}
