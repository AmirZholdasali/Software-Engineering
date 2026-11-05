/**
 * Room catalog: types and frozen, fictional sample data. No logic besides deepFreeze.
 * Time model: every time is an integer number of minutes after 00:00 (0..1440).
 */

export type Equipment = "projector" | "whiteboard" | "computers" | "video-conf";

/** Every equipment option, in display order, with its UI label. */
export const EQUIPMENT: readonly { readonly id: Equipment; readonly label: string }[] = Object.freeze([
  Object.freeze({ id: "projector", label: "Projector" }),
  Object.freeze({ id: "whiteboard", label: "Whiteboard" }),
  Object.freeze({ id: "computers", label: "Computers" }),
  Object.freeze({ id: "video-conf", label: "Video conferencing" }),
] as const);

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
  readonly equipment: readonly Equipment[];
  readonly blocked: boolean;
  readonly blockedReason?: string;
  readonly bookings: readonly Booking[];
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as object).forEach(deepFreeze);
  }
  return value;
}

// Frozen on purpose: checking availability or filtering must never change this data (AC5).
export const ROOMS: readonly Room[] = deepFreeze([
  {
    id: "lab-101",
    name: "Aurora Lab 101",
    kind: "Computer lab",
    capacity: 30,
    equipment: ["computers", "projector", "whiteboard"],
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
    equipment: ["projector", "video-conf"],
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
    equipment: ["projector", "whiteboard"],
    blocked: true,
    blockedReason: "projector repair in progress",
    bookings: [{ id: "b7", title: "UX critique", start: 780, end: 840 }], // 13:00-14:00
  },
  {
    id: "sem-d305",
    name: "Seminar D-305",
    kind: "Seminar room",
    capacity: 12,
    equipment: ["whiteboard", "video-conf"],
    blocked: false,
    bookings: [
      { id: "b8", title: "Thesis meeting", start: 600, end: 660 }, // 10:00-11:00
      { id: "b9", title: "Reading group", start: 840, end: 900 }, // 14:00-15:00
    ],
  },
]);
