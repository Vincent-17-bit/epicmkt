import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { mountApp } from "./test/mountApp.jsx";
import { seriousViolations } from "./test/axe.js";

// Zero serious or critical axe violations on the three pages named in the acceptance criteria, in both themes.
const PAGES = [
  ["Command Center", "/admin", /Command center/i],
  ["Businesses", "/admin/businesses", /Businesses/i],
  ["Settings", "/admin/settings", /Settings/i],
];

describe("axe helper", () => {
  it("catches a real violation (so a pass above means something)", async () => {
    const host = document.createElement("div");
    host.innerHTML = '<main><img src="x.png"><button></button></main>';
    document.body.appendChild(host);
    const found = (await seriousViolations(host)).map((v) => v.id);
    host.remove();
    expect(found).toEqual(expect.arrayContaining(["image-alt", "button-name"]));
  });
});

beforeEach(() => { localStorage.clear(); window.innerWidth = 1440; });
afterEach(cleanup);

describe.each(["light", "dark"])("axe, %s theme", (theme) => {
  it.each(PAGES)("%s has no serious or critical violations", async (_name, path, title) => {
    const { container } = mountApp(path, theme);
    await screen.findByRole("heading", { level: 1, name: title });
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe(theme));
    // let the page's queries settle so loaded content is scanned, not just skeletons
    await new Promise((r) => setTimeout(r, 400));
    if (path.endsWith("/businesses")) expect(container.querySelector('[role="columnheader"], th')).not.toBeNull(); // scanned the loaded table
    expect(await seriousViolations(container)).toEqual([]);
  }, 20000);
});
