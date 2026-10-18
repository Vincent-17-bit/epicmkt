/** Kenyan shillings, written one way everywhere: "KSh 99", "KSh 1,500". */
export const formatKsh = (amount: number | string): string => `KSh ${Number(amount).toLocaleString("en-KE")}`;
