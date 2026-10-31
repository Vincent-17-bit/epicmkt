import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WEEKDAYS, parseSpecialties, teamCapabilities, timetableByDay, validateSlotDraft, validateStaffDraft } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { mediaUrl } from "../../api/shape.js";
import Dialog from "../../components/Dialog.jsx";
import { errorText } from "../../lib/errors.js";
import { showToast } from "../../state/toast.js";
import ui from "../../styles/ui.module.css";
import styles from "./team.module.css";

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const ACCEPT = "image/jpeg,image/png,image/webp";

function Field({ id, label, error, children }) {
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>{label}</label>
      {children}
      {error && <p className={ui.error} role="alert">{error}</p>}
    </div>
  );
}

function StaffDialog({ open, member, items, premium, onClose, onSaved }) {
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState(member?.role ?? "");
  const [specialties, setSpecialties] = useState((member?.specialties ?? []).join(", "));
  const [photoPath, setPhotoPath] = useState(member?.photoPath ?? null);
  const [serviceIds, setServiceIds] = useState(member?.serviceIds ?? []);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      setPhotoPath((await api.uploadStaffPhoto(file)).path);
    } catch (e) {
      showToast(errorText(e));
    }
    setBusy(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const draft = { name, role, specialties: parseSpecialties(specialties) };
    const found = validateStaffDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api.saveStaff(member?.id ?? null, { ...draft, photoPath, serviceIds: premium ? serviceIds : undefined });
      onSaved();
      onClose();
    } catch (err) {
      showToast(errorText(err));
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={onClose} title={member ? "Edit team member" : "Add team member"}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.photoRow}>
          {photoPath ? <img className={styles.avatar} src={mediaUrl(photoPath)} alt="" /> : <span className={styles.initials} aria-hidden="true">{initials(name || "?")}</span>}
          <input ref={fileRef} className={ui.srOnly} type="file" accept={ACCEPT} aria-label="Choose photo" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={() => fileRef.current?.click()}>{photoPath ? "Change photo" : "Add photo"}</button>
          {photoPath && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setPhotoPath(null)}>Remove photo</button>}
        </div>
        <Field id="staff-name" label="Name" error={errors.name}>
          <input id="staff-name" className={ui.input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="staff-role" label="Role (optional)" error={errors.role}>
          <input id="staff-role" className={ui.input} value={role} maxLength={60} onChange={(e) => setRole(e.target.value)} />
        </Field>
        <Field id="staff-spec" label="Specialties, separated by commas (optional)" error={errors.specialties}>
          <input id="staff-spec" className={ui.input} value={specialties} onChange={(e) => setSpecialties(e.target.value)} />
        </Field>
        {premium ? (
          items.length > 0 && (
            <fieldset className={styles.services}>
              <legend className={ui.label}>Services this person does</legend>
              {items.map((i) => (
                <label key={i.id} className={styles.check}>
                  <input type="checkbox" checked={serviceIds.includes(i.id)} onChange={(e) => setServiceIds(e.target.checked ? [...serviceIds, i.id] : serviceIds.filter((x) => x !== i.id))} />
                  {i.name}
                </label>
              ))}
            </fieldset>
          )
        ) : (
          <p className={ui.muted}>Linking team members to services is a Premium feature.</p>
        )}
        <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save"}</button>
      </form>
    </Dialog>
  );
}

function SlotDialog({ open, slot, day, slots, staff, onClose, onSaved }) {
  const [className, setClassName] = useState(slot?.className ?? "");
  const [dayOfWeek, setDay] = useState(slot?.dayOfWeek ?? day);
  const [startTime, setStart] = useState(slot?.startTime ?? "09:00");
  const [endTime, setEnd] = useState(slot?.endTime ?? "10:00");
  const [staffId, setStaff] = useState(slot?.staffId ?? "");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const draft = { id: slot?.id, class_name: className, day_of_week: Number(dayOfWeek), start_time: startTime, end_time: endTime, staff_id: staffId || null };
    const found = validateSlotDraft(draft, slots.map((s) => ({ id: s.id, day_of_week: s.dayOfWeek, start_time: s.startTime, end_time: s.endTime, staff_id: s.staffId })), staff);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api.saveSlot(slot?.id ?? null, { className, dayOfWeek, startTime, endTime, staffId });
      onSaved();
      onClose();
    } catch (err) {
      showToast(errorText(err));
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteSlot(slot.id);
      onSaved();
      onClose();
    } catch (err) {
      showToast(errorText(err));
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} onClose={onClose} title={slot ? "Edit class" : "Add class"}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <Field id="slot-name" label="Class name" error={errors.class_name}>
          <input id="slot-name" className={ui.input} value={className} maxLength={80} onChange={(e) => setClassName(e.target.value)} />
        </Field>
        <Field id="slot-day" label="Day" error={errors.day_of_week}>
          <select id="slot-day" className={ui.input} value={dayOfWeek} onChange={(e) => setDay(Number(e.target.value))}>
            {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Field>
        <Field id="slot-start" label="Starts" error={errors.start_time}>
          <input id="slot-start" className={ui.input} type="time" value={startTime} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field id="slot-end" label="Ends" error={errors.end_time}>
          <input id="slot-end" className={ui.input} type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field id="slot-staff" label="Trainer (optional)" error={errors.staff_id}>
          <select id="slot-staff" className={ui.input} value={staffId} onChange={(e) => setStaff(e.target.value)}>
            <option value="">No trainer</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className={styles.row}>
          <button type="submit" className={ui.btn} disabled={busy}>{busy ? "Saving" : "Save"}</button>
          {slot && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={busy} onClick={remove}>Delete class</button>}
        </div>
      </form>
    </Dialog>
  );
}

export default function Team() {
  const qc = useQueryClient();
  const sub = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription });
  const staff = useQuery({ queryKey: ["staff"], queryFn: api.listStaff });
  const items = useQuery({ queryKey: ["items"], queryFn: api.listItems });
  const business = sub.data?.business;
  const caps = teamCapabilities(business?.planKey, business?.categoryId);
  const readOnly = business?.status === "suspended";
  const slots = useQuery({ queryKey: ["timetable"], queryFn: api.listTimetable, enabled: caps.timetableCategory });
  const [tab, setTab] = useState("staff");
  const [staffDialog, setStaffDialog] = useState({ open: false, member: null });
  const [slotDialog, setSlotDialog] = useState({ open: false, slot: null, day: 1 });
  const [confirm, setConfirm] = useState(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["staff"] });
    qc.invalidateQueries({ queryKey: ["timetable"] });
  };

  if (sub.isPending || staff.isPending) return <div className={ui.page}><p className={ui.muted}>Loading your team…</p></div>;

  const staffList = staff.data ?? [];
  const slotList = slots.data ?? [];
  const itemList = items.data ?? [];
  const canEditSlots = caps.timetable && !readOnly;
  const days = timetableByDay(slotList.map((s) => ({ ...s, day_of_week: s.dayOfWeek, start_time: s.startTime, end_time: s.endTime, class_name: s.className, staff_id: s.staffId })), staffList);

  const del = async (m) => {
    try {
      await api.deleteStaff(m.id);
      showToast("Team member deleted");
    } catch (e) {
      showToast(errorText(e));
    }
    setConfirm(null);
    refresh();
  };

  return (
    <div className={ui.page}>
      <header className={`${ui.pageHead} ${styles.head}`}>
        <h1>Team and schedule</h1>
        {caps.timetableCategory && (
          <div className={styles.tabs} role="tablist" aria-label="Team sections">
            <button type="button" role="tab" className={styles.tab} aria-selected={tab === "staff"} onClick={() => setTab("staff")}>Staff</button>
            <button type="button" role="tab" className={styles.tab} aria-selected={tab === "timetable"} onClick={() => setTab("timetable")}>Timetable</button>
          </div>
        )}
      </header>
      {readOnly && <div className={`${ui.banner} ${ui.tone_warning}`}><p>Your account is suspended, so this page is read only.</p></div>}

      {tab === "staff" && (
        <section className={styles.section} aria-label="Staff">
          {!readOnly && <div><button type="button" className={ui.btn} onClick={() => setStaffDialog({ open: true, member: null })}>Add team member</button></div>}
          {!staffList.length ? (
            <section className={ui.card}>
              <h2>No team members yet</h2>
              <p className={ui.muted}>Introduce the people customers will meet, with a photo and what each one does best.</p>
            </section>
          ) : (
            <ul className={styles.list}>
              {staffList.map((m) => {
                const services = m.serviceIds.map((id) => itemList.find((i) => i.id === id)?.name).filter(Boolean);
                return (
                  <li key={m.id} className={styles.card}>
                    <div className={styles.person}>
                      {m.photoPath ? <img className={styles.avatar} src={mediaUrl(m.photoPath)} alt="" /> : <span className={styles.initials} aria-hidden="true">{initials(m.name)}</span>}
                      <div>
                        <h3 className={styles.name}>{m.name}</h3>
                        {m.role && <p className={ui.muted}>{m.role}</p>}
                      </div>
                    </div>
                    {m.adminState !== "ok" && <p className={ui.error}>{m.adminState === "removed" ? "Removed by EpicMKT" : "Hidden by EpicMKT"}{m.adminReason ? `: ${m.adminReason}` : ""}.</p>}
                    {m.specialties.length > 0 && <div className={ui.chips}>{m.specialties.map((s) => <span key={s} className={ui.pill}>{s}</span>)}</div>}
                    {caps.services && services.length > 0 && <p className={ui.muted}>Services: {services.join(", ")}</p>}
                    {!readOnly && (
                      <div className={styles.row}>
                        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setStaffDialog({ open: true, member: m })}>Edit</button>
                        {confirm === m.id ? (
                          <>
                            <button type="button" className={ui.btn} onClick={() => del(m)}>Yes, delete {m.name}</button>
                            <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setConfirm(null)}>Keep</button>
                          </>
                        ) : (
                          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => setConfirm(m.id)}>Delete</button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "timetable" && (
        <section className={styles.section} aria-label="Timetable">
          {!caps.timetable && <div className={`${ui.banner} ${ui.tone_info}`}><p>The weekly class timetable is a Premium feature.</p></div>}
          {canEditSlots && <div><button type="button" className={ui.btn} onClick={() => setSlotDialog({ open: true, slot: null, day: 1 })}>Add class</button></div>}
          {!slotList.length ? (
            <section className={ui.card}>
              <h2>No classes yet</h2>
              <p className={ui.muted}>Add classes with a day, time and trainer. Customers see the weekly timetable on your page.</p>
            </section>
          ) : (
            <div className={styles.week}>
              {days.map((d) => (
                <div key={d.value} className={styles.day}>
                  <h3 className={styles.name}>{d.label}</h3>
                  {d.slots.map((s) => {
                    const body = (
                      <>
                        <span className={styles.slotTime}>{s.start_time.slice(0, 5)} to {s.end_time.slice(0, 5)}</span>
                        <span>{s.class_name}</span>
                        {s.trainer && <span className={ui.muted}>{s.trainer}</span>}
                      </>
                    );
                    return canEditSlots ? (
                      <button key={s.id} type="button" className={styles.slot} onClick={() => setSlotDialog({ open: true, slot: slotList.find((x) => x.id === s.id), day: d.value })}>{body}</button>
                    ) : (
                      <div key={s.id} className={styles.slot}>{body}</div>
                    );
                  })}
                  {!d.slots.length && <p className={ui.muted}>No classes</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <StaffDialog key={`${staffDialog.member?.id ?? "new"}-${staffDialog.open}`} open={staffDialog.open} member={staffDialog.member} items={itemList} premium={caps.services} onSaved={refresh} onClose={() => setStaffDialog({ open: false, member: null })} />
      <SlotDialog key={`${slotDialog.slot?.id ?? "new"}-${slotDialog.open}`} open={slotDialog.open} slot={slotDialog.slot} day={slotDialog.day} slots={slotList} staff={staffList} onSaved={refresh} onClose={() => setSlotDialog({ open: false, slot: null, day: 1 })} />
    </div>
  );
}
