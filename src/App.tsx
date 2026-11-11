/**
 * Smart Campus Room Availability Checker  (Assignment #04)
 *
 * UI only: state, filtering inputs and rendering. Tailwind CSS for styling, Lucide for icons.
 * No login, no database, no backend: all rooms and bookings are fictional sample data.
 *
 *   rooms.ts ......... frozen room catalog (types + data)
 *   booking.ts ....... booking rules AC1-AC4 (evaluateBooking)
 *   availability.ts .. violations -> messages, time/people parsing
 *   filters.ts ....... room filters F1-F3, selection F4/F5
 *
 * Acceptance criteria -> where they are implemented
 *   AC1-AC4  booking.ts evaluateBooking(), messages in availability.ts checkAvailability()
 *   AC5      frozen ROOMS + pure functions + derived state
 *   AC6      responsive Tailwind grid, field error messages
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  DoorOpen,
  RotateCcw,
  SearchX,
  Users,
  XCircle,
} from "lucide-react";
import { MINUTES_PER_DAY, isTouching, isValidInterval } from "./booking";
import { EQUIPMENT, ROOMS, type Equipment, type Room } from "./rooms";
import { checkAvailability, formatTime, parsePeople, parseTime, type Decision } from "./availability";
import { filterRooms, resolveSelection } from "./filters";

const DEFAULTS = { roomId: "lab-101", now: "08:00", start: "11:00", end: "12:00", people: "1" };

/* ========================= 4. Small UI pieces ========================= */

const TIME_ERROR = "Enter a time as HH:MM, for example 09:30 (use 24:00 for midnight).";
const PEOPLE_ERROR = "Enter the number of people as a whole number of at least 1.";

function TimeField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  placeholder?: string;
  inputMode?: "text" | "numeric";
}) {
  const { id, label, value, onChange, error, placeholder = "HH:MM", inputMode = "text" } = props;
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
        placeholder={placeholder}
        inputMode={inputMode}
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
  // The only state: raw inputs. Everything else is derived on each render.
  const [roomId, setRoomId] = useState(DEFAULTS.roomId);
  const [nowText, setNowText] = useState(DEFAULTS.now);
  const [startText, setStartText] = useState(DEFAULTS.start);
  const [endText, setEndText] = useState(DEFAULTS.end);
  const [peopleText, setPeopleText] = useState(DEFAULTS.people);
  const [equipment, setEquipment] = useState<readonly Equipment[]>([]);

  const people = parsePeople(peopleText);

  // F1-F3. While the people field is invalid, capacity is not filtered (the field shows an error).
  const results = useMemo(
    () => filterRooms(ROOMS, { minCapacity: people ?? 0, equipment }),
    [people, equipment],
  );
  // F5: keep the chosen room while it matches, otherwise the first match. Null -> empty state (F4).
  const room = resolveSelection(results, roomId);

  const now = parseTime(nowText);
  const start = parseTime(startText);
  const end = parseTime(endText);

  const errors = {
    now: now === null ? TIME_ERROR : null,
    start: start === null ? TIME_ERROR : null,
    end: end === null ? TIME_ERROR : null,
    people: people === null ? PEOPLE_ERROR : null,
  };

  // Recomputed only when an input or the selected room changes. checkAvailability is pure, so ROOMS is never touched.
  const decision: Decision | null = useMemo(
    () =>
      room !== null && now !== null && start !== null && end !== null ? checkAvailability(room, start, end, now) : null,
    [room, now, start, end],
  );

  const candidate: Candidate | null =
    start !== null && end !== null && isValidInterval(start, end) ? { start, end } : null;

  const touching =
    room !== null && decision?.available && start !== null && end !== null
      ? room.bookings.filter((b) => isTouching(start, end, b.start, b.end))
      : [];

  const setDuration = (minutes: number) => {
    if (start !== null && start + minutes <= MINUTES_PER_DAY) setEndText(formatTime(start + minutes));
  };

  // Always builds a new array: the previous selection is never changed in place.
  const toggleEquipment = (item: Equipment) =>
    setEquipment((current) => (current.includes(item) ? current.filter((e) => e !== item) : [...current, item]));

  const reset = () => {
    setRoomId(DEFAULTS.roomId);
    setNowText(DEFAULTS.now);
    setStartText(DEFAULTS.start);
    setEndText(DEFAULTS.end);
    setPeopleText(DEFAULTS.people);
    setEquipment([]);
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

          <TimeField
            id="people"
            label="People"
            value={peopleText}
            onChange={setPeopleText}
            error={errors.people}
            placeholder="e.g. 20"
            inputMode="numeric"
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-800">Required equipment</legend>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map((item) => (
                <label
                  key={item.id}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm focus-within:ring-2 focus-within:ring-teal-300 hover:border-slate-400"
                >
                  <input
                    type="checkbox"
                    checked={equipment.includes(item.id)}
                    onChange={() => toggleEquipment(item.id)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-800">
              Room <span className="font-normal text-slate-600">({results.length} of {ROOMS.length} match)</span>
            </legend>
            {results.length === 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
                <SearchX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                No rooms match these filters. Lower the number of people or clear some equipment.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {results.map((r) => {
                const selected = r.id === room?.id;
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
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {r.equipment.map((id) => EQUIPMENT.find((e) => e.id === id)?.label ?? id).join(" · ")}
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
            {room ? `Decision for ${room.name}` : "Decision"}
          </h2>

          {/* F4: no room matches the filters, so there is nothing to decide. */}
          {room === null && (
            <div role="status" aria-live="polite" className="rounded-xl border border-slate-300 bg-white p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <SearchX className="mt-0.5 h-7 w-7 shrink-0 text-slate-500" aria-hidden="true" />
                <div>
                  <p className="text-xl font-semibold text-slate-800">No matching rooms</p>
                  <p className="mt-1 text-sm text-slate-600">
                    No unblocked room has room for {people ?? "that many"} people and all the selected equipment.
                  </p>
                </div>
              </div>
            </div>
          )}

          {room !== null && (
            <>
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
            </>
          )}

          <p className="text-xs text-slate-500">
            Fictional sample data. Times are on a 24-hour clock for a single day. Checking a request never changes the bookings.
          </p>
        </section>
      </main>
    </div>
  );
}
