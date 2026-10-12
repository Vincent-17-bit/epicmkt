import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { promoErrorMessage, timetableByDay } from "@epicmkt/shared";
import { promo } from "../../api/promo/index.js";
import { Button, Chip, EmptyState, ModerationNote, UpgradePrompt } from "../../components/ui.jsx";
import { toast } from "../../components/toast.js";
import { useItems, useWorkspace } from "../../lib/workspace.js";
import StaffForm from "./StaffForm.jsx";
import SlotForm from "./SlotForm.jsx";
import styles from "./team.module.css";

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

function StaffCard({ member, items, premium, readOnly, onEdit, onDelete }) {
  const services = (member.service_ids ?? []).map((id) => items.find((i) => i.id === id)?.name).filter(Boolean);
  return (
    <li className={styles.card}>
      <div className={styles.person}>
        {member.photo_url ? <img className={styles.avatar} src={member.photo_url} alt="" /> : <span className={styles.initials} aria-hidden="true">{initials(member.name)}</span>}
        <div>
          <h3 className={styles.name}>{member.name}</h3>
          {member.role && <p className={styles.meta}>{member.role}</p>}
        </div>
      </div>
      <ModerationNote row={member} />
      {member.specialties.length > 0 && <div className={styles.chips}>{member.specialties.map((s) => <Chip key={s} tone="primary">{s}</Chip>)}</div>}
      {premium && services.length > 0 && <p className={styles.meta}>Services: {services.join(", ")}</p>}
      {!readOnly && (
        <div className={styles.actions}>
          <Button size="sm" icon={faPen} onClick={() => onEdit(member)}>Edit</Button>
          <Button size="sm" variant="danger" icon={faTrash} onClick={() => onDelete(member)}>Delete</Button>
        </div>
      )}
    </li>
  );
}

export default function TeamPage() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const items = useItems();
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => promo.listStaff() });
  const slots = useQuery({ queryKey: ["slots"], queryFn: () => promo.listSlots(), enabled: ws.caps.timetableCategory });
  const [tab, setTab] = useState("staff");
  const [staffDialog, setStaffDialog] = useState({ open: false, member: null });
  const [slotDialog, setSlotDialog] = useState({ open: false, slot: null, day: 1 });

  const del = useMutation({
    mutationFn: (m) => promo.deleteStaff(m.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
      toast("Team member deleted");
    },
    onError: (e) => toast(promoErrorMessage(e, ws.plan, ws.global)),
  });

  if (ws.isPending) return null;

  const itemList = items.data ?? [];
  const staffList = staff.data ?? [];
  const slotList = slots.data ?? [];
  const showTabs = ws.caps.timetableCategory;
  const canEditSlots = ws.caps.timetable && !ws.readOnly;
  const days = timetableByDay(slotList, staffList);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Team and schedule</h1>
        {showTabs && (
          <div className={styles.tabs} role="tablist" aria-label="Team sections">
            <button type="button" role="tab" className={styles.tab} aria-selected={tab === "staff"} onClick={() => setTab("staff")}>Staff</button>
            <button type="button" role="tab" className={styles.tab} aria-selected={tab === "timetable"} onClick={() => setTab("timetable")}>Timetable</button>
          </div>
        )}
      </div>

      {tab === "staff" && (
        <section className={styles.page} aria-label="Staff">
          {!ws.readOnly && <div><Button variant="primary" icon={faPlus} onClick={() => setStaffDialog({ open: true, member: null })}>Add team member</Button></div>}
          {!staffList.length ? (
            <EmptyState title="No team members yet" action={!ws.readOnly && <Button icon={faPlus} onClick={() => setStaffDialog({ open: true, member: null })}>Add your first team member</Button>}>
              Introduce the people customers will meet, with a photo and what each one does best.
            </EmptyState>
          ) : (
            <ul className={styles.list}>
              {staffList.map((m) => (
                <StaffCard key={m.id} member={m} items={itemList} premium={ws.premium} readOnly={ws.readOnly} onEdit={(member) => setStaffDialog({ open: true, member })} onDelete={(x) => del.mutate(x)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "timetable" && (
        <section className={styles.page} aria-label="Timetable">
          {!ws.premium && <UpgradePrompt>The weekly class timetable is a Premium feature.</UpgradePrompt>}
          {canEditSlots && <div><Button variant="primary" icon={faPlus} onClick={() => setSlotDialog({ open: true, slot: null, day: 1 })}>Add class</Button></div>}
          {!slotList.length ? (
            <EmptyState title="No classes yet">Add classes with a day, time and trainer. Customers see the weekly timetable on your page.</EmptyState>
          ) : (
            <div className={styles.grid}>
              {days.map((d) => (
                <div key={d.value} className={styles.day}>
                  <h3 className={styles.dayName}>{d.label}</h3>
                  {d.slots.map((s) => {
                    const body = (
                      <>
                        <span className={styles.slotTime}>{s.start_time.slice(0, 5)} to {s.end_time.slice(0, 5)}</span>
                        <span className={styles.slotName}>{s.class_name}</span>
                        {s.trainer && <span className={styles.slotTrainer}>{s.trainer}</span>}
                      </>
                    );
                    return canEditSlots ? (
                      <button key={s.id} type="button" className={styles.slot} onClick={() => setSlotDialog({ open: true, slot: s, day: d.value })}>{body}</button>
                    ) : (
                      <div key={s.id} className={styles.slot}>{body}</div>
                    );
                  })}
                  {!d.slots.length && <p className={styles.meta}>No classes</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <StaffForm open={staffDialog.open} member={staffDialog.member} items={itemList} plan={ws.plan} premium={ws.premium} global={ws.global} onClose={() => setStaffDialog({ open: false, member: null })} />
      <SlotForm open={slotDialog.open} slot={slotDialog.slot} day={slotDialog.day} slots={slotList} staff={staffList} plan={ws.plan} global={ws.global} onClose={() => setSlotDialog({ open: false, slot: null, day: 1 })} />
    </div>
  );
}
