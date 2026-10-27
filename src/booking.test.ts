import { describe, expect, it } from "vitest";
import { canBook } from "./booking";

// Fresh fixture for every test.
const makeInput = (over: Record<string, unknown> = {}) => ({
  start: 0,
  end: 0,
  now: 540,
  blocked: false,
  bookings: [{ start: 600, end: 660 }],
  ...over,
});

describe("canBook", () => {
  it("T01: 660-720 touching after -> true", () => {
    expect(canBook(makeInput({ start: 660, end: 720 }))).toBe(true);
  });
  it("T02: 540-570 starts at now -> false", () => {
    expect(canBook(makeInput({ start: 540, end: 570 }))).toBe(false);
  });
  it("T03: 720-720 -> false", () => {
    expect(canBook(makeInput({ start: 720, end: 720 }))).toBe(false);
  });
  it("T04: 750-720 -> false", () => {
    expect(canBook(makeInput({ start: 750, end: 720 }))).toBe(false);
  });
  it("T05: 1380-1441 -> false", () => {
    expect(canBook(makeInput({ start: 1380, end: 1441 }))).toBe(false);
  });
  it("T06: 720-840 exactly 120 minutes -> true", () => {
    expect(canBook(makeInput({ start: 720, end: 840 }))).toBe(true);
  });
  it("T07: 720-841 121 minutes -> false", () => {
    expect(canBook(makeInput({ start: 720, end: 841 }))).toBe(false);
  });
  it("T08: 570-600 touching before -> true", () => {
    expect(canBook(makeInput({ start: 570, end: 600 }))).toBe(true);
  });
  it("T09: 630-690 partial overlap -> false", () => {
    expect(canBook(makeInput({ start: 630, end: 690 }))).toBe(false);
  });
  it("T10: 570-690 covers booking -> false", () => {
    expect(canBook(makeInput({ start: 570, end: 690 }))).toBe(false);
  });
  it("T11: 615-645 inside booking -> false", () => {
    expect(canBook(makeInput({ start: 615, end: 645 }))).toBe(false);
  });
  it("T12: 600-660 identical interval -> false", () => {
    expect(canBook(makeInput({ start: 600, end: 660 }))).toBe(false);
  });
  it("T13: blocked room -> false", () => {
    expect(canBook(makeInput({ start: 660, end: 720, blocked: true }))).toBe(false);
  });
  it("T14: no bookings -> true", () => {
    expect(canBook(makeInput({ start: 630, end: 690, bookings: [] }))).toBe(true);
  });

  describe("T15: bookings are not mutated", () => {
    it("when result is true", () => {
      const input = makeInput({ start: 660, end: 720 });
      const before = JSON.stringify(input.bookings);
      expect(canBook(input)).toBe(true);
      expect(JSON.stringify(input.bookings)).toBe(before);
    });
    it("when result is false", () => {
      const input = makeInput({ start: 630, end: 690 });
      const before = JSON.stringify(input.bookings);
      expect(canBook(input)).toBe(false);
      expect(JSON.stringify(input.bookings)).toBe(before);
    });
  });
});
