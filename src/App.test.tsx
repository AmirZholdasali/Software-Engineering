// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { ROOMS } from "./rooms";
import type { ExplanationErrorCode, GenerateExplanation } from "./explanation";
import { generateExplanation } from "./mockLlmAdapter";

afterEach(cleanup);

const heading = () => screen.getByRole("heading", { level: 2, name: /^Decision/ }).textContent;
const verdict = () => (screen.queryByText("Available") ? "Available" : screen.queryByText("Unavailable") ? "Unavailable" : null);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("UI integration: App", () => {
  it("changing the room refreshes the decision (F5)", () => {
    render(<App />);
    // 10:30-11:30 overlaps "Python workshop" (10:00-11:00) in Aurora Lab 101.
    type("Start", "10:30");
    type("End", "11:30");
    expect(heading()).toBe("Decision for Aurora Lab 101");
    expect(verdict()).toBe("Unavailable");
    expect(screen.getByText('Overlaps "Python workshop" (10:00-11:00).')).toBeTruthy();

    fireEvent.click(radio(/Hall B-204/));
    expect(heading()).toBe("Decision for Hall B-204");
    expect(verdict()).toBe("Available");
  });

  it("filters hide the blocked room and auto-select the first match when the chosen room drops out (F3, F5)", () => {
    render(<App />);
    expect(screen.queryByRole("radio", { name: /Studio C-012/ })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(ROOMS.filter((r) => !r.blocked).length);

    fireEvent.click(radio(/Seminar D-305/));
    expect(heading()).toBe("Decision for Seminar D-305");

    type("People", "13"); // Seminar D-305 holds 12
    expect(screen.queryByRole("radio", { name: /Seminar D-305/ })).toBeNull();
    expect(heading()).toBe("Decision for Aurora Lab 101");
    expect(radio(/Aurora Lab 101/).checked).toBe(true);
  });

  it("shows the empty state when nothing matches, and recovers when the filter is relaxed (F4)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Computers" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Video conferencing" }));
    expect(screen.getByText("No matching rooms")).toBeTruthy();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(heading()).toBe("Decision");
    expect(verdict()).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Video conferencing" }));
    expect(screen.queryByText("No matching rooms")).toBeNull();
    expect(heading()).toBe("Decision for Aurora Lab 101");
  });

  it("invalid People input shows a field error without crashing", () => {
    render(<App />);
    type("People", "0");
    expect(screen.getByText("Enter the number of people as a whole number of at least 1.")).toBeTruthy();
    expect(verdict()).toBe("Available");
  });

  it("shows the back-to-back note only for bookings that touch the request (AC4)", () => {
    render(<App />);
    // Default 11:00-12:00 in Aurora Lab 101 touches "Python workshop" (10:00-11:00).
    expect(verdict()).toBe("Available");
    expect(screen.getByText(/Back-to-back with "Python workshop" \(10:00-11:00\)/)).toBeTruthy();

    type("Start", "10:59"); // one minute of overlap: Unavailable, so no back-to-back note
    expect(verdict()).toBe("Unavailable");
    expect(screen.queryByText(/Back-to-back/)).toBeNull();

    type("Start", "11:01"); // one minute gap: Available, but no longer touching
    expect(verdict()).toBe("Available");
    expect(screen.queryByText(/Back-to-back/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Practice #11: optional "Explain availability" (mock adapter injected through the `explain` prop).
// The deterministic decision card is the source of truth: it must read the same before and after.
// ---------------------------------------------------------------------------------------------
describe("UI: Explain availability (Practice #11)", () => {
  // The real mock adapter without its 300 ms wait; `failWith` simulates each failure mode.
  const mock =
    (failWith?: ExplanationErrorCode, timeoutMs?: number): GenerateExplanation =>
    (context, options) =>
      generateExplanation(context, { ...options, delayMs: 0, failWith, timeoutMs });

  const explainButton = () => screen.getByRole("button", { name: "Explain availability" }) as HTMLButtonElement;
  const tryAgainButton = () => screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
  const badge = () => screen.queryByText("Mock Explanation");

  /** Text of the decision card (verdict, details, back-to-back note) WITHOUT the explanation block. */
  const decisionText = () => {
    const card = screen
      .getByText(/^(Available|Unavailable)$/)
      .closest('[role="status"]')!
      .cloneNode(true) as HTMLElement;
    card.querySelector("[aria-busy]")?.remove();
    return card.textContent;
  };

  const overlapRequest = () => {
    type("Start", "10:30"); // 10:30-11:30 overlaps "Python workshop" in Aurora Lab 101
    type("End", "11:30");
  };

  it("shows the explanation text and the Mock Explanation label after clicking (valid request)", async () => {
    render(<App explain={mock()} />);
    expect(badge()).toBeNull(); // nothing is generated until the user asks
    const before = decisionText();

    fireEvent.click(explainButton());

    expect(await screen.findByText("Mock Explanation")).toBeTruthy();
    expect(screen.getByText(/Good news: Aurora Lab 101 is free from 11:00 to 12:00 \(60 minutes\)\./)).toBeTruthy();
    expect(screen.getByText(/not a booking confirmation/)).toBeTruthy();
    expect(verdict()).toBe("Available");
    expect(decisionText()).toBe(before);
  });

  it("explains an unavailable request without changing the decision", async () => {
    render(<App explain={mock()} />);
    overlapRequest();
    expect(verdict()).toBe("Unavailable");
    const before = decisionText();

    fireEvent.click(explainButton());

    expect(await screen.findByText(/Sorry, Aurora Lab 101 is not available from 10:30 to 11:30\./)).toBeTruthy();
    expect(screen.getByText(/It overlaps "Python workshop" \(10:00-11:00\)\./)).toBeTruthy();
    expect(verdict()).toBe("Unavailable");
    expect(decisionText()).toBe(before);
  });

  it("API error: shows the error message and Try again, and keeps the decision card unchanged", async () => {
    render(<App explain={mock("API_ERROR")} />);
    const before = decisionText();

    fireEvent.click(explainButton());

    expect(await screen.findByText(/The explanation is unavailable right now/)).toBeTruthy();
    expect(tryAgainButton().disabled).toBe(false);
    expect(badge()).toBeNull();
    expect(verdict()).toBe("Available");
    expect(decisionText()).toBe(before);
  });

  it("Try again can succeed after an error and clears the error message", async () => {
    const explain = vi
      .fn<GenerateExplanation>()
      .mockRejectedValueOnce(new Error("network down")) // not an ExplanationError: treated as API_ERROR
      .mockImplementation(mock());
    render(<App explain={explain} />);

    fireEvent.click(explainButton());
    expect(await screen.findByText(/The explanation is unavailable right now/)).toBeTruthy();

    fireEvent.click(tryAgainButton());
    expect(await screen.findByText("Mock Explanation")).toBeTruthy();
    expect(screen.queryByText(/The explanation is unavailable right now/)).toBeNull();
    expect(explain).toHaveBeenCalledTimes(2);
  });

  it("timeout: shows the timeout message and keeps the decision card unchanged", async () => {
    render(<App explain={mock("TIMEOUT", 10)} />);
    const before = decisionText();

    fireEvent.click(explainButton());

    expect(await screen.findByText(/The explanation took too long/)).toBeTruthy();
    expect(tryAgainButton()).toBeTruthy();
    expect(badge()).toBeNull();
    expect(decisionText()).toBe(before);
  });

  it("an adapter that never answers ends in a timeout message instead of loading forever (F4)", async () => {
    let seenSignal: AbortSignal | undefined;
    let finish: (text: string) => void = () => {};
    const hanging = vi.fn<GenerateExplanation>((_context, options) => {
      seenSignal = options?.signal;
      return new Promise<string>((resolve) => (finish = resolve));
    });
    render(<App explain={hanging} explainTimeoutMs={30} />);
    const before = decisionText();

    fireEvent.click(explainButton());
    expect(screen.getByRole("button", { name: "Explaining…" })).toBeTruthy();

    expect(await screen.findByText(/The explanation took too long/)).toBeTruthy();
    expect(tryAgainButton().disabled).toBe(false); // not stuck: the user can retry
    expect(seenSignal?.aborted).toBe(true); // the adapter was told to stop
    expect(decisionText()).toBe(before);

    await act(async () => finish("Good news: Aurora Lab 101 is free from 11:00 to 12:00.")); // a late answer
    expect(badge()).toBeNull();
    expect(screen.getByText(/The explanation took too long/)).toBeTruthy();
  });

  it("empty output and a contradicting text are rejected with a message, never shown", async () => {
    const empty = render(<App explain={mock("EMPTY_OUTPUT")} />);
    fireEvent.click(explainButton());
    expect(await screen.findByText(/No explanation was produced/)).toBeTruthy();
    empty.unmount();

    // The checker says Unavailable; this "model" claims the room is free.
    const lying: GenerateExplanation = async () => "Good news: Aurora Lab 101 is free from 10:30 to 11:30.";
    render(<App explain={lying} />);
    overlapRequest();
    const before = decisionText();
    fireEvent.click(explainButton());
    expect(await screen.findByText(/did not match the decision/)).toBeTruthy();
    expect(badge()).toBeNull();
    expect(screen.queryByText(/Good news/)).toBeNull();
    expect(verdict()).toBe("Unavailable");
    expect(decisionText()).toBe(before);
  });

  it("changing the room hides the previous explanation (stale state)", async () => {
    render(<App explain={mock()} />);
    fireEvent.click(explainButton());
    expect(await screen.findByText("Mock Explanation")).toBeTruthy();

    fireEvent.click(radio(/Hall B-204/));

    expect(heading()).toBe("Decision for Hall B-204");
    expect(badge()).toBeNull();
    expect(screen.queryByText(/Aurora Lab 101 is free/)).toBeNull();
    expect(explainButton().disabled).toBe(false); // can explain the new room
  });

  it("changing a time also hides the previous explanation", async () => {
    render(<App explain={mock()} />);
    fireEvent.click(explainButton());
    expect(await screen.findByText("Mock Explanation")).toBeTruthy();

    type("End", "11:30");

    expect(badge()).toBeNull();
  });

  it("is disabled while the decision is null (invalid input) and never calls the adapter", () => {
    const explain = vi.fn<GenerateExplanation>();
    render(<App explain={explain} />);

    type("Start", "abc");
    expect(screen.getByText("Waiting for valid times")).toBeTruthy();
    expect(explainButton().disabled).toBe(true);
    fireEvent.click(explainButton());
    expect(explain).not.toHaveBeenCalled();

    type("Start", "11:00"); // valid again
    expect(explainButton().disabled).toBe(false);
  });

  it("shows a loading state while waiting and passes the checker's verdict to the adapter", async () => {
    let finish: (text: string) => void = () => {};
    const explain = vi.fn<GenerateExplanation>(() => new Promise<string>((resolve) => (finish = resolve)));
    render(<App explain={explain} />);

    fireEvent.click(explainButton());

    const loading = screen.getByRole("button", { name: "Explaining…" }) as HTMLButtonElement;
    expect(loading.disabled).toBe(true);
    expect(explain).toHaveBeenCalledTimes(1);
    expect(explain.mock.calls[0][0].result).toEqual({ available: true, reasonCodes: [] });
    expect(verdict()).toBe("Available"); // the decision is visible while the explanation loads

    await act(async () => finish("Good news: Aurora Lab 101 is free from 11:00 to 12:00."));
    expect(await screen.findByText("Mock Explanation")).toBeTruthy();
  });

  it("a late answer for an old request is not shown after the request changed", async () => {
    let finish: (text: string) => void = () => {};
    const explain = vi.fn<GenerateExplanation>(() => new Promise<string>((resolve) => (finish = resolve)));
    render(<App explain={explain} />);

    fireEvent.click(explainButton());
    fireEvent.click(radio(/Hall B-204/)); // request changes while the answer is pending
    await act(async () => finish("Good news: Aurora Lab 101 is free from 11:00 to 12:00."));

    expect(badge()).toBeNull();
    expect(screen.queryByText(/Aurora Lab 101 is free/)).toBeNull();
    expect(explainButton().disabled).toBe(false);
  });
});
