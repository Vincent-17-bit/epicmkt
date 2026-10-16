import Button from "../../components/Button.jsx";
import { STATE_META } from "../../components/StatusChip.jsx";
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

export default function Filters({ value, onChange, options }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const county = options.counties.find((item) => item.name === value.county);
  const towns = county ? county.towns : options.counties.flatMap((item) => item.towns).sort();

  return (
    <section className="filters" aria-label="Filters">
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
      <label className="filters__check">
        <input type="checkbox" checked={value.hasFlags} onChange={(event) => set({ hasFlags: event.target.checked })} />
        Has open flags
      </label>
      <label className="filters__check">
        <input type="checkbox" checked={value.hasUnconfirmed} onChange={(event) => set({ hasUnconfirmed: event.target.checked })} />
        Has unconfirmed payment
      </label>
      <div className="filters__actions">
        <Button size="sm" onClick={() => onChange(emptyFilters)}>Clear filters</Button>
      </div>
    </section>
  );
}
