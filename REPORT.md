# Practice Work #09 – Report

## Project purpose
Smart Campus room availability checker: a small React + TypeScript page that tells a user whether a room is free for a chosen time slot. It uses one set of fictional room and booking data, with no backend, no login, and no booking creation. Practice Work #09 refactors it with an AI coding agent guided by `AGENTS.md`, while preserving acceptance criteria AC1–AC6.

## AGENTS.md (full content)

```markdown
# AGENTS.md

## Project
Smart Campus room availability checker. One room, fictional data.

## Constraints
- Preserve acceptance criteria AC1-AC6.
- No backend, no login, no booking creation.

## Engineering rules
- Prefer pure functions and minimal changes.
- Use at most 2 justified patterns.
- Do not mutate booking fixtures.
- Keep responsive UI feedback.

## Verification
- Run the existing tests and add focused regression tests.
- Report changed files, rationale, and test evidence.

## Forbidden scope changes
- Do NOT add new features.
- Do NOT modify the UI layout beyond necessary decoupling.
```

## Inspection summary
- **Booking-rule function:** `canBook()` in `src/booking.ts`.
- **UI component:** `src/App.tsx` (`App`, `TimeField`, `Timeline`, plus `checkAvailability`).
- **Fixtures:** the frozen `ROOMS` array in `src/App.tsx`. All bookings use the same `{ start, end }` shape.
- **Tests:** `src/booking.test.ts` (T01–T15, 16 tests).

Maintainability problems found:
1. The AC1–AC4 rules were implemented twice, once in `canBook` and once in `checkAvailability`, so the verdict and the explanation could drift apart.
2. Domain rules, message text, fixtures, parsing, and React components all lived in one 575-line UI file, so the rules were not testable without React.
3. Malformed input was not rejected. For example, `canBook({ now: NaN, ... })` returned `true`.
4. `App.tsx` re-exports the booking functions for no reason (the source of 5 of the 9 lint warnings). *Not changed, to keep the refactor to one problem.*

## Rationale for the chosen refactoring
**Problem → Pattern → Benefit.** The AC1–AC4 rules were implemented twice, so the verdict and the explanation could diverge. I introduced one pure `evaluateBooking()` in `src/booking.ts` that returns structured violations (codes, no UI text) and throws `MalformedInputError` for unusable input. `canBook` and the UI's `checkAvailability` now both derive from it, and the UI only maps violations to the same messages. The benefit is a single source of truth that is testable without React, with identical UI behavior.

**Patterns used: 0.** An Adapter was considered and rejected because every fixture already has the same `{ start, end }` shape, so there is nothing to normalize.

**Design notes**
- `canBook`'s signature and results are unchanged, so T01–T15 pass untouched.
- A bad `start`/`end` is still a rule violation (`INVALID_RANGE`, AC1), because it is the user's mistake. A bad `now`, `blocked`, or `bookings` throws `MalformedInputError`, because it is a data bug.
- `OVERLAP` violations carry the clashing booking object, so the UI can show its title without the rule module knowing about UI fields (`evaluateBooking<B extends BookingInterval>`).

**Changed files**
| File | Change |
|---|---|
| `AGENTS.md` | new: agent instructions |
| `src/booking.ts` | added `evaluateBooking`, `MalformedInputError`, and types. `canBook` now delegates. |
| `src/App.tsx` | `checkAvailability` delegates to `evaluateBooking` and only maps violations to messages. No JSX or layout changes. |
| `src/regression.test.ts` | new: 32 regression tests. Existing tests are untouched. |
| `REPORT.md` | new: this report |

## Tests
Command: `npm test` (runs `vitest run`)

```
> vite-react-typescript-starter@0.0.0 test
> vitest run


 RUN  v2.1.9 C:/Users/Мой Компьютер/Desktop/project

 ✓ src/booking.test.ts (16 tests) 3ms
 ✓ src/regression.test.ts (32 tests) 97ms

 Test Files  2 passed (2)
      Tests  48 passed (48)
   Start at  22:23:50
   Duration  1.09s (transform 97ms, setup 0ms, collect 215ms, tests 100ms, environment 0ms, prepare 256ms)
```

**Result: 48 passed, 0 failed** (16 existing + 32 new). The baseline before the refactor was 16 passed.

Regression tests and the AC that justifies each expected result:

| Scenario | Expected result | Rule |
|---|---|---|
| Past time (start ≤ now) | `IN_PAST`, unavailable. One minute after now is available. | AC1: start must be strictly after the current time |
| Reversed or empty interval | Only `INVALID_RANGE`. No follow-up rules are reported. | AC1: valid interval |
| 121 minutes | `TOO_LONG`. Exactly 120 minutes is available. | AC2: max 120 minutes |
| Blocked room | `ROOM_BLOCKED`, with the reason in the UI message | AC3: blocked room |
| Overlap (partial, covering, inside, identical) | `OVERLAP` naming the booking | AC4: overlap is unavailable |
| Touching endpoints (570-600, 660-720 around 600-660) | Available | AC4: touching allowed |
| Unchanged fixtures | `ROOMS` is deeply frozen, byte-identical after many checks, and in-place edits throw | AC5: no mutation |
| Malformed input (10 cases) | `MalformedInputError` | Explicit rejection of bad data |
| Verdict equals "no issues" for every room and a grid of times | always true | AC5: Available/Unavailable consistent with the explanation |

Other checks:
- **Mutation check:** temporarily changing `<` to `<=` in `intervalsOverlap` made 9 tests fail. The change was reverted and all 48 pass again.
- **Behavior comparison:** `checkAvailability` output (verdict, codes, messages) over 26,136 combinations (4 rooms × 6 "now" values × 33 × 33 start/end values) is byte-identical before and after the refactor.
- `npm run typecheck`: clean. `npm run lint`: 0 errors, 9 warnings (same as baseline). `npm run build`: succeeds.

## Visual verification
The page was rendered headlessly with Chrome from the production build, at a 1280 px desktop width and a 390 px mobile width (in a 390 px iframe). The desktop view uses the two-column layout. The mobile view is a single column with no horizontal overflow. The timeline tick labels crowd slightly at 390 px; this is existing behavior in `Timeline`, which was not touched.

**Note: the user will attach screenshots of the desktop and mobile views manually.**

## GitHub repository
https://github.com/AmirZholdasali/Software-Engineering.git (from `git remote -v`)

Branch: `refactor/practice-work-09`
