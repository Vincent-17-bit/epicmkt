import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { REPORT_REASONS } from "@epicmkt/shared";
import { allFaqs, popularFaqs } from "../data/faqs.js";
import Faq from "./Faq.jsx";
import Help from "./Help.jsx";
import HowItWorks from "./HowItWorks.jsx";
import ReportProblem from "./ReportProblem.jsx";
import SellerGuide from "./SellerGuide.jsx";
import SuggestBusiness from "./SuggestBusiness.jsx";

vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => null }));

const view = (ui, path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      {ui}
    </MemoryRouter>
  );

const LEGAL_STYLE_PAGES = [
  ["Help", Help, "Help centre"],
  ["Faq", Faq, "Frequently asked questions"],
  ["HowItWorks", HowItWorks, "How EpicMKT works"],
  ["ReportProblem", ReportProblem, "Report a problem"]
];

describe.each(LEGAL_STYLE_PAGES)("%s page", (_name, Page, title) => {
  it("has one h1, the Help eyebrow, three highlights and the closing blocks", () => {
    const { container } = view(<Page />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(container.querySelector("header p")).toHaveTextContent("Help");
    expect(within(screen.getByRole("list", { name: "In brief" })).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "More help" })).toBeInTheDocument();
  });

  it("links every contents entry to a section that exists", () => {
    view(<Page />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    const links = within(toc).getAllByRole("link");
    expect(links.length).toBeGreaterThan(1);
    links.forEach((link) => {
      const id = link.getAttribute("href").slice(1);
      const section = document.getElementById(id);
      expect(section, `section #${id}`).not.toBeNull();
      expect(within(section).getByRole("heading", { level: 2 })).toBeInTheDocument();
    });
  });

  it("never links a page to itself in the More help cards", () => {
    view(<Page />);
    const hrefs = within(screen.getByRole("navigation", { name: "More help" }))
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("Help centre", () => {
  it("links to each Help page and shows the popular questions from the shared FAQ data", () => {
    view(<Help />);
    const topics = screen.getByRole("navigation", { name: "Help topics" });
    ["/faq", "/how-it-works", "/report-a-problem", "/suggest-a-business"].forEach((href) => {
      expect(topics.querySelector(`a[href="${href}"]`)).not.toBeNull();
    });
    expect(popularFaqs).toHaveLength(4);
    popularFaqs.forEach((f) => expect(screen.getByRole("button", { name: f.q })).toBeInTheDocument());
  });
});

describe("FAQ page", () => {
  it("shows every question from the shared data, in four groups", () => {
    view(<Faq />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent.replace(/^\d+/, ""))).toEqual(
      expect.arrayContaining(["For shoppers", "For businesses", "Pricing and payment", "Safety and reports"])
    );
    allFaqs.forEach((f) => expect(screen.getByRole("button", { name: f.q })).toBeInTheDocument());
  });

  it("shares its questions with the Help centre", () => {
    view(<Faq />);
    const onFaq = new Set(screen.getAllByRole("button").map((b) => b.textContent));
    popularFaqs.forEach((f) => expect(onFaq.has(f.q)).toBe(true));
  });

  it("emits FAQPage markup for all questions and removes it when left", () => {
    const { unmount } = view(<Faq />);
    const ld = JSON.parse(document.getElementById("faq-jsonld").textContent);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(allFaqs.length);
    unmount();
    expect(document.getElementById("faq-jsonld")).toBeNull();
  });

  it("puts a link inside an answer when the data has one", () => {
    view(<Faq />);
    fireEvent.click(screen.getByRole("button", { name: "How can my business be listed?" }));
    expect(screen.getByRole("link", { name: "Read the seller guide" })).toHaveAttribute("href", "/seller-guide");
  });
});

describe("Report a problem page", () => {
  it("lists the same reasons as the report dialog", () => {
    view(<ReportProblem />);
    const reasons = within(document.getElementById("reasons")).getAllByRole("listitem");
    expect(reasons.map((li) => li.textContent)).toEqual(REPORT_REASONS.map((r) => r.label));
  });

  it("falls back to the contact page, not a new endpoint", () => {
    view(<ReportProblem />);
    expect(screen.getByRole("link", { name: /^Contact EpicMKT/ })).toHaveAttribute("href", "/contact");
  });
});

describe("Suggest a business page", () => {
  const Where = () => {
    const { pathname, search } = useLocation();
    return <p data-testid="where">{`${pathname}${search}`}</p>;
  };
  const open = () =>
    render(
      <MemoryRouter initialEntries={["/suggest-a-business"]}>
        <Routes>
          <Route path="/suggest-a-business" element={<SuggestBusiness />} />
          <Route path="/contact" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );

  it("has one h1 and the form fields", () => {
    open();
    expect(screen.getByRole("heading", { level: 1, name: "Suggest a business" })).toBeInTheDocument();
    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    expect(screen.getByLabelText("Category (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Town (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone or WhatsApp (optional)")).toBeInTheDocument();
  });

  it("asks for the name before it goes on", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the name of the business.");
    expect(screen.queryByTestId("where")).toBeNull();
  });

  it("hands the suggestion to /contact?suggest=", () => {
    open();
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Maseno Gym" } });
    fireEvent.change(screen.getByLabelText("Category (optional)"), { target: { value: "barbershop" } });
    fireEvent.change(screen.getByLabelText("Town (optional)"), { target: { value: "Maseno" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/contact?suggest=Maseno+Gym&category=barbershop&town=Maseno");
  });
});

describe("Seller guide", () => {
  it("links to the other two For businesses pages", () => {
    view(<SellerGuide />);
    const related = within(screen.getByRole("navigation", { name: "Related pages" }));
    expect(related.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/become-a-seller", "/pricing"]);
  });
});
