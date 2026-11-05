import { describe, expect, it } from "vitest";
import { ROOMS, type Equipment, type Room } from "./rooms";
import { filterRooms, hasAllEquipment, hasCapacity, isNotBlocked, resolveSelection, type FilterCriteria } from "./filters";
import { checkAvailability, parsePeople } from "./availability";

// Catalog (src/rooms.ts):
//   lab-101      capacity 30   computers, projector, whiteboard
//   hall-b204    capacity 120  projector, video-conf
//   studio-c012  capacity 24   projector, whiteboard      BLOCKED
//   sem-d305     capacity 12   whiteboard, video-conf
const byId = (id: string): Room => ROOMS.find((r) => r.id === id)!;
const ids = (rooms: readonly Room[]) => rooms.map((r) => r.id);
const criteria = (minCapacity: number, equipment: Equipment[] = []): FilterCriteria => ({ minCapacity, equipment });

describe("catalog", () => {
  it("has at least 4 rooms, each with id, name, capacity, equipment, blocked status and bookings", () => {
    expect(ROOMS.length).toBeGreaterThanOrEqual(4);
    for (const room of ROOMS) {
      expect(typeof room.id).toBe("string");
      expect(typeof room.name).toBe("string");
      expect(Number.isInteger(room.capacity)).toBe(true);
      expect(Array.isArray(room.equipment)).toBe(true);
      expect(typeof room.blocked).toBe("boolean");
      expect(Array.isArray(room.bookings)).toBe(true);
      expect(Object.isFrozen(room.equipment)).toBe(true);
    }
  });
});

describe("AC2 boundary on catalog rooms: 120 vs 121 minutes", () => {
  it("exactly 120 minutes is Available in Hall B-204 (13:30-15:30)", () => {
    expect(checkAvailability(byId("hall-b204"), 810, 930, 480)).toEqual({ available: true, issues: [] });
  });
  it("121 minutes is Unavailable with TOO_LONG only (13:30-15:31)", () => {
    const d = checkAvailability(byId("hall-b204"), 810, 931, 480);
    expect(d.available).toBe(false);
    expect(d.issues.map((i) => i.code)).toEqual(["TOO_LONG"]);
  });
});

describe("AC4 boundary on catalog rooms: touching vs overlapping", () => {
  const seminar = byId("sem-d305"); // Thesis meeting 10:00-11:00
  it("touching before (09:00-10:00) and after (11:00-12:00) are Available", () => {
    expect(checkAvailability(seminar, 540, 600, 480).available).toBe(true);
    expect(checkAvailability(seminar, 660, 720, 480).available).toBe(true);
  });
  it("one minute of overlap on either side is Unavailable with OVERLAP", () => {
    expect(checkAvailability(seminar, 540, 601, 480).issues.map((i) => i.code)).toEqual(["OVERLAP"]);
    expect(checkAvailability(seminar, 659, 720, 480).issues.map((i) => i.code)).toEqual(["OVERLAP"]);
  });
});

describe("F1 capacity >= requested", () => {
  it("exact capacity match is kept (30 people -> Aurora Lab 101 with capacity 30)", () => {
    expect(hasCapacity(byId("lab-101"), criteria(30))).toBe(true);
    expect(ids(filterRooms(ROOMS, criteria(30)))).toEqual(["lab-101", "hall-b204"]);
  });
  it("one person over capacity is excluded (31 people)", () => {
    expect(hasCapacity(byId("lab-101"), criteria(31))).toBe(false);
    expect(ids(filterRooms(ROOMS, criteria(31)))).toEqual(["hall-b204"]);
  });
  it("parsePeople accepts whole numbers >= 1 only", () => {
    expect(parsePeople("12")).toBe(12);
    expect(parsePeople(" 1 ")).toBe(1);
    for (const bad of ["0", "-3", "2.5", "", "abc", "12345"]) expect(parsePeople(bad)).toBeNull();
  });
});

describe("F2 contains ALL selected equipment", () => {
  it("a room with every selected item matches", () => {
    expect(hasAllEquipment(byId("lab-101"), criteria(1, ["projector", "whiteboard"]))).toBe(true);
  });
  it("a partial match is excluded (Hall B-204 has projector but no whiteboard)", () => {
    expect(hasAllEquipment(byId("hall-b204"), criteria(1, ["projector", "whiteboard"]))).toBe(false);
    expect(ids(filterRooms(ROOMS, criteria(1, ["projector", "whiteboard"])))).toEqual(["lab-101"]);
  });
  it("no selected equipment matches every unblocked room", () => {
    expect(ids(filterRooms(ROOMS, criteria(1)))).toEqual(["lab-101", "hall-b204", "sem-d305"]);
  });
});

describe("F3 blocked room is never available", () => {
  it("Studio C-012 is excluded even when it satisfies capacity and equipment", () => {
    const studio = byId("studio-c012");
    const c = criteria(24, ["projector", "whiteboard"]);
    expect(hasCapacity(studio, c) && hasAllEquipment(studio, c)).toBe(true);
    expect(isNotBlocked(studio, c)).toBe(false);
    expect(ids(filterRooms(ROOMS, c))).not.toContain("studio-c012");
  });
  it("the booking rules still report ROOM_BLOCKED for it (AC3)", () => {
    expect(checkAvailability(byId("studio-c012"), 900, 960, 480).issues.map((i) => i.code)).toEqual(["ROOM_BLOCKED"]);
  });
});

describe("F4 empty state / F5 selection", () => {
  it("F4: no match returns an empty list and no selected room", () => {
    const results = filterRooms(ROOMS, criteria(121));
    expect(results).toEqual([]);
    expect(resolveSelection(results, "lab-101")).toBeNull();
  });
  it("F4: equipment no unblocked room has in full also gives the empty state", () => {
    expect(filterRooms(ROOMS, criteria(1, ["computers", "video-conf"]))).toEqual([]);
  });
  it("F5: the selected room is kept while it still matches", () => {
    const results = filterRooms(ROOMS, criteria(10));
    expect(resolveSelection(results, "sem-d305")?.id).toBe("sem-d305");
  });
  it("F5: when the selected room drops out, the first match is selected", () => {
    const results = filterRooms(ROOMS, criteria(13)); // Seminar D-305 (12) drops out
    expect(resolveSelection(results, "sem-d305")?.id).toBe("lab-101");
  });
  it("F5: an unknown id falls back to the first match", () => {
    expect(resolveSelection(filterRooms(ROOMS, criteria(1)), "no-such-room")?.id).toBe("lab-101");
  });
});

describe("filters do not mutate their inputs (AC5)", () => {
  it("ROOMS and the criteria are unchanged after filtering and selection", () => {
    const equipment: Equipment[] = ["whiteboard"];
    const c = criteria(5, equipment);
    const before = JSON.stringify({ ROOMS, c });
    const results = filterRooms(ROOMS, c);
    resolveSelection(results, "hall-b204");
    expect(JSON.stringify({ ROOMS, c })).toBe(before);
    expect(results).not.toBe(ROOMS);
  });
});
