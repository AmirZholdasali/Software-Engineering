// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { ROOMS } from "./rooms";

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
});
