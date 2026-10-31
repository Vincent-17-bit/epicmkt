export const WEEKDAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
];

export const toMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const fromMinutes = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export const slotsOverlap = (a, b) => {
  if (a.day_of_week !== b.day_of_week) return false;
  return toMinutes(a.start_time) < toMinutes(b.end_time) && toMinutes(b.start_time) < toMinutes(a.end_time);
};

export const findTrainerConflict = (slots, draft) => {
  if (!draft.staff_id) return null;
  return slots.find((s) => s.id !== draft.id && s.staff_id === draft.staff_id && slotsOverlap(s, draft)) ?? null;
};

export const validateSlotDraft = (draft, slots = [], staff = []) => {
  const errors = {};
  const name = String(draft.class_name ?? "").trim();
  if (name.length < 2 || name.length > 80) errors.class_name = "Class name needs 2 to 80 characters";
  if (!Number.isInteger(Number(draft.day_of_week)) || draft.day_of_week < 1 || draft.day_of_week > 7) errors.day_of_week = "Choose a day";
  const a = toMinutes(draft.start_time);
  const b = toMinutes(draft.end_time);
  if (a === null) errors.start_time = "Choose a start time";
  if (b === null) errors.end_time = "Choose an end time";
  if (a !== null && b !== null && b <= a) errors.end_time = "End must be after the start";
  if (draft.staff_id && !staff.some((s) => s.id === draft.staff_id)) errors.staff_id = "Choose a trainer from your team";
  if (!Object.keys(errors).length && findTrainerConflict(slots, draft)) errors.staff_id = "This trainer already has a class at this time";
  return errors;
};

export const validateStaffDraft = (draft) => {
  const errors = {};
  const name = String(draft.name ?? "").trim();
  if (name.length < 2 || name.length > 80) errors.name = "Name needs 2 to 80 characters";
  if (String(draft.role ?? "").length > 60) errors.role = "Keep the role under 60 characters";
  const list = draft.specialties ?? [];
  if (list.length > 10) errors.specialties = "Add up to 10 specialties";
  else if (list.some((s) => String(s).length > 40)) errors.specialties = "Keep each specialty under 40 characters";
  return errors;
};

export const parseSpecialties = (text) =>
  [...new Set(String(text ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 10);

export const timetableByDay = (slots, staff = []) => {
  const names = new Map(staff.map((s) => [s.id, s.name]));
  return WEEKDAYS.map((d) => ({
    ...d,
    slots: slots
      .filter((s) => s.day_of_week === d.value)
      .sort((x, y) => toMinutes(x.start_time) - toMinutes(y.start_time))
      .map((s) => ({ ...s, trainer: names.get(s.staff_id) ?? null })),
  }));
};
