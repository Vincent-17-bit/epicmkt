import { useState } from "react";
import Button from "../../components/Button.jsx";
import Sheet from "../../components/Sheet.jsx";
import { STATE_META } from "../../components/StatusChip.jsx";
import { BELOW_MD } from "../../lib/breakpoints.js";
import { useMediaQuery } from "../../lib/useMediaQuery.js";
import { emptyFilters } from "./filters.js";

const STATUS_STATES = Object.entries(STATE_META).filter(([id]) => id !== "deleted");

function Select({ label, value, onChange, children }) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function TriState({ label, value, onChange }) {
  return (
    <Select label={label} value={value} onChange={onChange}>
      <option value="">Any</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </Select>
  );
}

function FilterFields({ value, onChange, options }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const county = options.counties.find((item) => item.name === value.county);
  const towns = county ? county.towns : options.counties.flatMap((item) => item.towns).sort();

  return (
    <>
      <Select label="Category" value={value.category} onChange={(category) => set({ category })}>
        <option value="">All categories</option>
        {options.categories.map((item) => <option key={item}>{item}</option>)}
      </Select>
      <Select label="County" value={value.county} onChange={(next) => set({ county: next, town: "" })}>
        <option value="">All counties</option>
        {options.counties.map((item) => <option key={item.name}>{item.name}</option>)}
      </Select>
      <Select label="Town" value={value.town} onChange={(town) => set({ town })}>
        <option value="">All towns</option>
        {towns.map((item) => <option key={item}>{item}</option>)}
      </Select>
      <Select label="Plan" value={value.plan} onChange={(plan) => set({ plan })}>
        <option value="">All plans</option>
        {options.plans.map((item) => <option key={item}>{item}</option>)}
      </Select>
      <TriState label="Verified" value={value.verified} onChange={(verified) => set({ verified })} />
      <TriState label="Featured" value={value.featured} onChange={(featured) => set({ featured })} />
      <Select label="Status" value={value.status} onChange={(status) => set({ status })}>
        <option value="">Any status</option>
        {STATUS_STATES.map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
      </Select>
      <Select label="Agent" value={value.agent} onChange={(agent) => set({ agent })}>
        <option value="">Any agent</option>
        <option value="__none__">Unassigned</option>
        {options.agents.map((item) => <option key={item}>{item}</option>)}
      </Select>
      <label className="field">
        Days left from
        <input type="number" inputMode="numeric" value={value.daysMin} onChange={(event) => set({ daysMin: event.target.value })} />
      </label>
      <label className="field">
        Days left to
        <input type="number" inputMode="numeric" value={value.daysMax} onChange={(event) => set({ daysMax: event.target.value })} />
      </label>
      <label className="field">
        Created from
        <input type="date" value={value.createdFrom} onChange={(event) => set({ createdFrom: event.target.value })} />
      </label>
      <label className="field">
        Created to
        <input type="date" value={value.createdTo} onChange={(event) => set({ createdTo: event.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={value.hasFlags} onChange={(event) => set({ hasFlags: event.target.checked })} />
        Has open flags
      </label>
      <label className="check">
        <input type="checkbox" checked={value.hasUnconfirmed} onChange={(event) => set({ hasUnconfirmed: event.target.checked })} />
        Has unconfirmed payment
      </label>
    </>
  );
}

/** Inline panel for wide screens. Changes apply as you make them. */
export default function Filters({ value, onChange, options }) {
  return (
    <section className="filters" aria-label="Filters">
      <FilterFields value={value} onChange={onChange} options={options} />
      <div className="filters__actions">
        <Button onClick={() => onChange(emptyFilters)}>Clear filters</Button>
      </div>
    </section>
  );
}

/** Below 1024px: bottom sheet on phones, slide-over on tablets. Apply commits. */
export function FiltersSheet({ value, onApply, onClose, options }) {
  const [draft, setDraft] = useState(value);
  const phone = useMediaQuery(BELOW_MD);

  const submit = (event) => {
    event.preventDefault();
    onApply(draft);
    onClose();
  };

  return (
    <Sheet title="Filters" placement={phone ? "bottom" : "end"} onClose={onClose}>
      <form className="sheet__form" onSubmit={submit}>
        <div className="sheet__body">
          <FilterFields value={draft} onChange={setDraft} options={options} />
        </div>
        <div className="sheet__footer sheet__footer--split">
          <Button onClick={() => setDraft(emptyFilters)}>Reset</Button>
          <Button type="submit" variant="primary">Apply</Button>
        </div>
      </form>
    </Sheet>
  );
}
