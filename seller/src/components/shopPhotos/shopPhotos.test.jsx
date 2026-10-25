import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signedInApp } from "../../test/utils.jsx";
import * as api from "../../api/index.js";
import * as canvas from "../../lib/photoCanvas.js";

// jsdom cannot decode or draw pictures, so reading a file and drawing the crop are stood in for. The geometry itself is
// covered in lib/imageCrop.test.js; here the point is the flow a seller goes through.
vi.mock("../../lib/photoCanvas.js", async (orig) => ({
  ...(await orig()),
  loadPhoto: vi.fn(),
  renderCrop: vi.fn(),
  hasTouchCamera: vi.fn(),
  releasePhoto: vi.fn(),
}));

const file = () => new File(["x"], "shop.jpg", { type: "image/jpeg" });
let n = 0;

async function openAccount() {
  const view = await signedInApp("/business/account");
  await screen.findByRole("heading", { name: "Shop photos" });
  return view;
}

const pickFile = (testId = "photo-input") => fireEvent.change(screen.getByTestId(testId), { target: { files: [file()] } });

beforeEach(() => {
  n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test-${++n}`);
  URL.revokeObjectURL = vi.fn();
  canvas.hasTouchCamera.mockReturnValue(false);
  canvas.loadPhoto.mockResolvedValue({ img: {}, url: "blob:photo", width: 3000, height: 2000 });
  canvas.renderCrop.mockResolvedValue(new Blob(["crop"], { type: "image/webp" }));
});

describe("shop photos card", () => {
  it("starts with initials and an empty cover, and no Remove choice", async () => {
    const user = userEvent.setup();
    await openAccount();
    expect(screen.getByText("Add a cover photo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    const sheet = await screen.findByRole("button", { name: "Photo" });
    expect(sheet).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("offers Camera only on a device with a camera app, and Photo everywhere", async () => {
    const user = userEvent.setup();
    await openAccount();
    await user.click(screen.getByRole("button", { name: "Change shop logo" }));
    await screen.findByRole("button", { name: "Photo" });
    expect(screen.queryByRole("button", { name: "Camera" })).not.toBeInTheDocument();
  });

  it("Camera opens the camera input with the rear camera hint, Photo opens the gallery", async () => {
    canvas.hasTouchCamera.mockReturnValue(true);
    const user = userEvent.setup();
    await openAccount();
    const camera = screen.getByTestId("camera-input");
    const gallery = screen.getByTestId("photo-input");
    const camClick = vi.spyOn(camera, "click");
    const galClick = vi.spyOn(gallery, "click");

    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Camera" }));
    expect(camClick).toHaveBeenCalledTimes(1);
    expect(galClick).not.toHaveBeenCalled();
    expect(camera).toHaveAttribute("accept", "image/*");

    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Photo" }));
    expect(galClick).toHaveBeenCalledTimes(1);
    expect(gallery.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp");
  });

  it("frames a picked cover in the cropper and uploads only the cropped result", async () => {
    const user = userEvent.setup();
    const up = vi.spyOn(api, "uploadShopImage");
    await openAccount();
    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Photo" }));
    pickFile();

    const dialog = await screen.findByRole("dialog", { name: "Adjust your cover photo" });
    expect(canvas.loadPhoto).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ kind: "cover", ratio: 3 }));
    expect(within(dialog).getByTestId("crop-frame").style.aspectRatio).toBe("3 / 1");
    expect(within(dialog).getByText("Shop cards show this part")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(up).toHaveBeenCalledTimes(1));
    expect(up.mock.calls[0][0]).toBe("cover");
    expect(up.mock.calls[0][1].type).toBe("image/webp");
    // the crop rectangle handed to the canvas keeps the 3:1 shape
    const rect = canvas.renderCrop.mock.calls[0][1];
    expect(rect.sw / rect.sh).toBeCloseTo(3, 6);

    expect(await screen.findByText("Your cover photo is updated.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Adjust your cover photo" })).not.toBeInTheDocument());
    expect(screen.queryByText("Add a cover photo")).not.toBeInTheDocument();
    expect(canvas.releasePhoto).toHaveBeenCalled();
    up.mockRestore();
  });

  it("the logo is cropped square and shown in the header once saved", async () => {
    const user = userEvent.setup();
    await openAccount();
    await user.click(screen.getByRole("button", { name: "Change shop logo" }));
    await user.click(await screen.findByRole("button", { name: "Photo" }));
    pickFile();
    const dialog = await screen.findByRole("dialog", { name: "Adjust your logo" });
    expect(within(dialog).getByTestId("crop-frame").style.aspectRatio).toBe("1 / 1");
    expect(within(dialog).queryByText("Shop cards show this part")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Use photo" }));
    expect(await screen.findByText("Your logo is updated.")).toBeInTheDocument();
    const header = screen.getByTestId("shop-name").closest("a");
    await waitFor(() => expect(header.querySelector("img")).not.toBeNull());
    expect(header.querySelector("img").getAttribute("src")).toMatch(/^blob:test-/);
  });

  it("zoom controls and the keyboard move the crop, and zoom stays within limits", async () => {
    const user = userEvent.setup();
    await openAccount();
    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Photo" }));
    pickFile();
    const dialog = await screen.findByRole("dialog", { name: "Adjust your cover photo" });
    const zoom = within(dialog).getByRole("slider", { name: "Zoom" });
    expect(zoom).toHaveValue("1");
    expect(within(dialog).getByRole("button", { name: "Zoom out" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Zoom in" }));
    expect(Number(zoom.value)).toBeCloseTo(1.25, 2);
    fireEvent.change(zoom, { target: { value: "9" } });
    expect(Number(zoom.value)).toBeLessThanOrEqual(4);

    const frame = within(dialog).getByTestId("crop-frame");
    const img = frame.querySelector("img");
    const before = img.style.transform;
    fireEvent.keyDown(frame, { key: "ArrowLeft" });
    expect(img.style.transform).not.toBe(before);
  });

  it("explains why a photo was refused and stays out of the cropper", async () => {
    const user = userEvent.setup();
    canvas.loadPhoto.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "cover_too_small" }));
    await openAccount();
    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Photo" }));
    pickFile();
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 600 pixels wide");
    expect(screen.queryByRole("dialog", { name: /Adjust/ })).not.toBeInTheDocument();
  });

  it("keeps the cropper open with a message when the upload fails, so the seller can try again", async () => {
    const user = userEvent.setup();
    const up = vi.spyOn(api, "uploadShopImage").mockRejectedValueOnce(Object.assign(new Error("x"), { code: "file_not_uploaded" }));
    await openAccount();
    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Photo" }));
    pickFile();
    const dialog = await screen.findByRole("dialog", { name: "Adjust your cover photo" });
    await user.click(within(dialog).getByRole("button", { name: "Use photo" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("upload did not finish");
    expect(within(dialog).getByRole("button", { name: "Use photo" })).toBeEnabled();
    up.mockRestore();
  });

  it("cancelling the cropper changes nothing", async () => {
    const user = userEvent.setup();
    const up = vi.spyOn(api, "uploadShopImage");
    await openAccount();
    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Photo" }));
    pickFile();
    const dialog = await screen.findByRole("dialog", { name: "Adjust your cover photo" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Adjust/ })).not.toBeInTheDocument());
    expect(up).not.toHaveBeenCalled();
    expect(screen.getByText("Add a cover photo")).toBeInTheDocument();
    up.mockRestore();
  });

  it("removes a picture only after a second confirmation", async () => {
    const user = userEvent.setup();
    const rm = vi.spyOn(api, "removeShopImage");
    await openAccount();
    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Photo" }));
    pickFile();
    await user.click(await screen.findByRole("button", { name: "Use photo" }));
    await screen.findByText("Your cover photo is updated.");

    await user.click(screen.getByRole("button", { name: "Change cover photo" }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(rm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(rm).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Remove cover photo" }));
    await waitFor(() => expect(rm).toHaveBeenCalledWith("cover"));
    expect(await screen.findByText("Your cover photo was removed.")).toBeInTheDocument();
    expect(screen.getByText("Add a cover photo")).toBeInTheDocument();
    rm.mockRestore();
  });
});

describe("shop photos api (mock)", () => {
  it("rejects an unknown picture kind and a non-image file", async () => {
    await signedInApp("/business/account");
    await expect(api.uploadShopImage("banner", new Blob(["x"], { type: "image/webp" }))).rejects.toMatchObject({ code: "invalid_kind" });
    await expect(api.uploadShopImage("logo", new Blob(["x"], { type: "text/plain" }))).rejects.toMatchObject({ code: "unsupported_type" });
  });
});
