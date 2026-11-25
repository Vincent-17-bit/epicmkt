import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { PhoneField } from "./Field.jsx";
import { phoneErrors } from "./formModel.js";
import { isRealPhone } from "../../shared/validators.js";

function Form({ defaults = {}, onValues }) {
  const methods = useForm({ defaultValues: { phone: "", ...defaults } });
  const phone = methods.watch("phone");
  onValues?.(phone);
  return (
    <FormProvider {...methods}>
      <PhoneField name="phone" label="Your phone number" hint="We may call you." />
      <output data-testid="held">{phone}</output>
    </FormProvider>
  );
}
const held = () => screen.getByTestId("held").textContent;

describe("PhoneField in the application form", () => {
  it("is named by its label, starts on Kenya, and holds one international number", async () => {
    render(<Form />);
    const box = screen.getByLabelText("Your phone number");
    expect(box).toHaveAccessibleDescription("We may call you.");
    expect(screen.getByRole("button", { name: /country code: kenya \+254/i })).toBeInTheDocument();
    await userEvent.type(box, "0712 345 678");
    expect(held()).toBe("+254712345678");
  });

  it("takes a number from another country once that country is picked", async () => {
    render(<Form />);
    await userEvent.click(screen.getByRole("button", { name: /country code/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("combobox"), "united kingdom");
    await userEvent.click(within(dialog).getByRole("option"));
    await userEvent.type(screen.getByLabelText("Your phone number"), "07911 123456");
    expect(held()).toBe("+447911123456");
    expect(isRealPhone(held())).toBe(true);
  });

  it("loads a draft saved the old way, as a Kenyan number", () => {
    render(<Form defaults={{ phone: "0722 000 111" }} />);
    expect(screen.getByLabelText("Your phone number")).toHaveValue("0722 000111");
    expect(screen.getByRole("button", { name: /country code: kenya/i })).toBeInTheDocument();
  });
});

describe("phone validation for the whole world", () => {
  it("accepts real numbers from many countries, in any common form", () => {
    for (const n of ["0712 345 678", "+254712345678", "254712345678", "+256 772 123456", "+1 415 555 2671", "+44 7911 123456", "+971 50 123 4567", "+91 98765 43210", "+81 90 1234 5678", "+49 151 12345678", "+55 11 91234-5678", "+27 82 123 4567", "+234 802 123 4567", "00255712345678"]) {
      expect(isRealPhone(n), n).toBe(true);
    }
  });

  it("refuses numbers that only have the right number of digits", () => {
    for (const n of ["", "0712345", "+25471234", "+1234567890", "+44 1234", "12345678", "07123456789012", "+2547123456789012"]) {
      expect(isRealPhone(n), JSON.stringify(n)).toBe(false);
    }
  });

  it("reports the business phones and WhatsApp that are not real, one message per input", () => {
    expect(phoneErrors({ businessPhones: ["+254712345678", "+256772123456"], whatsappSame: true })).toEqual([]);
    const errs = phoneErrors({ businessPhones: ["+254712345678", "+25471"], whatsapp: "+4412" });
    expect(errs.map(([path]) => path)).toEqual(["contacts.businessPhones.1", "contacts.whatsapp"]);
    expect(errs[0][1]).toMatch(/Choose the country/);
    expect(phoneErrors({ businessPhones: [""], whatsappSame: true }).map(([p]) => p)).toEqual(["contacts.businessPhones.0"]);
  });
});
