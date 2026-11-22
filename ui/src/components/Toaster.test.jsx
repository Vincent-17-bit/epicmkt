import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Toaster from "./Toaster.jsx";

describe("Toaster", () => {
  it("shows just the message and Dismiss for an old-style toast", () => {
    render(<Toaster toasts={[{ id: 1, message: "Hi" }]} onDismiss={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("runs the action and dismisses the toast", () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(<Toaster toasts={[{ id: 7, message: "Removed", action: { label: "Undo", onClick } }]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});
