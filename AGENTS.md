# AGENTS.md

## Project
Smart Campus room availability checker (Assignment #04). A catalog of at least 4 rooms, fictional data.
Each room has: ID, name, capacity, equipment list, blocked status, and its own bookings.

## Constraints
- Preserve acceptance criteria AC1-AC6.
- No backend, no login, no booking creation.

## In-scope features (Assignment #04)
- Room catalog of at least 4 rooms with an equipment list per room.
- F1: a room matches only if capacity >= requested number of people.
- F2: a room matches only if it has ALL selected equipment.
- F3: a blocked room is never available (excluded from filter results).
- F4: show an empty state when no room matches.
- F5: the result refreshes when the selected room changes; if the selected room no longer
  matches the filters, the first match is selected automatically.

## Module boundaries
- `src/rooms.ts`: room/booking types and frozen fixture data only.
- `src/booking.ts`: booking rules AC1-AC4 (`evaluateBooking`), no UI text.
- `src/filters.ts`: filtering rules F1-F3 and selection (F4/F5), pure functions.
- `src/availability.ts`: maps rule violations to user messages; input parsing/formatting.
- `src/App.tsx`: React state and rendering only.

## Engineering rules
- Prefer pure functions and minimal changes.
- Use at most 2 justified patterns.
- Do not mutate booking fixtures.
- Keep responsive UI feedback.

## Verification
- Run the existing tests and add focused regression tests.
- Report changed files, rationale, and test evidence.

## Forbidden scope changes
- Do NOT add features beyond the catalog and F1-F5 listed above.
- Do NOT modify the UI layout beyond what F1-F5 and the module split require.
