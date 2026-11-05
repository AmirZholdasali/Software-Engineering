# Assignment #04 – Final Report

Smart Campus Room Availability Checker: AI-assisted software evolution, refactoring and quality improvement.
Branch: `feature/assignment-04` (from `refactor/practice-work-09`, commit `717ec1c`).

## 1. Quality evaluation (Task #05)

| Measure | Original (Practice #09, `717ec1c`) | Final (Assignment #04) | How it was obtained |
|---|---|---|---|
| Automated tests passed / total | 48 / 48 | 71 / 71 | `npm test` (Vitest 2.1.9) on each version. Final output saved in `TEST_RESULTS.txt`. |
| Test files | 2 (rules, regression) | 4 (+ filters, UI) | `src/*.test.ts(x)` |
| UI / integration tests | 0 | 4 | `src/App.test.tsx`, React Testing Library + jsdom |
| Mutation check on new rules | – | 2 of 2 mutations caught (2 and 12 failing tests) | Temporarily changed `>=` to `>` in F1 and `every` to `some` in F2, ran `npm test`, then restored |
| Lint warnings | 9 | 0 | `npm run lint` |
| Typecheck / build | clean / succeeds | clean / succeeds | `npm run typecheck`, `npm run build` |
| Rooms / equipment / filters | 4 rooms, no equipment, no filters | 4 rooms with equipment, F1-F5 | `src/rooms.ts`, `src/filters.ts` |
| Lines in `App.tsx` | 566 (data, logic and UI) | 489 (UI only, incl. new filter controls) | `wc -l` |

### Duplicated logic removed

| Duplication | Where | Status |
|---|---|---|
| AC1-AC4 rules implemented twice (`canBook` and `checkAvailability`) | `booking.ts`, `App.tsx` | Removed in Practice #09: `checkAvailability` delegates to `evaluateBooking`. Kept that way. |
| `IssueCode` union hand-copied from the rule codes | `App.tsx:56` vs `booking.ts:39` | **Removed in Assignment #04**: `IssueCode = Violation["code"]` in `availability.ts` |
| Re-exports of 5 rule functions/constants from the UI module (second import path) | `App.tsx:68` | **Removed in Assignment #04** |

Measured as: 2 duplication locations removed in this assignment (`IssueCode` copy, re-export block),
1 earlier duplication (`checkAvailability` rules) confirmed still removed. Found by reading the code and
confirmed by the 9 → 0 lint warnings (5 of the 9 came from the re-export block).

### Code structure

| Module | Responsibility | Pure / React |
|---|---|---|
| `src/rooms.ts` | Types (`Room`, `Booking`, `Equipment`), `EQUIPMENT` list, deeply frozen `ROOMS` | pure data |
| `src/booking.ts` | Booking rules AC1-AC4: `evaluateBooking`, `canBook`, `MalformedInputError` (unchanged) | pure |
| `src/filters.ts` | F1 `hasCapacity`, F2 `hasAllEquipment`, F3 `isNotBlocked`, `filterRooms`, F4/F5 `resolveSelection` | pure |
| `src/availability.ts` | Violations → messages (`checkAvailability`), `parseTime`, `formatTime`, `parsePeople` | pure |
| `src/App.tsx` | State (raw inputs only) and rendering: `TimeField`, `Timeline`, `App` | React |

Before: everything except `booking.ts` lived in `App.tsx`, and tests imported data and logic from the UI
file. Diagrams are in `ARCHITECTURE.md`. Patterns used: 1 (Specification-style predicate list), within the
limit of 2 in `AGENTS.md`.

### Remaining limitations
- **Timeline labels crowd at 390 px.** The hour labels in `Timeline` overlap slightly on narrow phones
  (seen in the mobile screenshot). Existing behavior; the component was not changed.
- **No persistence.** Filters and inputs are lost on reload; data is fixed fictional fixtures (by design: no backend).
- **Blocked rooms cannot be inspected in the UI.** Because F3 excludes them, a user cannot see why Studio C-012
  is unavailable. AC3 is still enforced and tested in the rules.
- **Single day only.** Times are minutes within one day; there is no date selection.

## 2. AI reflection (Task #06)

I used Claude Code as a coding agent on my existing Practice #09 repository. Its context was the
codebase itself, `AGENTS.md` with the acceptance criteria and engineering rules, and my prompts with the
new requirements F1-F5. I worked in four phases and approved each plan before any code was written.

The most useful suggestions were the module split into `rooms.ts`, `availability.ts` and `filters.ts`,
writing each filter rule as a small pure predicate, and deriving the selected room instead of storing it.
The agent also noticed that `AGENTS.md` still said "one room" and "no new features", which would have
contradicted the assignment. Not every suggestion was right for this project. It proposed a second
architecture with a repository, strategy classes and a service facade, and then rejected it itself
because it broke the two-pattern limit and added abstraction without a backend. I agreed.

I verified the work myself. I reran the tests, typecheck, lint and build, and I checked the desktop,
mobile, empty-state and filtered views in the browser. I also reviewed the behavior changes the agent
reported, such as the blocked room no longer appearing in the list.

Tests shaped the decisions. The 48 existing tests had to stay green through the refactor, which kept the
changes small. The new boundary tests made F1-F5 precise, for example exactly 30 people versus 31. The
mutation check proved that the tests fail when a rule is broken, so they really protect the code.

Next, I would fix the crowded timeline labels on narrow screens, show blocked rooms with their reason
instead of hiding them, and add date selection.

## 3. AI evidence appendix

**Tool:** Claude Code (CLI), model Claude Opus 5.5. **Date:** 2026-11-05.

| Phase | Prompt summary | Output used |
|---|---|---|
| 1. Analysis (Task #01) | Create branch, map the repo, find ≥3 maintainability risks, plan F1-F5, propose two architectures and reject one | Branch `feature/assignment-04`, repo map, 5 risks, plan P0-P5, Approach A chosen, B rejected |
| 2. Implementation | Execute P0-P4 with Approach A; F3 = exclude blocked rooms, F5 = auto-select first match; create `ARCHITECTURE.md` | `AGENTS.md`, `rooms.ts`, `availability.ts`, `filters.ts`, updated `App.tsx`, `ARCHITECTURE.md` |
| 3. Testing (Task #04) | ≥10 new tests on the required boundaries, ≥1 UI test, save test output, recheck typecheck/lint/build, check AC6 | `filters.test.ts` (19), `App.test.tsx` (4), `TEST_RESULTS.txt`, mutation check, screenshots |
| 4. Finalization | README, this report, commit | `README.md`, `FINAL_REPORT.md`, commit on `feature/assignment-04` |

**Problems found during coding**
- `AGENTS.md` contradicted the assignment ("One room", "Do NOT add new features"); updated first (P0).
- The silent fallback `ROOMS.find(...) ?? ROOMS[0]` would show a room the user did not pick once filters can hide
  rooms; replaced by `resolveSelection` plus an explicit empty state.
- `regression.test.ts` imported `ROOMS` and `checkAvailability` from the UI module; only its import line was
  repointed to the new modules.
- No DOM test library was installed; added `@testing-library/react`, `@testing-library/dom` and `jsdom` as dev
  dependencies. Only `App.test.tsx` runs in jsdom (per-file `@vitest-environment` comment).
- While moving code, the wrapped JSX block in `App.tsx` had wrong indentation; fixed before verification.

**Verification sources**
- `npm test`: 71/71 passed (`TEST_RESULTS.txt`); the original 48 passed unchanged at every phase.
- Mutation check: F1 `>=` → `>` failed 2 tests; F2 `every` → `some` failed 12 tests; code restored.
- `npm run typecheck` clean, `npm run lint` 0 problems, `npm run build` succeeds.
- Screenshots: headless Chrome at 1280 px and 390 px from the production build (agent), plus my own desktop,
  mobile, empty-state and filtered-state screenshots.
