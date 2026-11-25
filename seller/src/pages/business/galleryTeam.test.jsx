import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../api/index.js";
import { signedInApp, M, file, JPG } from "../../test/utils.jsx";

const photo = (name = "a.jpg") => file(name, "image/jpeg", JPG);
const upload = async (user, files) => user.upload(await screen.findByLabelText("Choose photos"), files);

describe("seller gallery", () => {
  it("starts empty, adds photos, counts them against the plan and stops at the limit", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/gallery");
    expect(await screen.findByText("No gallery photos yet")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-usage")).toHaveTextContent("0 of 5 gallery photos used");
    await upload(user, [photo("1.jpg"), photo("2.jpg"), photo("3.jpg"), photo("4.jpg"), photo("5.jpg"), photo("6.jpg")]);
    await waitFor(() => expect(screen.getByTestId("gallery-usage")).toHaveTextContent("5 of 5 gallery photos used"));
    expect(await screen.findByText(/used all 5 gallery photos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add photos" })).toBeDisabled();
    expect(await api.listGallery()).toHaveLength(5);
  });

  it("captions, reorders and deletes with Undo", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/gallery", async () => { await api.addGalleryPhoto({ file: photo() }); await api.addGalleryPhoto({ file: photo() }); });
    const first = (await screen.findAllByLabelText("Caption"))[0];
    await user.type(first, "Fresh fade");
    await user.tab();
    await waitFor(async () => expect((await api.listGallery())[0].caption).toBe("Fresh fade"));
    const before = (await api.listGallery()).map((p) => p.id);
    await user.click((await screen.findAllByRole("button", { name: "Move later" }))[0]);
    await waitFor(async () => expect((await api.listGallery()).map((p) => p.id)).toEqual([before[1], before[0]]));
    await user.click((await screen.findAllByRole("button", { name: "Delete" }))[0]);
    expect(await screen.findByText("Photo deleted")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Caption")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getAllByLabelText("Caption")).toHaveLength(2));
    expect(await api.listGallery()).toHaveLength(2);
  });

  it("removes a photo for good once the Undo time is over", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await signedInApp("/business/gallery", async () => { await api.addGalleryPhoto({ file: photo() }); });
      await user.click(await screen.findByRole("button", { name: "Delete" }));
      await screen.findByText("Photo deleted");
      await vi.advanceTimersByTimeAsync(8500);
      await waitFor(() => expect(screen.queryByText("Photo deleted")).not.toBeInTheDocument());
      expect(M.state.gallery).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers before and after pairs to barbershops and salons only, and keeps the two together", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/gallery");
    await screen.findByText("No gallery photos yet");
    expect(screen.queryByRole("button", { name: "Add before and after" })).not.toBeInTheDocument();
    await signedInApp("/business/gallery", async () => M.setBusiness({ categoryId: "barbershop" }));
    await user.click(await screen.findByRole("button", { name: "Add before and after" }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(within(dialog).getByLabelText("Before photo"), photo("b.jpg"));
    await user.upload(within(dialog).getByLabelText("After photo"), photo("a.jpg"));
    await user.click(within(dialog).getByRole("button", { name: "Add pair" }));
    expect(await screen.findByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Caption")).toHaveLength(1);
    expect(await api.listGallery()).toHaveLength(2);
  });

  it("shows hidden photos with the reason and does not count them", async () => {
    await signedInApp("/business/gallery", async () => {
      await api.addGalleryPhoto({ file: photo() });
      Object.assign(M.state.gallery[0], { adminState: "hidden", adminReason: "Not your shop" });
    });
    expect(await screen.findByText(/Hidden by EpicMKT: Not your shop/)).toBeInTheDocument();
    expect(screen.getByTestId("gallery-usage")).toHaveTextContent("0 of 5");
  });

  it("is closed to a suspended account, in the app and in the API", async () => {
    await signedInApp("/business/gallery", async () => { await api.addGalleryPhoto({ file: photo() }); M.setBusiness({ status: "suspended" }); });
    expect(await screen.findByTestId("suspended-banner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add photos" })).not.toBeInTheDocument();
    await expect(api.deleteGalleryPhotos(["x"])).rejects.toMatchObject({ code: "account_suspended" });
  });
});

describe("seller team and schedule", () => {
  it("adds, edits and deletes a team member", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/team");
    expect(await screen.findByText("No team members yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add team member" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "A");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Name needs 2 to 80 characters")).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Amina Otieno");
    await user.type(within(dialog).getByLabelText(/Specialties/), "fade, beard, fade");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Amina Otieno" })).toBeInTheDocument();
    expect(screen.getByText("fade")).toBeInTheDocument();
    expect(screen.getByText("beard")).toBeInTheDocument();
    expect((await api.listStaff())[0].specialties).toEqual(["fade", "beard"]);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: /Yes, delete Amina/ }));
    expect(await screen.findByText("No team members yet")).toBeInTheDocument();
  });

  it("saves social links from handles and pasted links, shows what each will open, and shows icons on the card", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/team");
    await user.click(await screen.findByRole("button", { name: "Add team member" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Amina Otieno");
    await user.type(within(dialog).getByLabelText("X"), "@amina_cuts");
    expect(await within(dialog).findByText(/Opens x\.com\/amina_cuts/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Test X link" })).toHaveAttribute("href", "https://x.com/amina_cuts");
    await user.type(within(dialog).getByLabelText("Instagram"), "https://www.instagram.com/amina.cuts/?igsh=abc123");
    expect(within(dialog).getByRole("link", { name: "Test Instagram link" })).toHaveAttribute("href", "https://www.instagram.com/amina.cuts/");
    await user.type(within(dialog).getByLabelText("LinkedIn"), "amina-otieno");
    await user.type(within(dialog).getByLabelText("Reddit"), "u/amina_cuts");
    await user.type(within(dialog).getByLabelText("Facebook"), "facebook.com/amina.barber");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Amina Otieno" })).toBeInTheDocument();
    expect((await api.listStaff())[0].socials).toEqual({
      x: "https://x.com/amina_cuts",
      instagram: "https://www.instagram.com/amina.cuts/",
      linkedin: "https://www.linkedin.com/in/amina-otieno",
      reddit: "https://www.reddit.com/user/amina_cuts",
      facebook: "https://www.facebook.com/amina.barber"
    });
    const links = within(screen.getByRole("list", { name: "Amina Otieno on social media" })).getAllByRole("link");
    expect(links).toHaveLength(5);
    // Editing starts from the saved links, and clearing one removes it.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const again = await screen.findByRole("dialog");
    expect(within(again).getByLabelText("X")).toHaveValue("x.com/amina_cuts");
    await user.clear(within(again).getByLabelText("X"));
    await user.click(within(again).getByRole("button", { name: "Save" }));
    await waitFor(async () => expect(Object.keys((await api.listStaff())[0].socials)).not.toContain("x"));
  });

  it("explains a link that is not on the right network and does not save until it is fixed", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/team");
    await user.click(await screen.findByRole("button", { name: "Add team member" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Amina Otieno");
    await user.type(within(dialog).getByLabelText("Instagram"), "https://twitter.com/amina_cuts");
    expect(await within(dialog).findByText(/not on instagram\.com/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Facebook"), "javascript:alert(1)");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findAllByRole("alert")).length).toBeGreaterThanOrEqual(2);
    expect(await api.listStaff()).toHaveLength(0);
    await user.clear(within(dialog).getByLabelText("Instagram"));
    await user.clear(within(dialog).getByLabelText("Facebook"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Amina Otieno" })).toBeInTheDocument();
  });

  it("the API refuses links that are not clean and keeps only canonical ones", async () => {
    await signedInApp("/business/team");
    await expect(api.saveStaff(null, { name: "Amina", socials: { x: "https://evil.example/amina" } })).rejects.toMatchObject({ code: "invalid_staff" });
    await api.saveStaff(null, { name: "Amina", socials: { x: "https://twitter.com/amina_cuts?s=20", reddit: "" } });
    expect((await api.listStaff())[0].socials).toEqual({ x: "https://x.com/amina_cuts" });
  });

  it("links services only on Premium", async () => {
    await signedInApp("/business/team");
    await expect(api.saveStaff(null, { name: "Amina", serviceIds: ["it-fade"] })).rejects.toMatchObject({ code: "premium_only" });
    M.setBusiness({ planKey: "premium" });
    await api.saveStaff(null, { name: "Amina", serviceIds: ["it-fade"] });
    expect((await api.listStaff())[0].serviceIds).toEqual(["it-fade"]);
    await expect(api.saveStaff(null, { name: "Bob", serviceIds: ["nope"] })).rejects.toMatchObject({ code: "item_not_owned" });
  });

  it("has no timetable tab for a shop that is not a salon or gym", async () => {
    await signedInApp("/business/team");
    await screen.findByText("No team members yet");
    expect(screen.queryByRole("tab", { name: "Timetable" })).not.toBeInTheDocument();
  });

  it("builds a weekly timetable and refuses a trainer double booking", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/team", async () => {
      M.setBusiness({ planKey: "premium", categoryId: "gym-fitness" });
      await api.saveStaff(null, { name: "Coach Ken" });
    });
    await user.click(await screen.findByRole("tab", { name: "Timetable" }));
    await user.click(screen.getByRole("button", { name: "Add class" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Class name"), "Spin");
    await user.selectOptions(within(dialog).getByLabelText("Trainer (optional)"), "Coach Ken");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("09:00 to 10:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add class" }));
    const again = await screen.findByRole("dialog");
    await user.type(within(again).getByLabelText("Class name"), "Yoga");
    await user.selectOptions(within(again).getByLabelText("Trainer (optional)"), "Coach Ken");
    await user.click(within(again).getByRole("button", { name: "Save" }));
    expect(await within(again).findByText("This trainer already has a class at this time")).toBeInTheDocument();
    expect(await api.listTimetable()).toHaveLength(1);
  });

  it("shows the timetable as Premium only", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/team", async () => M.setBusiness({ categoryId: "salon-beauty" }));
    await user.click(await screen.findByRole("tab", { name: "Timetable" }));
    expect(screen.getByText(/timetable is a Premium feature/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add class" })).not.toBeInTheDocument();
  });
});
