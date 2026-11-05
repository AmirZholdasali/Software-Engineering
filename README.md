# Smart Campus Room Availability Checker

A small React + TypeScript page that checks whether a campus room is free for a time slot. It has a
catalog of 4 fictional rooms, filters (people, equipment), and booking rules AC1-AC6.
There is no backend, no login, and no booking creation: it is a check only.

## Requirements
- Node.js 18 or newer (developed with Node 24.13.1, npm 11.8.0)

## Setup
```bash
npm install
```

## Run
```bash
npm run dev       # development server (http://localhost:5173)
npm run build     # production build into dist/
npm run preview   # serve the production build (http://localhost:4173)
```

## Test and check
```bash
npm test            # all automated tests (Vitest), 71 tests
npm run typecheck   # TypeScript, no emit
npm run lint        # ESLint
```

## Project structure
| File | Responsibility |
|---|---|
| `src/rooms.ts` | Room/booking/equipment types and the frozen room catalog |
| `src/booking.ts` | Booking rules AC1-AC4 (`evaluateBooking`, `canBook`) |
| `src/filters.ts` | Room filters F1-F3, selection for F4/F5 |
| `src/availability.ts` | Rule violations to messages, time/people parsing |
| `src/App.tsx` | React state and rendering only |
| `src/*.test.ts(x)` | Rule, regression, filter and UI tests |

See `ARCHITECTURE.md` for diagrams and `FINAL_REPORT.md` for the evaluation.
