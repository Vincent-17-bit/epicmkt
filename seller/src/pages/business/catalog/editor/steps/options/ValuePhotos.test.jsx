import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addAxis, addValue, emptyOptionsForm } from "@epicmkt/shared";
import ValuePhotos from "./ValuePhotos.jsx";

const build = () => {
  let o = addAxis(emptyOptionsForm(), { label: "Size", display: "button" });
  for (const v of ["400g", "700g"]) o = addValue(o, "size", v).options;
  return o;
};
const file = () => new File([new Uint8Array([1, 2, 3])], "loaf.png", { type: "image/png" });

describe("a photo for every option value", () => {
  it("uploads a photo for one size, before the item is saved, and marks that size", async () => {
    const options = build();
    const set = vi.fn();
    const addFiles = vi.fn().mockResolvedValue(["m1"]);
    render(<ValuePhotos options={options} axis={options.axes[0]} set={set} media={{ tiles: [], manager: { addFiles } }} announce={() => {}} />);
    expect(screen.getByText("0 of 2 have a photo")).toBeInTheDocument();
    const input = document.getElementById(document.querySelectorAll('input[type="file"]')[1].id);
    await userEvent.setup({ pointerEventsCheck: 0 }).upload(input, file());
    expect(addFiles).toHaveBeenCalledTimes(1);
    const next = set.mock.calls[0][0];
    expect(next.axes[0].values[1]).toMatchObject({ id: "700g", photoTile: "m1" });
    expect(next.axes[0].values[0].photoTile).toBeUndefined();
  });

  it("shows the photo a size already has and can remove or reuse photos", async () => {
    let options = build();
    options = { ...options, axes: [{ ...options.axes[0], values: options.axes[0].values.map((v) => (v.id === "400g" ? { ...v, mediaId: "id1" } : v)) }] };
    const set = vi.fn();
    const tiles = [{ key: "a", id: "id1", kind: "image", status: "saved", url: "u1" }, { key: "b", id: "id2", kind: "image", status: "saved", url: "u2" }];
    render(<ValuePhotos options={options} axis={options.axes[0]} set={set} media={{ tiles, manager: { addFiles: vi.fn() } }} announce={() => {}} />);
    expect(screen.getByRole("img", { name: "400g photo" })).toHaveAttribute("src", "u1");
    expect(screen.getByText("1 of 2 have a photo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Remove photo from 400g/ }));
    expect(set.mock.calls[0][0].axes[0].values[0].mediaId).toBeUndefined();
    await userEvent.click(screen.getByRole("button", { name: /Reuse an item photo for 700g/ }));
    const list = screen.getByRole("list", { name: /Item photos to use for 700g/ });
    await userEvent.click(within(list).getByRole("button", { name: "Photo 2" }));
    expect(set.mock.calls[1][0].axes[0].values[1].mediaId).toBe("id2");
  });
});
