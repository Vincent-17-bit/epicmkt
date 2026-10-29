import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { errorText } from "../lib/errors.js";

const rpc = vi.fn();
const invoke = vi.fn();
const uploadToSignedUrl = vi.fn();
vi.mock("./client.js", () => ({
  supabase: { rpc: (...a) => rpc(...a), from: vi.fn(), functions: { invoke: (...a) => invoke(...a) }, storage: { from: () => ({ uploadToSignedUrl: (...a) => uploadToSignedUrl(...a), remove: vi.fn() }) } },
}));

const live = await import("./live.js");
const mock = await import("./mock.js");

const ITEM = "item-1";
const PATH = "biz/item-1/abc.mp4";
const video = (size = 1000, type = "video/mp4") => ({ type, size, name: "clip.mp4" });
const fail = (payload, status = 400) => ({ data: null, error: { context: { status, json: async () => payload } } });
const sign = () => ({ data: { path: PATH, token: "tok", kind: "video", expiresIn: 7200 }, error: null });

let errors;
beforeEach(() => {
  rpc.mockReset(); invoke.mockReset(); uploadToSignedUrl.mockReset();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

describe("live uploadItemVideo: every failure is a seller-readable message, never the generic connection text", () => {
  it("signs, uploads to the bucket, finalizes and returns the path", async () => {
    invoke.mockResolvedValueOnce(sign()).mockResolvedValueOnce({ data: { id: "m1", kind: "video" }, error: null });
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    expect(await live.uploadItemVideo(ITEM, video())).toEqual({ path: PATH });
    expect(invoke).toHaveBeenNthCalledWith(1, "seller-media-sign", { body: { purpose: "item_video", itemId: ITEM, type: "mp4" } });
    expect(uploadToSignedUrl).toHaveBeenCalledWith(PATH, "tok", expect.anything(), { contentType: "video/mp4" });
    expect(invoke).toHaveBeenNthCalledWith(2, "seller-media-finalize", { body: { itemId: ITEM, path: PATH, cloudinary: undefined } });
  });

  it("refuses the wrong type and size before contacting the server", async () => {
    await expect(live.uploadItemVideo(ITEM, video(1000, "video/quicktime"))).rejects.toMatchObject({ code: "video_unsupported" });
    await expect(live.uploadItemVideo(ITEM, video(25 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: "video_too_large" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ["limit_reached", "video_limit"],
    ["server_error", "video_unavailable"],
    ["bad_request", "video_unavailable"],
    ["request_failed", "video_unavailable"],
    ["forbidden", "video_unavailable"],
  ])("a sign failure %s becomes %s", async (code, expected) => {
    invoke.mockResolvedValueOnce(fail({ error: code }, 500));
    const err = await live.uploadItemVideo(ITEM, video()).catch((e) => e);
    expect(err.code).toBe(expected);
    expect(errorText(err)).not.toMatch(/check your connection/i);
  });

  it("an unreachable function (no JSON body) says video upload is unavailable, not 'check your connection'", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: new TypeError("Failed to fetch") } });
    const err = await live.uploadItemVideo(ITEM, video()).catch((e) => e);
    expect(err.code).toBe("video_unavailable");
    expect(errorText(err)).toMatch(/not working right now/);
  });

  it("an item that is not saved yet stays item_not_found", async () => {
    invoke.mockResolvedValueOnce(fail({ error: "item_not_found" }, 404));
    await expect(live.uploadItemVideo(ITEM, video())).rejects.toMatchObject({ code: "item_not_found" });
  });

  it("a sign answer with no ticket is reported, not a crash", async () => {
    invoke.mockResolvedValueOnce({ data: { path: PATH }, error: null });
    await expect(live.uploadItemVideo(ITEM, video())).rejects.toMatchObject({ code: "video_unavailable" });
  });

  it.each([
    [{ message: "The object exceeded the maximum allowed size", statusCode: "413" }, "video_too_large"],
    [{ message: "mime type video/mp4 is not supported" }, "video_unsupported"],
    [{ message: "jwt expired", statusCode: "401" }, "video_expired"],
    [{ message: "Failed to fetch" }, "video_not_uploaded"],
  ])("a bucket refusal %j becomes %s", async (storageError, expected) => {
    invoke.mockResolvedValueOnce(sign());
    uploadToSignedUrl.mockResolvedValue({ data: null, error: storageError });
    const err = await live.uploadItemVideo(ITEM, video()).catch((e) => e);
    expect(err.code).toBe(expected);
    expect(errorText(err)).toMatch(expected === "video_not_uploaded" ? /video did not upload/i : /./);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("a thrown network error from the bucket is video_not_uploaded", async () => {
    invoke.mockResolvedValueOnce(sign());
    uploadToSignedUrl.mockRejectedValue(new TypeError("NetworkError"));
    await expect(live.uploadItemVideo(ITEM, video())).rejects.toMatchObject({ code: "video_not_uploaded" });
  });

  it.each([
    ["unsupported_type", "video_unsupported"],
    ["too_large", "video_too_large"],
    ["too_long", "video_too_long"],
    ["unreadable", "video_unreadable"],
    ["too_big_dimensions", "video_too_big"],
    ["limit_reached", "video_limit"],
    ["upload_not_found", "video_expired"],
    ["file_not_found", "video_not_uploaded"],
    ["server_error", "video_unavailable"],
  ])("finalize says %s and the seller sees %s", async (code, expected) => {
    invoke.mockResolvedValueOnce(sign()).mockResolvedValueOnce(fail({ error: code }, 422));
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    const err = await live.uploadItemVideo(ITEM, video()).catch((e) => e);
    expect(err.code).toBe(expected);
    expect(errorText(err)).not.toMatch(/photo/i);
  });

  it("a finalize that already succeeded (the answer was lost) counts as success on retry", async () => {
    invoke.mockResolvedValueOnce(sign()).mockResolvedValueOnce(fail({ error: "already_attached" }, 409));
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    expect(await live.uploadItemVideo(ITEM, video())).toEqual({ path: PATH });
  });

  it("logs which step failed, so a support ticket can say where", async () => {
    invoke.mockResolvedValueOnce(fail({ error: "bad_request" }, 400));
    await live.uploadItemVideo(ITEM, video()).catch(() => {});
    expect(errors.mock.calls[0][0]).toMatch(/\[video upload\] sign failed/);
  });
});

describe("live listItemMedia, getItemMedia and reorderItemMedia", () => {
  const reply = {
    media: [{ id: "a", path: "x/1", kind: "video", sort: 0, duration: 12.5 }, { id: "b", path: "x/2", kind: "image", sort: 1, duration: null }],
    cover: "x/2",
    limits: { photos: { used: 1, max: 10 }, videos: { used: 1, max: 2 } },
  };

  it("returns [{path, kind, sort, duration?}] in the database's order", async () => {
    rpc.mockResolvedValue({ data: reply, error: null });
    expect(await live.listItemMedia(ITEM)).toEqual([{ path: "x/1", kind: "video", sort: 0, duration: 12.5 }, { path: "x/2", kind: "image", sort: 1 }]);
    expect(rpc).toHaveBeenCalledWith("seller_item_media", { p_item: ITEM });
  });

  it("exposes the plan limits, with null meaning no limit", async () => {
    rpc.mockResolvedValue({ data: { ...reply, limits: { photos: { used: 3, max: 10 }, videos: { used: 1, max: null } } }, error: null });
    expect(await live.getItemMediaLimits(ITEM)).toEqual({ photos: { used: 3, max: 10 }, videos: { used: 1, max: null } });
    expect((await live.getItemMedia(ITEM)).cover).toBe("x/2");
  });

  it("sends the whole order and returns what changed and the cover", async () => {
    rpc.mockResolvedValue({ data: { updated: 2, cover: "x/2" }, error: null });
    expect(await live.reorderItemMedia(ITEM, ["x/1", "x/2"])).toEqual({ updated: 2, cover: "x/2" });
    expect(rpc).toHaveBeenCalledWith("seller_reorder_item_media", { p_item: ITEM, p_paths: ["x/1", "x/2"] });
  });

  it.each(["path_not_found", "order_incomplete", "duplicate_path", "item_not_found", "no_items"])("surfaces %s with its own message", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } });
    const err = await live.reorderItemMedia(ITEM, ["x/1"]).catch((e) => e);
    expect(err.code).toBe(code);
    expect(errorText(err)).not.toMatch(/check your connection/i);
  });

  it("the old reorderItemPhotos still calls its function", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await live.reorderItemPhotos(ITEM, ["x/2"]);
    expect(rpc).toHaveBeenCalledWith("seller_reorder_item_photos", { p_item: ITEM, p_paths: ["x/2"] });
  });
});

describe("mock matches live for the media sequence", () => {
  const file = (type) => ({ type, size: 100 });
  it("keeps photos and videos in one sequence, derives the cover, and refuses bad orders like the database", async () => {
    mock.resetMock();
    await mock.login("es100001", "Demo-Passw0rd");
    const items = await mock.listItems?.();
    const id = (await mock.getCatalog()).items?.[0]?.id ?? items?.[0]?.id;
    expect(id).toBeTruthy();
    const before = await mock.getItemMedia(id);
    const v = (await mock.uploadItemVideo(id, file("video/mp4"))).path;
    const after = await mock.getItemMedia(id);
    expect(after.media.at(-1)).toMatchObject({ path: v, kind: "video", sort: after.media.length - 1 });
    expect(after.limits.videos.used).toBe(before.limits.videos.used + 1);
    expect(after.cover).toBe(before.cover);
    const paths = after.media.map((m) => m.path);
    const reordered = [v, ...paths.filter((p) => p !== v)];
    const r = await mock.reorderItemMedia(id, reordered);
    expect(r.cover).toBe(before.cover);
    expect((await mock.listItemMedia(id)).map((m) => m.path)).toEqual(reordered);
    await expect(mock.reorderItemMedia(id, paths.slice(1))).rejects.toMatchObject({ code: "order_incomplete" });
    await expect(mock.reorderItemMedia(id, [...paths, paths[0]])).rejects.toMatchObject({ code: "duplicate_path" });
    await expect(mock.reorderItemMedia(id, [...paths.slice(1), "nope"])).rejects.toMatchObject({ code: "path_not_found" });
    await expect(mock.reorderItemMedia("missing", [])).rejects.toMatchObject({ code: "item_not_found" });
  });
});
