// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary.jsx";
const Boom = () => { throw new Error("kaboom"); };
afterEach(cleanup);
describe("ErrorBoundary", () => {
  it("renders children when nothing fails", () => { render(<ErrorBoundary><p>fine</p></ErrorBoundary>); expect(screen.getByText("fine")).toBeTruthy(); });
  it("shows a plain message instead of a blank page, with the default log label", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    expect(spy.mock.calls.some((c) => c[0] === "EpicMKT render error")).toBe(true); spy.mockRestore();
  });
  it("uses the app's own log label (seller keeps its wording)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary logLabel="Seller portal render error"><Boom /></ErrorBoundary>);
    expect(spy.mock.calls.some((c) => c[0] === "Seller portal render error")).toBe(true); spy.mockRestore();
  });
  it("Reload button reloads the page", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {}); const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true });
    render(<ErrorBoundary><Boom /></ErrorBoundary>); fireEvent.click(screen.getByText("Reload")); expect(reload).toHaveBeenCalled(); spy.mockRestore();
  });
});
