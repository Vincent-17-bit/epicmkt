import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AMENITIES, LANGUAGES, LIMITS, PAYMENT_METHODS, SOCIAL_KEYS, announcementProblem, isHandle, mergeProfile, normalizeHandle, profileProblems, validateAttributes,
} from "@epicmkt/shared";
import { mediaUrl, updateProfile, uploadMedia } from "../../api/index.js";
import { useSection } from "../../lib/useSection.js";
import ImageField from "./ImageField.jsx";
import SectionCard from "./SectionCard.jsx";
import { cleanAttributes, TemplateEditor, TemplateView } from "./TemplateFields.jsx";
import { ChipPicker, Counter, Dl, Field, FieldGroup, TokenInput, UpgradePrompt } from "./ui.jsx";

const lastEdited = (business, section) => business.profile?.section_updated?.[section] ?? null;
const text = (v) => (v == null ? "" : String(v));

/** Save part of the profile: column changes plus profile keys, stamping the section's "last updated". */
function useProfileSave(business, section) {
  const qc = useQueryClient();
  return useCallback(async (columns = {}, profile = {}) => {
    const patch = { ...columns, profile: mergeProfile(business.profile, profile, section) };
    const row = await updateProfile(patch);
    qc.setQueryData(["business"], row);
    return row;
  }, [business.profile, qc, section]);
}

const trimOrNull = (v) => text(v).trim() || null;

/** A card whose editor is made of fields; View is shown until Edit. */
function EditableCard({ id, business, title, description, premium, section, view, editor, ...rest }) {
  return (
    <SectionCard
      id={id} title={title} description={description} premium={premium}
      lastUpdated={lastEdited(business, section ?? id)}
      editing={rest.editing} onEdit={rest.start} onCancel={rest.cancel} onSave={rest.submit}
      canSave={rest.dirty && !rest.hasErrors} saving={rest.saving} error={rest.error}
    >
      {rest.editing ? editor : view}
    </SectionCard>
  );
}

export function BasicsCard({ business }) {
  const initial = { tagline: text(business.tagline), description: text(business.description), year: text(business.profile?.year_established) };
  const save = useProfileSave(business, "basics");
  const s = useSection({
    id: "basics", initial,
    validate: useCallback((d) => {
      const p = profileProblems({ tagline: d.tagline, description: d.description, profile: { year_established: d.year } });
      return { ...(p.tagline && { tagline: p.tagline }), ...(p.description && { description: p.description }), ...(p.year_established && { year: p.year_established }) };
    }, []),
    save: (d) => save({ tagline: trimOrNull(d.tagline), description: trimOrNull(d.description) }, { year_established: d.year === "" ? null : Number(d.year) }),
  });
  return (
    <EditableCard
      id="basics" business={business} title="Tagline, description and year" description="What customers read first." {...s}
      view={<Dl rows={[["Tagline", business.tagline], ["Description", business.description && <span className="sx-pre">{business.description}</span>], ["Year established", business.profile?.year_established]]} />}
      editor={(
        <>
          <Field label="Tagline" error={s.errors.tagline} counter={<Counter value={s.draft.tagline} max={LIMITS.tagline} />}>
            <input value={s.draft.tagline} onChange={(e) => s.set("tagline", e.target.value)} />
          </Field>
          <Field label="Description" error={s.errors.description} counter={<Counter value={s.draft.description} max={LIMITS.description} />}>
            <textarea rows={7} value={s.draft.description} onChange={(e) => s.set("description", e.target.value)} />
          </Field>
          <Field label="Year established" error={s.errors.year}>
            <input inputMode="numeric" maxLength={4} value={s.draft.year} onChange={(e) => s.set("year", e.target.value.replace(/\D/g, ""))} />
          </Field>
        </>
      )}
    />
  );
}

const SLOTS = [
  { key: "logo", label: "Logo", kind: "logo", aspect: 1, outW: 512, outH: 512, shape: "square", hint: "Square. Shown on cards and search results." },
  { key: "cover", label: "Cover photo", kind: "cover", aspect: 8 / 3, outW: 1600, outH: 600, shape: "wide", hint: "Wide. Shown at the top of your page." },
  { key: "shop", label: "Shop-front photo", kind: "shopfront", aspect: 4 / 3, outW: 1200, outH: 900, shape: "photo", hint: "A clear photo of your entrance, so customers can spot you." },
];

export function ImagesCard({ business }) {
  const save = useProfileSave(business, "images");
  const paths = { logo: business.logo_path, cover: business.cover_path, shop: business.profile?.shopfront_path };
  const s = useSection({
    id: "images", initial: { logo: null, cover: null, shop: null },
    save: async (d) => {
      const next = {};
      for (const slot of SLOTS) {
        const v = d[slot.key];
        if (v === "remove") next[slot.key] = null;
        else if (v) next[slot.key] = await uploadMedia({ businessId: business.id, kind: slot.kind, blob: v.blob });
      }
      await save(
        { ...("logo" in next && { logo_path: next.logo }), ...("cover" in next && { cover_path: next.cover }) },
        "shop" in next ? { shopfront_path: next.shop } : {}
      );
    },
  });
  const thumbs = (
    <div className="sx-thumbs">
      {SLOTS.map((slot) => (
        <figure key={slot.key} className={`sx-image sx-image--${slot.shape}`}>
          {mediaUrl(paths[slot.key]) ? <img src={mediaUrl(paths[slot.key])} alt={slot.label} /> : <span className="sx-muted">{slot.label}: none yet</span>}
        </figure>
      ))}
    </div>
  );
  return (
    <EditableCard
      id="images" business={business} title="Logo and photos" description="Square logo, wide cover and a shop-front photo. You choose the crop." {...s}
      view={thumbs}
      editor={SLOTS.map((slot) => (
        <ImageField
          key={slot.key} label={slot.label} hint={slot.hint} shape={slot.shape} aspect={slot.aspect} outW={slot.outW} outH={slot.outH}
          currentUrl={mediaUrl(paths[slot.key])} value={s.draft[slot.key]} onChange={(v) => s.set(slot.key, v)}
        />
      ))}
    />
  );
}

export function ContactCard({ business }) {
  const initial = { address: text(business.address), whatsapp: text(business.whatsapp), email: text(business.email), website: text(business.profile?.website) };
  const save = useProfileSave(business, "contact");
  const s = useSection({
    id: "contact", initial,
    validate: useCallback((d) => profileProblems({ address: d.address, whatsapp: d.whatsapp, email: d.email, profile: { website: d.website } }), []),
    save: (d) => save({ address: trimOrNull(d.address), whatsapp: trimOrNull(d.whatsapp), email: trimOrNull(d.email) }, { website: trimOrNull(d.website) }),
  });
  return (
    <EditableCard
      id="contact" business={business} title="Address, WhatsApp, email and website" {...s}
      view={<Dl rows={[["Address or landmark", business.address], ["WhatsApp", business.whatsapp], ["Email", business.email], ["Website", business.profile?.website]]} />}
      editor={(
        <>
          <Field label="Address or landmark" error={s.errors.address} hint="For example: Ground floor, Kenya Cinema Plaza, next to Total.">
            <input value={s.draft.address} maxLength={LIMITS.addressLine} onChange={(e) => s.set("address", e.target.value)} />
          </Field>
          <Field label="WhatsApp number" error={s.errors.whatsapp}>
            <input type="tel" inputMode="tel" value={s.draft.whatsapp} onChange={(e) => s.set("whatsapp", e.target.value)} />
          </Field>
          <Field label="Email" error={s.errors.email}>
            <input type="email" autoComplete="email" value={s.draft.email} onChange={(e) => s.set("email", e.target.value)} />
          </Field>
          <Field label="Website" error={s.errors.website} hint="Start with https://">
            <input type="url" value={s.draft.website} onChange={(e) => s.set("website", e.target.value)} />
          </Field>
        </>
      )}
    />
  );
}

const SOCIAL_LABELS = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", x: "X" };

export function SocialsCard({ business }) {
  const initial = Object.fromEntries(SOCIAL_KEYS.map((k) => [k, text(business.socials?.[k])]));
  const save = useProfileSave(business, "socials");
  const s = useSection({
    id: "socials", initial,
    validate: useCallback((d) => Object.fromEntries(SOCIAL_KEYS.filter((k) => normalizeHandle(d[k]) && !isHandle(normalizeHandle(d[k]))).map((k) => [k, "Use your handle or profile link"])), []),
    save: (d) => {
      const socials = { ...business.socials };
      for (const k of SOCIAL_KEYS) {
        const h = normalizeHandle(d[k]);
        if (h) socials[k] = h;
        else delete socials[k];
      }
      return save({ socials });
    },
  });
  return (
    <EditableCard
      id="socials" business={business} title="Social media" description="Handles or profile links." {...s}
      view={<Dl rows={SOCIAL_KEYS.map((k) => [SOCIAL_LABELS[k], business.socials?.[k] && `@${business.socials[k]}`])} />}
      editor={SOCIAL_KEYS.map((k) => (
        <Field key={k} label={SOCIAL_LABELS[k]} error={s.errors[k]}>
          <input value={s.draft[k]} placeholder="@yourname" autoCapitalize="none" onChange={(e) => s.set(k, e.target.value)} />
        </Field>
      ))}
    />
  );
}

function ListCard({ business, id, title, description, options, column, profileKey, hint, max, allowCustom = true }) {
  const stored = (column ? business[column] : business.profile?.[profileKey]) ?? [];
  const save = useProfileSave(business, id);
  const s = useSection({
    id, initial: { list: stored },
    validate: useCallback((d) => {
      const p = profileProblems(column ? { [column]: d.list } : { profile: { [profileKey]: d.list } });
      const m = p[column ?? profileKey];
      return m ? { list: m } : {};
    }, [column, profileKey]),
    save: (d) => (column ? save({ [column]: d.list }) : save({}, { [profileKey]: d.list })),
  });
  return (
    <EditableCard
      id={id} business={business} title={title} description={description} {...s}
      view={stored.length ? <ul className="sx-chips">{stored.map((x) => <li key={x} className="sx-token">{x}</li>)}</ul> : <p className="sx-muted">Nothing chosen yet.</p>}
      editor={(
        <FieldGroup label={title} hint={hint} error={s.errors.list}>
          <ChipPicker options={options} value={s.draft.list} onChange={(v) => s.set("list", v)} max={max} allowCustom={allowCustom} />
        </FieldGroup>
      )}
    />
  );
}

export const LanguagesCard = ({ business }) => (
  <ListCard business={business} id="languages" title="Languages spoken" profileKey="languages" options={LANGUAGES} max={LIMITS.languages} description="So customers know they can be served in their language." />
);
export const AmenitiesCard = ({ business }) => (
  <ListCard business={business} id="amenities" title="Amenities" column="amenities" options={AMENITIES} max={LIMITS.listItems} />
);
export const PaymentsCard = ({ business }) => (
  <ListCard business={business} id="payments" title="Payment methods accepted" column="payment_methods" options={PAYMENT_METHODS} max={LIMITS.listItems}
    description="For information only. EpicMKT does not process payments between you and your customers." hint="This is shown on your page so customers know how they can pay you." />
);

export function DeliveryCard({ business }) {
  const save = useProfileSave(business, "delivery");
  const s = useSection({
    id: "delivery", initial: { area: text(business.delivery_area) },
    validate: useCallback((d) => profileProblems({ delivery_area: d.area }).delivery_area ? { area: profileProblems({ delivery_area: d.area }).delivery_area } : {}, []),
    save: (d) => save({ delivery_area: trimOrNull(d.area) }),
  });
  return (
    <EditableCard
      id="delivery" business={business} title="Delivery or service area" section="delivery" {...s}
      view={<p className="sx-value">{business.delivery_area ?? <span className="sx-muted">Not set</span>}</p>}
      editor={(
        <Field label="Where do you deliver or serve?" error={s.errors.area} counter={<Counter value={s.draft.area} max={LIMITS.deliveryArea} />} hint="For example: Within Kisumu town, free delivery above KES 2,000.">
          <textarea rows={3} value={s.draft.area} onChange={(e) => s.set("area", e.target.value)} />
        </Field>
      )}
    />
  );
}

export function CategoryDetailsCard({ business, categories }) {
  const fields = categories.find((c) => c.id === business.category_id)?.template ?? [];
  const attributes = business.profile?.attributes ?? {};
  const save = useProfileSave(business, "details");
  const s = useSection({
    id: "details", initial: { attributes },
    validate: useCallback((d) => validateAttributes(fields, cleanAttributes(d.attributes)), [fields]),
    save: (d) => save({}, { attributes: cleanAttributes(d.attributes) }),
  });
  if (!fields.length) return null;
  return (
    <EditableCard
      id="details" business={business} title="Details for your category" description="Questions that customers of this kind of business care about." section="details" {...s}
      view={<TemplateView fields={fields} value={attributes} />}
      editor={<TemplateEditor fields={fields} value={s.draft.attributes} onChange={(v) => s.set("attributes", v)} errors={s.errors} />}
    />
  );
}

export function TagsCard({ business }) {
  const save = useProfileSave(business, "tags");
  const s = useSection({
    id: "tags", initial: { tags: business.tags ?? [] },
    save: (d) => save({ tags: d.tags }),
  });
  return (
    <EditableCard
      id="tags" business={business} title="Tags" description="Words customers might search for, like “fade” or “kids”." {...s}
      view={business.tags?.length ? <ul className="sx-chips">{business.tags.map((t) => <li key={t} className="sx-token">{t}</li>)}</ul> : <p className="sx-muted">No tags yet.</p>}
      editor={<FieldGroup label="Tags" hint={`Up to ${LIMITS.tags}. Press Enter after each one.`}><TokenInput value={s.draft.tags} onChange={(v) => s.set("tags", v)} max={LIMITS.tags} length={LIMITS.tagLength} /></FieldGroup>}
    />
  );
}

export function AnnouncementCard({ business, upgradePrice }) {
  const premium = business.plan_key === "premium";
  const save = useProfileSave(business, "announcement");
  const s = useSection({
    id: "announcement", initial: { text: text(business.announcement) },
    validate: useCallback((d) => (announcementProblem(d.text) ? { text: announcementProblem(d.text) } : {}), []),
    save: (d) => save({ announcement: trimOrNull(d.text) }),
  });
  if (!premium) {
    return (
      <section className="sx-card sx-card--locked" id="announcement" aria-labelledby="announcement-title">
        <header className="sx-card__head"><h2 id="announcement-title">Announcement banner</h2></header>
        <p className="sx-muted">A short notice shown at the top of your page, like “Open late this Friday”.</p>
        {business.announcement && <p className="sx-value">Currently set: {business.announcement}</p>}
        <UpgradePrompt price={upgradePrice}>The announcement banner is part of the Premium plan.</UpgradePrompt>
      </section>
    );
  }
  return (
    <EditableCard
      id="announcement" business={business} title="Announcement banner" premium description="A short notice at the top of your page. No links, email addresses or phone numbers." {...s}
      view={<p className="sx-value">{business.announcement ?? <span className="sx-muted">No banner showing.</span>}</p>}
      editor={(
        <Field label="Banner text" error={s.errors.text} counter={<Counter value={s.draft.text} max={LIMITS.announcement} />} hint="Leave empty to hide the banner.">
          <textarea rows={2} value={s.draft.text} onChange={(e) => s.set("text", e.target.value)} />
        </Field>
      )}
    />
  );
}
