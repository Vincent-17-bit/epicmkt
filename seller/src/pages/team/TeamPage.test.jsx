import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../../test/render.jsx";
import TeamPage from "./TeamPage.jsx";

vi.mock("../../lib/imagePipeline.js", () => ({
  IMAGE_ACCEPT: "image/*",
  imageErrorMessage: () => null,
  processImage: vi.fn(async () => ({ blob: new Blob(["x"]), width: 800, height: 600, previewUrl: "blob:x" })),
}));

const member = (n, extra = {}) => ({
  id: `s${n}`, business_id: "b-demo", name: `Member ${n}`, role: "Stylist", specialties: ["braids"], photo_path: null, photo_url: null,
  service_ids: [], sort: n, admin_status: null, admin_reason: null, removed_by_admin: false, hidden_by_admin: false, ...extra,
});

describe("team and schedule", () => {
  it("standard sees staff and a locked timetable with an upgrade prompt", async () => {
    const user = userEvent.setup();
    renderPage(<TeamPage />, { category_id: "salon-beauty" });
    expect(await screen.findByText("No team members yet")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Timetable" }));
    expect(screen.getByText(/weekly class timetable is a Premium feature/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add class" })).toBeNull();
  });

  it("categories without a timetable only get the staff list", async () => {
    renderPage(<TeamPage />, { category_id: "bakery", plan_key: "premium" });
    await screen.findByText("No team members yet");
    expect(screen.queryByRole("tab", { name: "Timetable" })).toBeNull();
  });

  it("standard staff form hides the services link behind an upgrade prompt", async () => {
    const user = userEvent.setup();
    renderPage(<TeamPage />, { category_id: "salon-beauty" });
    await user.click((await screen.findAllByRole("button", { name: "Add team member" }))[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Linking services to each team member is a Premium feature/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Haircut")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Name needs 2 to 80 characters")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Name"), "Joy");
    await user.type(within(dialog).getByLabelText(/Specialties/), "braids, locs");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Joy")).toBeInTheDocument();
    expect(screen.getByText("locs")).toBeInTheDocument();
  });

  it("premium links services to staff", async () => {
    const user = userEvent.setup();
    renderPage(<TeamPage />, { category_id: "salon-beauty", plan_key: "premium" });
    await user.click((await screen.findAllByRole("button", { name: "Add team member" }))[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Joy");
    await user.click(within(dialog).getByLabelText(/Braids/));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Services: Braids/)).toBeInTheDocument();
  });

  it("premium builds a timetable and refuses a trainer double-booking", async () => {
    const user = userEvent.setup();
    renderPage(<TeamPage />, { category_id: "gym-fitness", plan_key: "premium" }, (s) => { s.staff = [member(1, { name: "Coach Ken", role: "Trainer" })]; });
    await user.click(await screen.findByRole("tab", { name: "Timetable" }));
    const add = async (name, start, end) => {
      await user.click(screen.getByRole("button", { name: "Add class" }));
      const dialog = await screen.findByRole("dialog", { name: "Add class" });
      await user.type(within(dialog).getByLabelText("Class"), name);
      await user.selectOptions(within(dialog).getByLabelText("Day"), "2");
      await user.clear(within(dialog).getByLabelText("Starts"));
      await user.type(within(dialog).getByLabelText("Starts"), start);
      await user.clear(within(dialog).getByLabelText("Ends"));
      await user.type(within(dialog).getByLabelText("Ends"), end);
      await user.selectOptions(within(dialog).getByLabelText("Trainer"), "s1");
      await user.click(within(dialog).getByRole("button", { name: "Save" }));
      return dialog;
    };
    await add("HIIT", "07:00", "08:00");
    expect(await screen.findByText("HIIT")).toBeInTheDocument();
    expect(screen.getByText("07:00 to 08:00")).toBeInTheDocument();
    const dialog = await add("Yoga", "07:30", "08:30");
    expect(await within(dialog).findByText("This trainer already has a class at this time")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await add("Yoga", "08:00", "09:00");
    expect(await screen.findByText("Yoga")).toBeInTheDocument();
    expect(screen.getAllByText("Coach Ken").length).toBeGreaterThan(1);
  });

  it("shows Removed by admin on staff and is read-only when suspended", async () => {
    renderPage(<TeamPage />, { status: "suspended" }, (s) => { s.staff = [member(1, { removed_by_admin: true, admin_status: "removed", admin_reason: "Photo is not you" })]; });
    expect(await screen.findByText("Removed by admin")).toBeInTheDocument();
    expect(screen.getByText(/Photo is not you/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add team member" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("a downgraded business still sees its timetable but cannot edit it", async () => {
    const user = userEvent.setup();
    renderPage(<TeamPage />, { category_id: "gym-fitness" }, (s) => {
      s.slots = [{ id: "t1", business_id: "b-demo", day_of_week: 1, start_time: "06:00:00", end_time: "07:00:00", class_name: "Spin", staff_id: null, admin_status: null, admin_reason: null, removed_by_admin: false, hidden_by_admin: false }];
    });
    await user.click(await screen.findByRole("tab", { name: "Timetable" }));
    expect(await screen.findByText("Spin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Spin/ })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add class" })).toBeNull());
  });
});
