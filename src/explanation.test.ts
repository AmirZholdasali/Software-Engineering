import { afterEach, describe, expect, it, vi } from "vitest";
import { ROOMS, type Room } from "./rooms";
import { checkAvailability, explanationErrorMessage } from "./availability";
import {
  ExplanationError,
  buildExplanationContext,
  normalizeExplanation,
  withTimeout,
  type ExplanationErrorCode,
  type ExplanationRequest,
} from "./explanation";

// Catalog (src/rooms.ts), times in minutes:
//   lab-101      bookings 09:00-10:00, 10:00-11:00 (Python workshop), 14:00-15:30 (Robotics club)
//   studio-c012  BLOCKED "projector repair in progress"
const byId = (id: string): Room => ROOMS.find((r) => r.id === id)!;
const NOW = 480; // 08:00

function contextFor(room: Room, start: number, end: number, now = NOW, people: number | null = 5) {
  const request: ExplanationRequest = { start, end, now, people };
  return buildExplanationContext(room, request, checkAvailability(room, start, end, now));
}

// A made-up room whose booking titles contain guard trigger words ("Blocked", "Free"). Fictional test data.
const triggerRoom: Room = {
  id: "test-room",
  name: "Test Room",
  kind: "Test",
  capacity: 10,
  equipment: [],
  blocked: false,
  bookings: [
    { id: "x1", title: "Blocked-out slot", start: 600, end: 660 }, // 10:00-11:00
    { id: "x2", title: "Free study hour", start: 720, end: 780 }, // 12:00-13:00
  ],
};

const isDeeplyFrozen = (value: unknown): boolean =>
  typeof value !== "object" || value === null || (Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen));

describe("buildExplanationContext: empty input", () => {
  const lab = byId("lab-101");
  const decision = checkAvailability(lab, 660, 720, NOW);

  it("returns null when there is no room, no decision or a time is missing", () => {
    expect(buildExplanationContext(null, { start: 660, end: 720, now: NOW, people: 1 }, decision)).toBeNull();
    expect(buildExplanationContext(lab, { start: 660, end: 720, now: NOW, people: 1 }, null)).toBeNull();
    expect(buildExplanationContext(lab, { start: null, end: 720, now: NOW, people: 1 }, decision)).toBeNull();
    expect(buildExplanationContext(lab, { start: 660, end: null, now: NOW, people: 1 }, decision)).toBeNull();
    expect(buildExplanationContext(lab, { start: 660, end: 720, now: null, people: 1 }, decision)).toBeNull();
  });
});

describe("buildExplanationContext: facts come from the checker's decision", () => {
  it("available request: copies the verdict, formats times, lists the back-to-back booking", () => {
    const ctx = contextFor(byId("lab-101"), 660, 720)!; // 11:00-12:00 touches Python workshop (ends 11:00)
    expect(ctx.result).toEqual({ available: true, reasonCodes: [] });
    expect(ctx.request).toEqual({ start: "11:00", end: "12:00", now: "08:00", durationMinutes: 60, people: 5 });
    expect(ctx.limits.maxDurationMinutes).toBe(120);
    expect(ctx.room).toMatchObject({ id: "lab-101", name: "Aurora Lab 101", capacity: 30, blocked: false });
    expect(ctx.touching).toEqual([{ title: "Python workshop", start: "10:00", end: "11:00" }]);
    expect(ctx.conflicts).toEqual([]);
  });

  it("overlap: reason code OVERLAP and only the colliding booking is passed on", () => {
    const ctx = contextFor(byId("lab-101"), 630, 690)!; // 10:30-11:30 overlaps Python workshop only
    expect(ctx.result.available).toBe(false);
    expect(ctx.result.reasonCodes).toEqual(["OVERLAP"]);
    expect(ctx.conflicts).toEqual([{ title: "Python workshop", start: "10:00", end: "11:00" }]);
    expect(ctx.touching).toEqual([]);
    expect(JSON.stringify(ctx)).not.toContain("Robotics club"); // unrelated bookings are not leaked
  });

  it("blocked room: reason code ROOM_BLOCKED and the blocked reason are included", () => {
    const ctx = contextFor(byId("studio-c012"), 900, 960)!;
    expect(ctx.result).toEqual({ available: false, reasonCodes: ["ROOM_BLOCKED"] });
    expect(ctx.room.blocked).toBe(true);
    expect(ctx.room.blockedReason).toBe("projector repair in progress");
  });

  it("keeps every reason code, in the checker's order", () => {
    const ctx = contextFor(byId("lab-101"), 480, 720)!; // starts at "now", 240 min, overlaps two bookings
    expect(ctx.result.reasonCodes).toEqual(["IN_PAST", "TOO_LONG", "OVERLAP", "OVERLAP"]);
    expect(ctx.conflicts.map((c) => c.title)).toEqual(["Algorithms lab", "Python workshop"]);
  });

  it("omits blockedReason when the room has none, and passes people through (null allowed)", () => {
    const ctx = contextFor(byId("lab-101"), 660, 720, NOW, null)!;
    expect("blockedReason" in ctx.room).toBe(false);
    expect(ctx.request.people).toBeNull();
  });
});

describe("buildExplanationContext: purity (AC1/AC4)", () => {
  it("returns a deeply frozen object and does not change the frozen catalog or the decision", () => {
    const lab = byId("lab-101");
    const decision = checkAvailability(lab, 630, 690, NOW);
    const catalogBefore = JSON.stringify(ROOMS);
    const decisionBefore = JSON.stringify(decision);

    const ctx = buildExplanationContext(lab, { start: 630, end: 690, now: NOW, people: 5 }, decision)!;

    expect(isDeeplyFrozen(ctx)).toBe(true);
    expect(JSON.stringify(ROOMS)).toBe(catalogBefore);
    expect(JSON.stringify(decision)).toBe(decisionBefore);
    expect(ctx.room.equipment).not.toBe(lab.equipment); // a copy, not the catalog's array
  });
});

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as ExplanationError).code;
  }
  return undefined;
};

describe("normalizeExplanation (output guard)", () => {
  const availableCtx = contextFor(byId("lab-101"), 660, 720)!; // verdict: available
  const unavailableCtx = contextFor(byId("lab-101"), 630, 690)!; // verdict: unavailable (overlap)

  it("trims a normal answer", () => {
    expect(normalizeExplanation("  Good news.  ", availableCtx)).toBe("Good news.");
  });

  it.each(["", "   \n", undefined, 42])("rejects %j with EMPTY_OUTPUT", (value) => {
    expect(codeOf(() => normalizeExplanation(value, availableCtx))).toBe("EMPTY_OUTPUT");
  });

  describe("CONTRADICTION when the verdict is available", () => {
    it.each([
      "Aurora Lab 101 is unavailable.",
      "Sorry, the room is not available at that time.",
      "The room is blocked.",
      "NOT  AVAILABLE for you.",
    ])("rejects %j", (text) => {
      expect(codeOf(() => normalizeExplanation(text, availableCtx))).toBe("CONTRADICTION");
    });

    it("accepts a consistent text, even when a KNOWN booking title contains a trigger word (F3)", () => {
      const ctx = contextFor(triggerRoom, 660, 720)!; // touches both titled bookings
      expect(ctx.result.available).toBe(true);
      const text = 'Good news: Test Room is available. It sits back-to-back with "Blocked-out slot" (10:00-11:00).';
      expect(normalizeExplanation(text, ctx)).toBe(text);
    });

    it("still rejects a trigger word that is not a known title, quoted or not (F3)", () => {
      const text = 'Good news: Aurora Lab 101 is available. It sits back-to-back with "Blocked-out slot" (10:00-11:00).';
      expect(codeOf(() => normalizeExplanation(text, availableCtx))).toBe("CONTRADICTION"); // not in availableCtx
      expect(codeOf(() => normalizeExplanation('The checker said "the room is blocked".', availableCtx))).toBe(
        "CONTRADICTION",
      );
    });
  });

  describe("CONTRADICTION when the verdict is unavailable", () => {
    it.each([
      "Good news: the room is free.",
      "The room is available from 10:30 to 11:30.",
      "Available!",
      'The checker said "the room is available".', // a quoted lie is still a claim (F3)
      'It overlaps "Free study hour" (10:00-11:00).', // not a title known to this context
    ])("rejects %j", (text) => {
      expect(codeOf(() => normalizeExplanation(text, unavailableCtx))).toBe("CONTRADICTION");
    });

    it("accepts a trigger word inside a KNOWN conflicting title (F3)", () => {
      const ctx = contextFor(triggerRoom, 690, 750)!; // overlaps "Free study hour" only
      expect(ctx.result.reasonCodes).toEqual(["OVERLAP"]);
      const text = 'Sorry, Test Room is not available. It overlaps "Free study hour" (12:00-13:00).';
      expect(normalizeExplanation(text, ctx)).toBe(text);
    });

    it.each([
      "Sorry, the room is not available. It overlaps a booking.",
      "The room is unavailable at that time.",
      "Sorry, it is not free then.",
    ])("accepts the consistent text %j", (text) => {
      expect(normalizeExplanation(text, unavailableCtx)).toBe(text);
    });
  });
});

describe("explanationErrorMessage", () => {
  it.each<ExplanationErrorCode>(["TIMEOUT", "API_ERROR", "EMPTY_OUTPUT", "CONTRADICTION", "EMPTY_INPUT"])(
    "%s has a user-facing message",
    (code) => {
      expect(explanationErrorMessage(code).length).toBeGreaterThan(10);
    },
  );

  it("failure messages reassure that the decision is unaffected", () => {
    expect(explanationErrorMessage("TIMEOUT")).toMatch(/decision above is still correct/);
    expect(explanationErrorMessage("API_ERROR")).toMatch(/decision above is still correct/);
  });
});

describe("withTimeout (F4)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes a fast result through and clears its timer", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes a fast rejection through unchanged", async () => {
    await expect(withTimeout(Promise.reject(new ExplanationError("API_ERROR")), 1000)).rejects.toMatchObject({
      code: "API_ERROR",
    });
  });

  it("rejects with TIMEOUT when the promise never settles", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => {}), 1000);
    const assertion = expect(pending).rejects.toMatchObject({ name: "ExplanationError", code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(999);
    expect(vi.getTimerCount()).toBe(1); // still waiting one ms before the limit
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("ExplanationError", () => {
  it("carries its code and is an Error", () => {
    const error = new ExplanationError("TIMEOUT");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ExplanationError");
    expect(error.code).toBe("TIMEOUT");
  });
});
