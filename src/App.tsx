/**
 * Smart Campus Room Availability Checker  (Practice Work #06 prototype)
 *
 * Single-file React + TypeScript component. Tailwind CSS for styling, Lucide for icons.
 * No login, no database, no backend: all rooms and bookings are fictional sample data.
 *
 * Time model: every time is an integer number of minutes after 00:00 (0..1440).
 *
 * Acceptance criteria -> where they are implemented
 *   AC1  valid interval + start in the future ... isValidInterval(), checkAvailability() [INVALID_RANGE, IN_PAST]
 *   AC2  max 120 minutes ...................... checkAvailability() [TOO_LONG]
 *   AC3  blocked room ......................... checkAvailability() [ROOM_BLOCKED]
 *   AC4  overlap, touching endpoints allowed ... intervalsOverlap() (strict < comparisons)
 *   AC5  Available / Unavailable, no mutation .. frozen ROOMS + pure checkAvailability() + derived state
 *   AC6  responsive layout + clear errors ...... Tailwind grid classes, TimeField error messages
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  DoorOpen,
  RotateCcw,
  Users,
  XCircle,
} from "lucide-react";
import {
  MINUTES_PER_DAY,
  MAX_BOOKING_MINUTES,
  isValidInterval,
  intervalsOverlap,
  canBook,
} from "./booking";

/* ============================ 1. Types ============================ */

export type Booking = {
  readonly id: string;
  readonly title: string;
  readonly start: number; // minutes from 00:00
  readonly end: number; // minutes from 00:00
};

export type Room = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly capacity: number;
  readonly blocked: boolean;
  readonly blockedReason?: string;
  readonly bookings: readonly Booking[];
};

export type IssueCode =
  | "INVALID_RANGE"
  | "IN_PAST"
  | "TOO_LONG"
  | "ROOM_BLOCKED"
  | "OVERLAP";

export type Issue = { code: IssueCode; message: string };
export type Decision = { available: boolean; issues: Issue[] };

/* ====================== 2. Constants & sample data ====================== */

export { MINUTES_PER_DAY, MAX_BOOKING_MINUTES, isValidInterval, intervalsOverlap, canBook };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as object).forEach(deepFreeze);
  }
  return value;
}

// Frozen on purpose: checking availability must never change this data (AC5).
export const ROOMS: readonly Room[] = deepFreeze([
  {
    id: "lab-101",
    name: "Aurora Lab 101",
    kind: "Computer lab",
    capacity: 30,
    blocked: false,
    bookings: [
      { id: "b1", title: "Algorithms lab", start: 540, end: 600 }, // 09:00-10:00
      { id: "b2", title: "Python workshop", start: 600, end: 660 }, // 10:00-11:00
      { id: "b3", title: "Robotics club", start: 840, end: 930 }, // 14:00-15:30
    ],
  },
  {
    id: "hall-b204",
    name: "Hall B-204",
    kind: "Lecture hall",
    capacity: 120,
    blocked: false,
    bookings: [
      { id: "b4", title: "Databases lecture", start: 480, end: 570 }, // 08:00-09:30
      { id: "b5", title: "Software design", start: 720, end: 810 }, // 12:00-13:30
      { id: "b6", title: "Guest talk", start: 1020, end: 1140 }, // 17:00-19:00
    ],
  },
  {
    id: "studio-c012",
    name: "Studio C-012",
    kind: "Design studio",
    capacity: 24,
    blocked: true,
    blockedReason: "projector repair in progress",
    bookings: [{ id: "b7", title: "UX critique", start: 780, end: 840 }], // 13:00-14:00
  },
  {
    id: "sem-d305",
    name: "Seminar D-305",
    kind: "Seminar room",
    capacity: 12,
    blocked: false,
    bookings: [
      { id: "b8", title: "Thesis meeting", start: 600, end: 660 }, // 10:00-11:00
      { id: "b9", title: "Reading group", start: 840, end: 900 }, // 14:00-15:00
    ],
  },
]);

const DEFAULTS = { roomId: "lab-101", now: "08:00", start: "11:00", end: "12:00" };

/* ======================= 3. Pure helper functions ======================= */

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

/**
 * Applies AC1-AC4 to one request. Pure function: it only reads its arguments,
 * never changes them, and returns a fresh result object (AC5).
 */
export function checkAvailability(room: Room, start: number, end: number, now: number): Decision {
  const issues: Issue[] = [];

  // AC1: valid interval, and it must start strictly after the current time
  const validInterval = isValidInterval(start, end);
  if (!validInterval) {
    issues.push({
      code: "INVALID_RANGE",
      message: `Start (${formatTime(start)}) must be earlier than end (${formatTime(end)}), and both must be between 00:00 and 24:00.`,
    });
  }
  if (start <= now) {
    issues.push({
      code: "IN_PAST",
      message: `Start (${formatTime(start)}) must be later than the current time (${formatTime(now)}).`,
    });
  }

  // The remaining rules only make sense for a well-formed interval.
  if (!validInterval) return { available: false, issues };

  // AC2: maximum 120 minutes
  const duration = end - start;
  if (duration > MAX_BOOKING_MINUTES) {
    issues.push({
      code: "TOO_LONG",
      message: `Bookings can last at most ${MAX_BOOKING_MINUTES} minutes. This request is ${duration} minutes.`,
    });
  }

  // AC3: blocked room
  if (room.blocked) {
    issues.push({
      code: "ROOM_BLOCKED",
      message: `${room.name} is blocked${room.blockedReason ? `: ${room.blockedReason}` : ""}.`,
    });
  }

  // AC4: overlap with any existing booking (touching endpoints are fine)
  for (const booking of room.bookings) {
    if (intervalsOverlap(start, end, booking.start, booking.end)) {
      issues.push({
        code: "OVERLAP",
        message: `Overlaps "${booking.title}" (${formatTime(booking.start)}-${formatTime(booking.end)}).`,
      });
    }
  }

  const available = canBook({ start, end, now, blocked: room.blocked, bookings: room.bookings });
  return { available, issues };
}

/* ========================= 4. Small UI pieces ========================= */

const TIME_ERROR = "Enter a time as HH:MM, for example 09:30 (use 24:00 for midnight).";

function TimeField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}) {
  const { id, label, value, onChange, error } = props;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="HH:MM"
        maxLength={5}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-base tabular-nums text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${
          error
            ? "border-rose-500 focus:ring-rose-300"
            : "border-slate-300 focus:border-teal-600 focus:ring-teal-200"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 flex items-start gap-1.5 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

type Candidate = { start: number; end: number };

function Timeline(props: { room: Room; candidate: Candidate | null; now: number | null; available: boolean | null }) {
  const { room, candidate, now, available } = props;

  // Visible window: at least 06:00-22:00, widened to fit bookings and the request.
  const points = [360, 1320];
  room.bookings.forEach((b) => points.push(b.start, b.end));
  if (candidate) points.push(candidate.start, candidate.end);
  const viewStart = Math.floor(Math.min(...points) / 60) * 60;
  const viewEnd = Math.ceil(Math.max(...points) / 60) * 60;
  const span = viewEnd - viewStart;
  const pct = (t: number) => ((t - viewStart) / span) * 100;

  const step = span <= 720 ? 60 : 120;
  const ticks: number[] = [];
  for (let t = viewStart; t <= viewEnd; t += step) ticks.push(t);

  const requestColor =
    available === null ? "bg-slate-400" : available ? "bg-emerald-600" : "bg-rose-600";

  return (
    <div>
      <div className="relative space-y-3">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Existing bookings</p>
          <div
            className="relative h-10 overflow-hidden rounded-md bg-slate-100"
            style={
              room.blocked
                ? { backgroundImage: "repeating-linear-gradient(45deg, #e2e8f0 0 6px, #f8fafc 6px 12px)" }
                : undefined
            }
          >
            {room.bookings.map((b) => (
              <div
                key={b.id}
                title={`${b.title} ${formatTime(b.start)}-${formatTime(b.end)}`}
                className="absolute inset-y-1 overflow-hidden rounded bg-slate-700 px-1.5 text-xs leading-8 text-white"
                style={{ left: `${pct(b.start)}%`, width: `${pct(b.end) - pct(b.start)}%` }}
              >
                <span className="block truncate">{b.title}</span>
              </div>
            ))}
            {room.blocked && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="inline-flex items-center gap-1 rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-800">
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Room blocked
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Your request</p>
          <div className="relative h-10 overflow-hidden rounded-md bg-slate-100">
            {candidate && (
              <div
                className={`absolute inset-y-1 rounded ${requestColor}`}
                style={{
                  left: `${pct(candidate.start)}%`,
                  width: `${Math.max(pct(candidate.end) - pct(candidate.start), 0.8)}%`,
                }}
              />
            )}
          </div>
        </div>

        {now !== null && now >= viewStart && now <= viewEnd && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-amber-500"
            style={{ left: `${pct(now)}%` }}
            title={`Current time ${formatTime(now)}`}
          />
        )}
      </div>

      <div className="relative mt-1 h-5 text-xs tabular-nums text-slate-600" aria-hidden="true">
        {ticks.map((t, i) => (
          <span
            key={t}
            className="absolute"
            style={{
              left: `${pct(t)}%`,
              transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {formatTime(t)}
          </span>
        ))}
      </div>
      {now !== null && now >= viewStart && now <= viewEnd && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
          <span className="inline-block h-3 w-0.5 bg-amber-500" aria-hidden="true" />
          Current time {formatTime(now)}
        </p>
      )}
    </div>
  );
}

/* ============================ 5. Main component ============================ */

export default function App() {
  // The only state: four raw inputs. Everything else is derived on each render.
  const [roomId, setRoomId] = useState(DEFAULTS.roomId);
  const [nowText, setNowText] = useState(DEFAULTS.now);
  const [startText, setStartText] = useState(DEFAULTS.start);
  const [endText, setEndText] = useState(DEFAULTS.end);

  const room = ROOMS.find((r) => r.id === roomId) ?? ROOMS[0];

  const now = parseTime(nowText);
  const start = parseTime(startText);
  const end = parseTime(endText);

  const errors = {
    now: now === null ? TIME_ERROR : null,
    start: start === null ? TIME_ERROR : null,
    end: end === null ? TIME_ERROR : null,
  };

  // Recomputed only when an input changes. checkAvailability is pure, so ROOMS is never touched.
  const decision: Decision | null = useMemo(
    () => (now !== null && start !== null && end !== null ? checkAvailability(room, start, end, now) : null),
    [room, now, start, end],
  );

  const candidate: Candidate | null =
    start !== null && end !== null && isValidInterval(start, end) ? { start, end } : null;

  const touching =
    decision?.available && start !== null && end !== null
      ? room.bookings.filter((b) => b.end === start || b.start === end)
      : [];

  const setDuration = (minutes: number) => {
    if (start !== null && start + minutes <= MINUTES_PER_DAY) setEndText(formatTime(start + minutes));
  };

  const reset = () => {
    setRoomId(DEFAULTS.roomId);
    setNowText(DEFAULTS.now);
    setStartText(DEFAULTS.start);
    setEndText(DEFAULTS.end);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-5 sm:px-6">
          <div className="rounded-lg bg-teal-700 p-2 text-white">
            <DoorOpen className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Smart Campus Room Availability Checker</h1>
            <p className="mt-1 max-w-prose text-sm text-slate-600">
              Choose a room and a time slot to see whether it is free. This is a check only: nothing is booked or saved.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-5">
        {/* ---------- Inputs ---------- */}
        <section aria-labelledby="inputs-heading" className="space-y-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 id="inputs-heading" className="text-base font-semibold">
              Your request
            </h2>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset
            </button>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-800">Room</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {ROOMS.map((r) => {
                const selected = r.id === roomId;
                return (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 focus-within:ring-2 focus-within:ring-teal-300 ${
                      selected ? "border-teal-700 ring-1 ring-teal-700" : "border-slate-300 hover:border-slate-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="room"
                      value={r.id}
                      checked={selected}
                      onChange={() => setRoomId(r.id)}
                      className="mt-1 h-4 w-4 accent-teal-700"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{r.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span>{r.kind}</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" /> {r.capacity}
                        </span>
                        {r.blocked && (
                          <span className="inline-flex items-center gap-1 font-medium text-rose-700">
                            <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Blocked
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <TimeField id="now" label="Current time" value={nowText} onChange={setNowText} error={errors.now} />

          <div className="grid grid-cols-2 gap-3">
            <TimeField id="start" label="Start" value={startText} onChange={setStartText} error={errors.start} />
            <TimeField id="end" label="End" value={endText} onChange={setEndText} error={errors.end} />
          </div>

          <div>
            <p className="mb-1.5 text-sm text-slate-700">Set the end time from the start:</p>
            <div className="flex flex-wrap gap-2">
              {[30, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  disabled={start === null || start + m > MINUTES_PER_DAY}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +{m} min
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Result ---------- */}
        <section aria-labelledby="result-heading" className="space-y-5 lg:col-span-3">
          <h2 id="result-heading" className="text-base font-semibold">
            Decision for {room.name}
          </h2>

          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl border p-4 sm:p-5 ${
              decision === null
                ? "border-slate-300 bg-white"
                : decision.available
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-rose-300 bg-rose-50"
            }`}
          >
            {decision === null && (
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-7 w-7 shrink-0 text-slate-500" aria-hidden="true" />
                <div>
                  <p className="text-xl font-semibold text-slate-800">Waiting for valid times</p>
                  <p className="mt-1 text-sm text-slate-600">Fix the highlighted fields to see a decision.</p>
                </div>
              </div>
            )}

            {decision?.available && start !== null && end !== null && (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <p className="text-xl font-semibold text-emerald-900">Available</p>
                  <p className="mt-1 text-sm text-emerald-900">
                    {room.name} is free from {formatTime(start)} to {formatTime(end)} ({end - start} minutes).
                  </p>
                  {touching.map((b) => (
                    <p key={b.id} className="mt-1 text-sm text-emerald-900">
                      Back-to-back with "{b.title}" ({formatTime(b.start)}-{formatTime(b.end)}). Touching times are allowed.
                    </p>
                  ))}
                </div>
              </div>
            )}

            {decision && !decision.available && (
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-7 w-7 shrink-0 text-rose-700" aria-hidden="true" />
                <div>
                  <p className="text-xl font-semibold text-rose-900">Unavailable</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-900">
                    {decision.issues.map((issue, i) => (
                      <li key={`${issue.code}-${i}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold">Today in {room.name}</h3>
            <Timeline room={room} candidate={candidate} now={now} available={decision ? decision.available : null} />

            <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {room.bookings.map((b) => (
                <li key={b.id} className="flex justify-between gap-3 py-2">
                  <span>{b.title}</span>
                  <span className="tabular-nums text-slate-600">
                    {formatTime(b.start)}-{formatTime(b.end)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-500">
            Fictional sample data. Times are on a 24-hour clock for a single day. Checking a request never changes the bookings.
          </p>
        </section>
      </main>
    </div>
  );
}
