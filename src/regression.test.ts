import { describe, expect, it } from "vitest";
import { MalformedInputError, canBook, evaluateBooking } from "./booking";
import { ROOMS } from "./rooms";
import { checkAvailability } from "./availability";

// Fresh input for every test. Existing booking: 10:00-11:00 (600-660), "now" is 09:00 (540).
const makeInput = (over: Record<string, unknown> = {}) => ({
  start: 660,
  end: 720,
  now: 540,
  blocked: false,
  bookings: [{ start: 600, end: 660 }],
  ...over,
});

const codes = (over: Record<string, unknown>) => evaluateBooking(makeInput(over)).violations.map((v) => v.code);

describe("regression: evaluateBooking is the single source of truth (AC1-AC4)", () => {
  it("AC1 past time: start equal to or before now -> IN_PAST", () => {
    expect(codes({ start: 540, end: 570 })).toEqual(["IN_PAST"]);
    expect(codes({ start: 500, end: 560 })).toEqual(["IN_PAST"]);
    expect(canBook(makeInput({ start: 541, end: 570 }))).toBe(true); // one minute later is fine
  });

  it("AC1 reversed interval: start after end -> only INVALID_RANGE (no follow-up rules)", () => {
    expect(codes({ start: 750, end: 720 })).toEqual(["INVALID_RANGE"]);
    expect(codes({ start: 720, end: 720 })).toEqual(["INVALID_RANGE"]);
  });

  it("AC1 reversed interval in the past reports both INVALID_RANGE and IN_PAST", () => {
    expect(codes({ start: 500, end: 400 })).toEqual(["INVALID_RANGE", "IN_PAST"]);
  });

  it("AC2 duration: 120 minutes passes, 121 minutes -> TOO_LONG", () => {
    expect(codes({ start: 720, end: 840 })).toEqual([]);
    expect(codes({ start: 720, end: 841 })).toEqual(["TOO_LONG"]);
  });

  it("AC3 blocked room: otherwise-valid request -> ROOM_BLOCKED", () => {
    expect(codes({ blocked: true })).toEqual(["ROOM_BLOCKED"]);
  });

  it("AC4 overlap: partial, covering, inside and identical intervals -> OVERLAP with the booking", () => {
    for (const [start, end] of [[630, 690], [570, 690], [615, 645], [600, 660]]) {
      const { available, violations } = evaluateBooking(makeInput({ start, end }));
      expect(available).toBe(false);
      expect(violations).toEqual([{ code: "OVERLAP", booking: { start: 600, end: 660 } }]);
    }
  });

  it("AC4 touching endpoints: 570-600 and 660-720 around 600-660 are allowed", () => {
    expect(codes({ start: 570, end: 600 })).toEqual([]);
    expect(codes({ start: 660, end: 720 })).toEqual([]);
  });

  it("collects every broken rule, in a stable order", () => {
    // 09:30-12:01 is too long, in a blocked room, and overlaps 10:00-11:00.
    expect(codes({ start: 570, end: 721, blocked: true })).toEqual(["TOO_LONG", "ROOM_BLOCKED", "OVERLAP"]);
  });

  it("canBook agrees with evaluateBooking for a grid of requests", () => {
    for (let start = 0; start <= 1440; start += 30) {
      for (let end = 0; end <= 1440; end += 30) {
        for (const blocked of [false, true]) {
          const input = makeInput({ start, end, blocked });
          expect(canBook(input)).toBe(evaluateBooking(input).violations.length === 0);
        }
      }
    }
  });

  it("does not mutate its input", () => {
    const input = makeInput({ bookings: [{ start: 700, end: 760 }, { start: 600, end: 660 }] });
    const before = JSON.stringify(input);
    evaluateBooking(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("regression: malformed input is rejected explicitly", () => {
  it.each([
    ["now is NaN", { now: Number.NaN }],
    ["now is fractional", { now: 540.5 }],
    ["now is negative", { now: -1 }],
    ["now is after 24:00", { now: 1441 }],
    ["now is a string", { now: "09:00" }],
    ["blocked is not a boolean", { blocked: "no" }],
    ["bookings is not an array", { bookings: null }],
    ["a booking is null", { bookings: [null] }],
    ["a booking is reversed", { bookings: [{ start: 660, end: 600 }] }],
    ["a booking has the wrong shape", { bookings: [{ startTime: 600, endTime: 660 }] }],
  ])("%s -> throws MalformedInputError (never silently available)", (_name, over) => {
    expect(() => evaluateBooking(makeInput(over))).toThrow(MalformedInputError);
    expect(() => canBook(makeInput(over))).toThrow(MalformedInputError);
  });

  it("a non-integer start or end is a rule violation (AC1), not a crash", () => {
    expect(codes({ start: 660.5, end: 720 })).toEqual(["INVALID_RANGE"]);
    expect(codes({ start: Number.NaN, end: 720 })).toContain("INVALID_RANGE");
  });
});

describe("regression: checkAvailability (UI mapping) keeps verdict and messages consistent", () => {
  const lab = ROOMS.find((r) => r.id === "lab-101")!; // bookings 09:00-10:00, 10:00-11:00, 14:00-15:30
  const studio = ROOMS.find((r) => r.id === "studio-c012")!; // blocked

  it("AC1 past time -> Unavailable with the current-time message", () => {
    const d = checkAvailability(lab, 11 * 60, 12 * 60, 11 * 60);
    expect(d.available).toBe(false);
    expect(d.issues).toEqual([
      { code: "IN_PAST", message: "Start (11:00) must be later than the current time (11:00)." },
    ]);
  });

  it("AC1 reversed interval -> Unavailable with the range message", () => {
    const d = checkAvailability(lab, 12 * 60, 11 * 60, 8 * 60);
    expect(d.available).toBe(false);
    expect(d.issues.map((i) => i.code)).toEqual(["INVALID_RANGE"]);
    expect(d.issues[0].message).toContain("Start (12:00) must be earlier than end (11:00)");
  });

  it("AC2 121 minutes -> Unavailable and the message states the duration", () => {
    const d = checkAvailability(lab, 11 * 60, 11 * 60 + 121, 8 * 60);
    expect(d.available).toBe(false);
    expect(d.issues).toEqual([
      { code: "TOO_LONG", message: "Bookings can last at most 120 minutes. This request is 121 minutes." },
    ]);
  });

  it("AC2 exactly 120 minutes -> Available", () => {
    expect(checkAvailability(lab, 11 * 60, 13 * 60, 8 * 60)).toEqual({ available: true, issues: [] });
  });

  it("AC3 blocked room -> Unavailable and the message names the reason", () => {
    const d = checkAvailability(studio, 15 * 60, 16 * 60, 8 * 60);
    expect(d.available).toBe(false);
    expect(d.issues).toEqual([
      { code: "ROOM_BLOCKED", message: "Studio C-012 is blocked: projector repair in progress." },
    ]);
  });

  it("AC4 overlap -> Unavailable and the message names the clashing booking", () => {
    const d = checkAvailability(lab, 10 * 60 + 30, 11 * 60 + 30, 8 * 60);
    expect(d.available).toBe(false);
    expect(d.issues).toEqual([{ code: "OVERLAP", message: 'Overlaps "Python workshop" (10:00-11:00).' }]);
  });

  it("AC4 touching endpoints -> Available (11:00-12:00 touches 10:00-11:00)", () => {
    expect(checkAvailability(lab, 11 * 60, 12 * 60, 8 * 60)).toEqual({ available: true, issues: [] });
  });

  it("AC5 verdict always equals 'no issues' across every room", () => {
    for (const room of ROOMS) {
      for (let start = 0; start <= 1440; start += 45) {
        for (let end = 0; end <= 1440; end += 45) {
          const d = checkAvailability(room, start, end, 480);
          expect(d.available).toBe(d.issues.length === 0);
        }
      }
    }
  });
});

describe("regression: fixtures stay unchanged (AC5)", () => {
  it("ROOMS is deeply frozen and unchanged after many checks", () => {
    const before = JSON.stringify(ROOMS);
    for (const room of ROOMS) {
      for (let start = 0; start <= 1440; start += 60) {
        for (let end = 0; end <= 1440; end += 60) checkAvailability(room, start, end, 480);
      }
    }
    expect(JSON.stringify(ROOMS)).toBe(before);

    for (const room of ROOMS) {
      expect(Object.isFrozen(room)).toBe(true);
      expect(Object.isFrozen(room.bookings)).toBe(true);
      room.bookings.forEach((b) => expect(Object.isFrozen(b)).toBe(true));
    }
  });

  it("rejects attempts to change a booking in place", () => {
    const booking = ROOMS[0].bookings[0] as { start: number };
    expect(() => {
      booking.start = 0;
    }).toThrow(TypeError);
    expect(ROOMS[0].bookings[0].start).toBe(540);
  });

  it("every fixture booking is itself a valid interval (no malformed data reaches the rules)", () => {
    for (const room of ROOMS) {
      expect(() => evaluateBooking({ start: 1000, end: 1030, now: 0, blocked: room.blocked, bookings: room.bookings })).not.toThrow();
    }
  });
});
