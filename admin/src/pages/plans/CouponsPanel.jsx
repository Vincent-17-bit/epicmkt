import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatKes } from "@epicmkt/shared";
import plansApi from "../../api/plans.js";
import Button from "../../components/Button.jsx";
import { useToast } from "../../components/Toast.jsx";
import { couponSchema, validate } from "./schema.js";

const blank = { code: "", kind: "percent", value: "", scopeCategory: null, scopePlan: null, validFrom: "", validUntil: "", maxRedemptions: null, active: true };
const describe = (c) => (c.kind === "percent" ? `${c.value}% off` : `${formatKes(c.value)} off`);

export default function CouponsPanel({ categories }) {
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-coupons"], queryFn: plansApi.listCoupons });
  const [form, setForm] = useState(blank);
  const [touched, setTouched] = useState(false);
  const checked = validate(couponSchema, { ...form, validFrom: form.validFrom || null, validUntil: form.validUntil || null });
  const errors = touched ? checked.errors : {};
  const set = (patch) => setForm({ ...form, ...patch });

  const save = useMutation({
    mutationFn: (c) => plansApi.saveCoupon(c),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      setForm(blank);
      setTouched(false);
      toast.push({ message: "Coupon saved." });
    },
    onError: () => toast.push({ message: "Could not save the coupon. The code may already be in use.", tone: "error" }),
  });
  const remove = useMutation({
    mutationFn: (code) => plansApi.deleteCoupon(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-coupons"] }),
  });

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (checked.ok) save.mutate(checked.data);
  };

  const err = (name) =>
    errors[name] ? (
      <span className="field__error" id={`coupon-${name}-error`} role="alert">
        {errors[name]}
      </span>
    ) : null;
  const inv = (name) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `coupon-${name}-error` } : {});

  return (
    <section className="panel" aria-label="Coupons">
      <div className="panel__header">
        <h3>Coupons</h3>
        <span className="plans-preview__note">Stored here. Applied to payments by the payments step.</span>
      </div>
      <form className="plans-coupon-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="coupon-code">Code</label>
          <input id="coupon-code" value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} {...inv("code")} />
          {err("code")}
        </div>
        <div className="field">
          <label htmlFor="coupon-kind">Type</label>
          <select id="coupon-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="percent">Percent off</option>
            <option value="fixed">KES off</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="coupon-value">{form.kind === "percent" ? "Percent" : "Amount (KES)"}</label>
          <input id="coupon-value" inputMode="numeric" value={form.value} onChange={(e) => set({ value: e.target.value })} {...inv("value")} />
          {err("value")}
        </div>
        <div className="field">
          <label htmlFor="coupon-category">Category</label>
          <select id="coupon-category" value={form.scopeCategory ?? ""} onChange={(e) => set({ scopeCategory: e.target.value || null })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="coupon-plan">Plan</label>
          <select id="coupon-plan" value={form.scopePlan ?? ""} onChange={(e) => set({ scopePlan: e.target.value || null })}>
            <option value="">Both plans</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="coupon-from">Valid from</label>
          <input id="coupon-from" type="date" value={form.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="coupon-until">Valid until</label>
          <input id="coupon-until" type="date" value={form.validUntil} onChange={(e) => set({ validUntil: e.target.value })} {...inv("validUntil")} />
          {err("validUntil")}
        </div>
        <div className="field">
          <label htmlFor="coupon-max">Redemption cap (blank = none)</label>
          <input
            id="coupon-max"
            inputMode="numeric"
            value={form.maxRedemptions ?? ""}
            onChange={(e) => set({ maxRedemptions: e.target.value === "" ? null : e.target.value })}
            {...inv("maxRedemptions")}
          />
          {err("maxRedemptions")}
        </div>
        <label className="plans-inline">
          <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Active
        </label>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save coupon
        </Button>
      </form>

      {list.isLoading ? <p role="status">Loading coupons…</p> : null}
      {list.isError ? <p role="alert">Could not load coupons.</p> : null}
      {list.data && list.data.length === 0 ? <p>No coupons yet.</p> : null}
      {list.data?.length ? (
        <div className="plans-scroll">
          <table className="plans-limits">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Discount</th>
                <th scope="col">Scope</th>
                <th scope="col">Valid</th>
                <th scope="col">Used</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="plans-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.code}>
                  <th scope="row">{c.code}</th>
                  <td>{describe(c)}</td>
                  <td>
                    {c.scopeCategory ? categories.find((x) => x.id === c.scopeCategory)?.name ?? c.scopeCategory : "All categories"}, {c.scopePlan ?? "both plans"}
                  </td>
                  <td>{c.validFrom || "any"} to {c.validUntil || "no end"}</td>
                  <td>
                    {c.redeemed}
                    {c.maxRedemptions ? ` of ${c.maxRedemptions}` : ""}
                  </td>
                  <td>{c.active ? "Active" : "Paused"}</td>
                  <td>
                    <Button size="sm" onClick={() => { setForm({ ...c, validFrom: c.validFrom ?? "", validUntil: c.validUntil ?? "" }); setTouched(false); }}>
                      Edit
                    </Button>{" "}
                    <Button size="sm" onClick={() => remove.mutate(c.code)} aria-label={`Delete coupon ${c.code}`}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
