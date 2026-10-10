import { useState } from "react";
import {
  AVAILABILITY, LEGACY_AVAILABILITY, ITEM_KINDS, PRICE_TYPES, BADGES, TERMS, LIMITS, DEFAULT_UNITS, priceNeeds,
  applyStockRules, isStockDriven, stockExplanation, availabilityLabel, showsServiceFields, showsMembershipFields, newId,
} from "@epicmkt/shared";
import { Field, TextInput, TextArea, NumberInput, SelectInput, DateInput, CheckRow, Chips, RowList, StringList, Button } from "../ui/ui.jsx";
import { TemplateFields } from "./TemplateFields.jsx";
import styles from "./catalog.module.css";

// Which blocks apply to this item. The guided form builds its anchor list from the same function.
export function itemSections(item, category) {
  const out = [
    { id: "basics", title: "Basics" },
    { id: "price", title: "Price" },
    { id: "availability", title: "Availability and stock" },
    { id: "details", title: "Details" },
  ];
  if (showsServiceFields(item.kind)) out.push({ id: "service", title: item.kind === "class" ? "Session details" : "Service details" });
  if (showsMembershipFields(item.kind)) out.push({ id: "membership", title: item.kind === "class" ? "Schedule and trainer" : "Membership terms" });
  if (category?.fields?.length) out.push({ id: "extras", title: `${category.name} details` });
  return out;
}

function SectionPicker({ value, onChange, sections, onAddSection, error }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const options = [{ value: "", label: "No section" }, ...sections.map((s) => ({ value: s, label: s }))];
  if (value && !sections.includes(value)) options.push({ value, label: value });

  const add = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2) return setProblem("Enter at least 2 characters");
    if (clean.length > LIMITS.section) return setProblem(`Up to ${LIMITS.section} characters`);
    if (sections.some((s) => s.toLowerCase() === clean.toLowerCase())) { onChange(sections.find((s) => s.toLowerCase() === clean.toLowerCase())); setAdding(false); setName(""); return; }
    if (sections.length >= LIMITS.sections) return setProblem(`You can have up to ${LIMITS.sections} sections`);
    try {
      await onAddSection(clean);
      onChange(clean);
      setAdding(false);
      setName("");
      setProblem("");
    } catch {
      setProblem("Could not add the section. Try again.");
    }
  };

  return (
    <div className={styles.sectionPicker}>
      <Field label="Section" hint="Groups items on your page, for example Cuts or Braids" error={error} optional>
        {(p) => <SelectInput {...p} value={value} onChange={onChange} options={options} data-nav />}
      </Field>
      {adding ? (
        <div className={styles.inlineAdd}>
          <Field label="New section name" error={problem}>
            {(p) => (
              <TextInput {...p} value={name} maxLength={LIMITS.section} onChange={setName} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); add(); } if (e.key === "Escape") setAdding(false); }} />
            )}
          </Field>
          <Button variant="primary" onClick={add}>Add section</Button>
          <Button onClick={() => { setAdding(false); setProblem(""); }}>Cancel</Button>
        </div>
      ) : (
        <Button className={styles.linkBtn} onClick={() => setAdding(true)}>+ New section</Button>
      )}
    </div>
  );
}

function StockPanel({ item, set, errors }) {
  const preview = applyStockRules(item);
  const driven = isStockDriven(item);
  return (
    <div className={styles.stock}>
      <CheckRow checked={item.trackStock} onChange={(trackStock) => set({ trackStock })} label="Track how many I have" hint="Status then follows your stock count" />
      {item.trackStock && (
        <>
          <div className={styles.threeCol}>
            <Field label="In stock now" error={errors.stockCount}>
              {(p) => <NumberInput {...p} value={item.stockCount} onChange={(stockCount) => set({ stockCount })} data-nav />}
            </Field>
            <Field label="Low-stock at or below" error={errors.lowStockThreshold}>
              {(p) => <NumberInput {...p} value={item.lowStockThreshold} onChange={(v) => set({ lowStockThreshold: v ?? 0 })} data-nav />}
            </Field>
            <Field label="Restock date" error={errors.restockDate} optional>
              {(p) => <DateInput {...p} value={item.restockDate} onChange={(restockDate) => set({ restockDate })} data-nav />}
            </Field>
          </div>
          <CheckRow checked={item.showStockCount} onChange={(showStockCount) => set({ showStockCount })} label="Show “Only N left” to shoppers" hint="when stock is low" />
          <p className={styles.stockNote} aria-live="polite">
            {stockExplanation(item)}
            {driven && <> <strong>Status: {availabilityLabel(preview)}.</strong></>}{" "}
            <span className={styles.muted}>The system sets the final status when you save.</span>
          </p>
        </>
      )}
    </div>
  );
}

// columns: the row already shows name, price, unit, availability and visible, so they are left out here.
export function ItemFields({ item, onChange, errors = {}, ctx, columns = false }) {
  const set = (patch) => onChange(patch);
  const needs = priceNeeds(item.priceType);
  const units = [...new Set([...DEFAULT_UNITS, ...(ctx.units ?? [])])];
  const driven = isStockDriven(item);
  const availabilityOptions = [...AVAILABILITY, ...(item.availability === "unavailable" ? LEGACY_AVAILABILITY : [])].map((a) => ({ value: a.value, label: a.label }));
  const sections = itemSections(item, ctx.category);
  const has = (id) => sections.some((s) => s.id === id);
  const err = (k) => errors[k];

  return (
    <div className={styles.fields}>
      <section id="sec-basics" className={styles.block} aria-labelledby="h-basics">
        <h3 id="h-basics" className={styles.blockTitle}>Basics</h3>
        <div className={styles.grid}>
          {!columns && (
            <Field label="Name" error={err("name")} count={item.name.length} max={LIMITS.name} className={styles.wide}>
              {(p) => <TextInput {...p} value={item.name} onChange={(name) => set({ name })} maxLength={LIMITS.name + 20} autoComplete="off" data-nav />}
            </Field>
          )}
          <Field label="Type" error={err("kind")}>
            {(p) => <SelectInput {...p} value={item.kind} onChange={(kind) => set({ kind })} options={ITEM_KINDS} data-nav />}
          </Field>
          <SectionPicker value={item.section} onChange={(section) => set({ section })} sections={ctx.sections ?? []} onAddSection={ctx.addSection} error={err("section")} />
          <Field label="Short description" hint="Shown on listing cards" error={err("shortDescription")} count={item.shortDescription.length} max={LIMITS.shortDescription} className={styles.wide} optional>
            {(p) => <TextInput {...p} value={item.shortDescription} onChange={(shortDescription) => set({ shortDescription })} data-nav />}
          </Field>
          <Field label="Full description" error={err("description")} count={item.description.length} max={LIMITS.description} className={styles.wide} optional>
            {(p) => <TextArea {...p} rows={4} value={item.description} onChange={(description) => set({ description })} />}
          </Field>
          <Field label="Badge" error={err("badge")} optional>
            {(p) => <SelectInput {...p} value={item.badge} onChange={(badge) => set({ badge })} options={BADGES.map((b) => ({ value: b, label: b }))} placeholder="No badge" data-nav />}
          </Field>
          {!columns && (
            <div className={styles.inline}>
              <CheckRow checked={item.visible} onChange={(visible) => set({ visible })} label="Visible to shoppers" hint="Turn off to hide it without deleting" />
            </div>
          )}
        </div>
      </section>

      <section id="sec-price" className={styles.block} aria-labelledby="h-price">
        <h3 id="h-price" className={styles.blockTitle}>Price</h3>
        <div className={styles.grid}>
          <Field label="Price type" error={err("priceType")}>
            {(p) => <SelectInput {...p} value={item.priceType} onChange={(priceType) => set({ priceType })} options={PRICE_TYPES} data-nav />}
          </Field>
          {needs.price && !columns && (
            <Field label={item.priceType === "range" ? "Lowest price (KSh)" : item.priceType === "from" ? "Starting price (KSh)" : "Price (KSh)"} hint="Whole shillings" error={err("price")}>
              {(p) => <NumberInput {...p} value={item.price} onChange={(price) => set({ price })} data-nav />}
            </Field>
          )}
          {needs.max && (
            <Field label="Highest price (KSh)" hint="Whole shillings" error={err("priceMax")}>
              {(p) => <NumberInput {...p} value={item.priceMax} onChange={(priceMax) => set({ priceMax })} data-nav />}
            </Field>
          )}
          {needs.unit && !columns && (
            <Field label="Unit" hint="For example per 20L or per session" error={err("unit")} optional>
              {(p) => (
                <>
                  <TextInput {...p} list={`units-${item.id}`} value={item.unit} maxLength={LIMITS.unit} onChange={(unit) => set({ unit })} data-nav />
                  <datalist id={`units-${item.id}`}>{units.map((u) => <option key={u} value={u} />)}</datalist>
                </>
              )}
            </Field>
          )}
        </div>
        {needs.price && item.priceType !== "range" && (
          <fieldset className={styles.group}>
            <legend>Sale price</legend>
            <div className={styles.threeCol}>
              <Field label="Sale price (KSh)" error={err("salePrice")} optional>
                {(p) => <NumberInput {...p} value={item.salePrice} onChange={(salePrice) => set({ salePrice })} data-nav />}
              </Field>
              <Field label="Starts" error={err("saleStarts")} optional>
                {(p) => <DateInput {...p} value={item.saleStarts} onChange={(saleStarts) => set({ saleStarts })} data-nav />}
              </Field>
              <Field label="Ends" error={err("saleEnds")} optional>
                {(p) => <DateInput {...p} value={item.saleEnds} onChange={(saleEnds) => set({ saleEnds })} data-nav />}
              </Field>
            </div>
          </fieldset>
        )}
      </section>

      <section id="sec-availability" className={styles.block} aria-labelledby="h-availability">
        <h3 id="h-availability" className={styles.blockTitle}>Availability and stock</h3>
        <div className={styles.grid}>
          {!columns && (
            <Field label="Availability" error={err("availability")} hint={driven ? `Set by your stock count: ${availabilityLabel(applyStockRules(item))}` : undefined}>
              {(p) => <SelectInput {...p} value={driven ? applyStockRules(item) : item.availability} disabled={driven} onChange={(availability) => set({ availability })} options={availabilityOptions} data-nav />}
            </Field>
          )}
          {item.availability === "seasonal" && (
            <>
              <Field label="Season starts" error={err("seasonFrom")}>{(p) => <DateInput {...p} value={item.seasonFrom} onChange={(seasonFrom) => set({ seasonFrom })} data-nav />}</Field>
              <Field label="Season ends" error={err("seasonTo")}>{(p) => <DateInput {...p} value={item.seasonTo} onChange={(seasonTo) => set({ seasonTo })} data-nav />}</Field>
            </>
          )}
          {item.availability === "coming_soon" && (
            <Field label="Expected date" error={err("expectedDate")}>{(p) => <DateInput {...p} value={item.expectedDate} onChange={(expectedDate) => set({ expectedDate })} data-nav />}</Field>
          )}
        </div>
        {driven && columns && <p className={styles.stockNote}>Status follows your stock count. Change the count to change it.</p>}
        <StockPanel item={item} set={set} errors={errors} />
      </section>

      <section id="sec-details" className={styles.block} aria-labelledby="h-details">
        <h3 id="h-details" className={styles.blockTitle}>Details</h3>
        <fieldset className={styles.group}>
          <legend>Options with their own price</legend>
          <RowList
            items={item.variants}
            onChange={(variants) => set({ variants })}
            blank={() => ({ id: newId(), label: "", price: null })}
            addLabel="Add an option"
            label="option"
            max={LIMITS.variants}
            errors={errors}
            renderRow={(v, patch, i) => (
              <>
                <Field label="Option name" error={errors[`variants.${i}.label`]}>{(p) => <TextInput {...p} value={v.label} maxLength={40} placeholder="Small" onChange={(label) => patch({ label })} data-nav />}</Field>
                <Field label="Price (KSh)" error={errors[`variants.${i}.price`]}>{(p) => <NumberInput {...p} value={v.price} onChange={(price) => patch({ price })} data-nav />}</Field>
              </>
            )}
          />
        </fieldset>
        <fieldset className={styles.group}>
          <legend>Specifications</legend>
          <RowList
            items={item.specs}
            onChange={(specs) => set({ specs })}
            blank={() => ({ label: "", value: "" })}
            addLabel="Add a specification"
            label="specification"
            max={LIMITS.specs}
            renderRow={(s, patch, i) => (
              <>
                <Field label="Label" error={errors[`specs.${i}.label`]}>{(p) => <TextInput {...p} value={s.label} maxLength={40} placeholder="Size" onChange={(label) => patch({ label })} data-nav />}</Field>
                <Field label="Value" error={errors[`specs.${i}.value`]}>{(p) => <TextInput {...p} value={s.value} maxLength={100} placeholder="20 litres" onChange={(value) => patch({ value })} data-nav />}</Field>
              </>
            )}
          />
        </fieldset>
        <fieldset className={styles.group}>
          <legend>What is included</legend>
          <StringList items={item.includes} onChange={(includes) => set({ includes })} addLabel="Add a line" max={LIMITS.includes} label="included line" placeholder="Hot towel finish" />
        </fieldset>
        <div className={styles.grid}>
          <Field label="Terms" hint="Deposits, cancellations, warranty" error={err("terms")} count={item.terms.length} max={LIMITS.terms} className={styles.wide} optional>
            {(p) => <TextArea {...p} value={item.terms} onChange={(terms) => set({ terms })} />}
          </Field>
          <div className={styles.wide}>
            <Field label="Search tags and synonyms" hint="Words shoppers might type, for example “jerrycan” or “mtungi”" error={err("searchTags")} optional>
              {() => <Chips values={item.searchTags} onChange={(searchTags) => set({ searchTags })} max={LIMITS.tags} maxLength={LIMITS.tagLength} label="search tags" error={err("searchTags")} />}
            </Field>
          </div>
        </div>
      </section>

      {has("service") && (
        <section id="sec-service" className={styles.block} aria-labelledby="h-service">
          <h3 id="h-service" className={styles.blockTitle}>{item.kind === "class" ? "Session details" : "Service details"}</h3>
          <div className={styles.grid}>
            <Field label="Duration (minutes)" error={err("service.duration")}>
              {(p) => <NumberInput {...p} value={item.service.duration} onChange={(duration) => set({ service: { ...item.service, duration } })} data-nav />}
            </Field>
            <div className={styles.inline}>
              <CheckRow checked={item.service.homeService} onChange={(homeService) => set({ service: { ...item.service, homeService } })} label="Home service available" />
              <CheckRow checked={item.service.appointmentNeeded} onChange={(appointmentNeeded) => set({ service: { ...item.service, appointmentNeeded } })} label="Appointment needed" />
            </div>
          </div>
          <fieldset className={styles.group}>
            <legend>Staff who offer this</legend>
            <StringList items={item.service.staff} onChange={(staff) => set({ service: { ...item.service, staff } })} addLabel="Add a person" max={LIMITS.staff} label="staff member" placeholder="Name" maxLength={40} />
          </fieldset>
          <fieldset className={styles.group}>
            <legend>Add-ons</legend>
            <RowList
              items={item.service.addOns}
              onChange={(addOns) => set({ service: { ...item.service, addOns } })}
              blank={() => ({ label: "", price: null })}
              addLabel="Add an add-on"
              label="add-on"
              max={LIMITS.addOns}
              renderRow={(a, patch, i) => (
                <>
                  <Field label="Add-on" error={errors[`service.addOns.${i}.label`]}>{(p) => <TextInput {...p} value={a.label} maxLength={40} placeholder="Beads" onChange={(label) => patch({ label })} data-nav />}</Field>
                  <Field label="Extra (KSh)" error={errors[`service.addOns.${i}.price`]}>{(p) => <NumberInput {...p} value={a.price} onChange={(price) => patch({ price })} data-nav />}</Field>
                </>
              )}
            />
          </fieldset>
        </section>
      )}

      {has("membership") && (
        <section id="sec-membership" className={styles.block} aria-labelledby="h-membership">
          <h3 id="h-membership" className={styles.blockTitle}>{item.kind === "class" ? "Schedule and trainer" : "Membership terms"}</h3>
          <div className={styles.grid}>
            <Field label="Term" hint="How long one purchase lasts" error={err("membership.term")}>
              {(p) => <SelectInput {...p} value={item.membership.term} onChange={(term) => set({ membership: { ...item.membership, term } })} options={TERMS} data-nav />}
            </Field>
            <Field label="Joining fee (KSh)" error={err("membership.joiningFee")} optional>
              {(p) => <NumberInput {...p} value={item.membership.joiningFee} onChange={(joiningFee) => set({ membership: { ...item.membership, joiningFee } })} data-nav />}
            </Field>
            <Field label="Days and times" hint="For example Mon to Sat, 6am to 9pm" error={err("membership.daysTimes")} className={styles.wide} optional>
              {(p) => <TextInput {...p} value={item.membership.daysTimes} maxLength={200} onChange={(daysTimes) => set({ membership: { ...item.membership, daysTimes } })} data-nav />}
            </Field>
            <Field label="Trainer" error={err("membership.trainer")} optional>
              {(p) => <TextInput {...p} value={item.membership.trainer} maxLength={60} onChange={(trainer) => set({ membership: { ...item.membership, trainer } })} data-nav />}
            </Field>
          </div>
          <fieldset className={styles.group}>
            <legend>Peak and off-peak</legend>
            <div className={styles.fourCol}>
              <Field label="Peak price (KSh)" error={err("membership.peakPrice")} optional>{(p) => <NumberInput {...p} value={item.membership.peakPrice} onChange={(peakPrice) => set({ membership: { ...item.membership, peakPrice } })} data-nav />}</Field>
              <Field label="Peak hours" error={err("membership.peakHours")} optional>{(p) => <TextInput {...p} value={item.membership.peakHours} maxLength={100} placeholder="5pm to 8pm" onChange={(peakHours) => set({ membership: { ...item.membership, peakHours } })} data-nav />}</Field>
              <Field label="Off-peak price (KSh)" error={err("membership.offPeakPrice")} optional>{(p) => <NumberInput {...p} value={item.membership.offPeakPrice} onChange={(offPeakPrice) => set({ membership: { ...item.membership, offPeakPrice } })} data-nav />}</Field>
              <Field label="Off-peak hours" error={err("membership.offPeakHours")} optional>{(p) => <TextInput {...p} value={item.membership.offPeakHours} maxLength={100} placeholder="10am to 3pm" onChange={(offPeakHours) => set({ membership: { ...item.membership, offPeakHours } })} data-nav />}</Field>
            </div>
          </fieldset>
        </section>
      )}

      {has("extras") && (
        <section id="sec-extras" className={styles.block} aria-labelledby="h-extras">
          <h3 id="h-extras" className={styles.blockTitle}>{ctx.category.name} details</h3>
          <p className={styles.muted}>Extra details for your category. Fill in only what applies to this item.</p>
          <TemplateFields fields={ctx.category.fields} values={item.attributes} errors={errors} onChange={(attributes) => set({ attributes })} />
        </section>
      )}
    </div>
  );
}
