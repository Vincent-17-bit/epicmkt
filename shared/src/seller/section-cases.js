// Shared decision table for section rename and remove. shared tests run it through the JS planners and the
// database tests run the same rows through the SQL functions, so the two cannot drift apart unnoticed.
// items: the section value of each item before; after: the expected value after (null = no section).
export const SECTION_CASES = [
  { op: "rename", list: ["Cuts", "Braids", "Wigs"], args: ["Braids", "Plaits"], items: ["Braids", "Cuts", "Braids", null], after: ["Plaits", "Cuts", "Plaits", null], sections: ["Cuts", "Plaits", "Wigs"], merged: false },
  { op: "rename", list: ["Cuts", "Braids", "Wigs"], args: ["braids", "  Plaits   and   twists "], items: ["Braids"], after: ["Plaits and twists"], sections: ["Cuts", "Plaits and twists", "Wigs"], merged: false },
  { op: "rename", list: ["Cuts", "Braids"], args: ["Cuts", "cuts"], items: ["Cuts"], after: ["cuts"], sections: ["cuts", "Braids"], merged: false },
  { op: "rename", list: ["Cuts", "Braids", "Wigs"], args: ["Wigs", "braids"], items: ["Wigs", "Braids", "Cuts"], after: ["Braids", "Braids", "Cuts"], sections: ["Cuts", "Braids"], merged: true },
  { op: "rename", list: ["Cuts", "Braids"], args: ["Cuts", "Cuts"], items: ["Cuts"], after: ["Cuts"], sections: ["Cuts", "Braids"], merged: false },
  { op: "remove", list: ["Cuts", "Braids", "Wigs"], args: ["Braids", "Wigs"], items: ["Braids", "Wigs", "Cuts"], after: ["Wigs", "Wigs", "Cuts"], sections: ["Cuts", "Wigs"] },
  { op: "remove", list: ["Cuts", "Braids", "Wigs"], args: ["braids", null], items: ["Braids", "Wigs", null], after: [null, "Wigs", null], sections: ["Cuts", "Wigs"] },
  { op: "remove", list: ["Cuts", "Braids"], args: ["Cuts", ""], items: [], after: [], sections: ["Braids"] },
];

// Inputs that must be refused, with the error code the JS planners and the SQL functions both raise.
export const SECTION_REFUSALS = [
  { op: "rename", list: ["Cuts"], args: ["Cuts", "x"], code: "invalid_section_name" },
  { op: "rename", list: ["Cuts"], args: ["Cuts", "   "], code: "invalid_section_name" },
  { op: "rename", list: ["Cuts"], args: ["Cuts", "y".repeat(41)], code: "invalid_section_name" },
  { op: "rename", list: ["Cuts"], args: ["Nope", "Haircuts"], code: "section_not_found" },
  { op: "remove", list: ["Cuts"], args: ["Nope", null], code: "section_not_found" },
  { op: "remove", list: ["Cuts", "Braids"], args: ["Cuts", "Cuts"], code: "invalid_move_target" },
  { op: "remove", list: ["Cuts", "Braids"], args: ["Cuts", "Nope"], code: "invalid_move_target" },
];
