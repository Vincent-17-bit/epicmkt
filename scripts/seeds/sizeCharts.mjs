// Extra size charts shipped with the catalogue coverage work. SEED_SIZE_CHARTS (shared/src/sizeCharts.js, migration 0093) is left alone;
// these are added beside it. `productTypeIds` are the types a chart becomes the default for, only where the type has none yet.
// Numbers are common retail averages: brands differ, so the sizes say "typical" and a seller can override the rows per item.
import { SHOE_CHART } from "../../shared/src/scales/shoeChart.js";

const braRows = [["30", "65", "63-68"], ["32", "70", "68-73"], ["34", "75", "73-78"], ["36", "80", "78-83"], ["38", "85", "83-88"], ["40", "90", "88-93"], ["42", "95", "93-98"], ["44", "100", "98-103"]];

export const COVERAGE_SIZE_CHARTS = Object.freeze([
  {
    name: "Baby clothes (months)", unit: "cm", productTypeIds: ["baby-clothing"],
    columns: ["Age", "Height", "Weight (kg)"],
    rows: [["Newborn", "50-56", "3-4"], ["0-3 months", "56-62", "4-6"], ["3-6 months", "62-68", "6-8"], ["6-9 months", "68-74", "8-9"], ["9-12 months", "74-80", "9-10"], ["12-18 months", "80-86", "10-12"], ["18-24 months", "86-92", "12-14"]]
  },
  {
    name: "School uniform (chest size)", unit: "in", productTypeIds: ["school-uniform"],
    columns: ["Size", "Chest (in)", "Waist (in)", "Height (cm)"],
    rows: [["24", "24", "22", "110"], ["26", "26", "23", "118"], ["28", "28", "24", "126"], ["30", "30", "25", "134"], ["32", "32", "26", "142"], ["34", "34", "27", "150"], ["36", "36", "29", "158"], ["38", "38", "31", "166"], ["40", "40", "33", "172"], ["42", "42", "35", "176"]]
  },
  {
    name: "Women's bras (band)", unit: "cm", productTypeIds: ["underwear-socks"],
    columns: ["UK/US band", "EU band", "Underbust (cm)"],
    rows: braRows
  },
  {
    name: "Bra cups (by difference)", unit: "cm", productTypeIds: [],
    columns: ["Cup", "Bust minus underbust"],
    rows: [["AA", "10-11 cm"], ["A", "12-13 cm"], ["B", "14-15 cm"], ["C", "16-17 cm"], ["D", "18-19 cm"], ["DD", "20-21 cm"], ["E", "22-23 cm"], ["F", "24-25 cm"]]
  },
  {
    name: "Suits and blazers (men)", unit: "cm", productTypeIds: ["suit-formalwear"],
    columns: ["UK/US", "EU", "Chest (cm)", "Waist (cm)"],
    rows: [["36", "46", "91", "76"], ["38", "48", "97", "81"], ["40", "50", "102", "86"], ["42", "52", "107", "91"], ["44", "54", "112", "97"], ["46", "56", "117", "102"], ["48", "58", "122", "107"], ["50", "60", "127", "112"]]
  },
  {
    name: "Trousers and jeans (waist)", unit: "in", productTypeIds: [],
    columns: ["Waist (in)", "Waist (cm)", "Hip (cm)", "Letter"],
    rows: [["28", "71", "89", "S"], ["30", "76", "94", "S"], ["32", "81", "99", "M"], ["34", "86", "104", "L"], ["36", "91", "109", "L"], ["38", "97", "114", "XL"], ["40", "102", "119", "XL"], ["42", "107", "124", "2XL"], ["44", "112", "129", "3XL"]]
  },
  {
    name: "Belts (waist)", unit: "in", productTypeIds: ["belt"],
    columns: ["Belt size", "Fits waist (in)", "Fits waist (cm)"],
    rows: [["S", "28-30", "71-76"], ["M", "32-34", "81-86"], ["L", "36-38", "91-97"], ["XL", "40-42", "102-107"], ["2XL", "44-46", "112-117"]]
  },
  {
    name: "Hats and caps (head size)", unit: "cm", productTypeIds: ["scarf-hat-cap"],
    columns: ["Size", "Head (cm)", "Head (in)"],
    rows: [["S", "54-55", "21.3-21.7"], ["M", "56-57", "22-22.4"], ["L", "58-59", "22.8-23.2"], ["XL", "60-61", "23.6-24"]]
  },
  {
    name: "Wigs and hair caps", unit: "in", productTypeIds: ["hair-wigs"],
    columns: ["Cap size", "Head (in)", "Head (cm)"],
    rows: [["Petite", "20.5", "52"], ["Average", "21.5", "54.5"], ["Large", "22.5", "57"]]
  },
  {
    name: "Motorbike helmets (head size)", unit: "cm", productTypeIds: ["motorbike-parts-gear"],
    columns: ["Size", "Head (cm)", "Head (in)"],
    rows: [["XS", "53-54", "20.9-21.3"], ["S", "55-56", "21.7-22"], ["M", "57-58", "22.4-22.8"], ["L", "59-60", "23.2-23.6"], ["XL", "61-62", "24-24.4"], ["2XL", "63-64", "24.8-25.2"]]
  },
  {
    name: "Beds and mattresses (Kenyan sizes)", unit: "cm", productTypeIds: ["bed", "mattress"],
    columns: ["Size (ft)", "Width (cm)", "Length (cm)", "Sleeps"],
    rows: [["3 x 6", "91", "183", "1 adult"], ["3.5 x 6", "107", "183", "1 adult"], ["4 x 6", "122", "183", "1 to 2"], ["5 x 6", "152", "183", "2 adults"], ["6 x 6", "183", "183", "2 adults"], ["6 x 7", "183", "213", "2 adults, tall"]]
  },
  {
    name: "Tyre size reading", unit: "mm", productTypeIds: ["tyre"],
    columns: ["Tyre size", "Width (mm)", "Profile (%)", "Rim (in)", "Sidewall (mm)"],
    rows: [["155/80R13", "155", "80", "13", "124"], ["175/70R13", "175", "70", "13", "123"], ["175/65R14", "175", "65", "14", "114"], ["185/65R15", "185", "65", "15", "120"], ["195/65R15", "195", "65", "15", "127"], ["205/55R16", "205", "55", "16", "113"], ["215/60R16", "215", "60", "16", "129"], ["225/45R17", "225", "45", "17", "101"], ["235/65R17", "235", "65", "17", "153"], ["265/65R17", "265", "65", "17", "172"], ["265/70R16", "265", "70", "16", "186"], ["285/60R18", "285", "60", "18", "171"]]
  },
  {
    name: "Kids shoes (EU and foot length)", unit: "cm", productTypeIds: [],
    columns: ["EU", "Foot length (cm)"],
    rows: SHOE_CHART.kids.map((r) => [String(r.eu), String(r.cm)])
  },
  {
    name: "Gloves (hand size)", unit: "cm", productTypeIds: [],
    columns: ["Size", "Hand girth (cm)", "Hand length (cm)"],
    rows: [["S", "18-19", "16-17"], ["M", "20-21", "18-19"], ["L", "22-23", "19-20"], ["XL", "24-25", "20-21"]]
  }
]);
