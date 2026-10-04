// Quantities can be decimals (2.5 kg). Show them without float noise (e.g. 1.4000000001).
export const fmtQty = (n) => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
