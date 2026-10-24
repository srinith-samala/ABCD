// Quantities can be decimals (2.5 kg). Show them without float noise (e.g. 1.4000000001).
export const fmtQty = (n) => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// Picks a date out of a file name: "Bills_02_Oct_2026.xlsx", "inventory_2026-10-02.xlsx", "bill 02-10-2026.xlsx".
// Returns 'YYYY-MM-DD' or '' when there is none.
const MONTHS_SHORT = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export const guessDateFromName = (name) => {
  const s = String(name || '');
  const two = (n) => String(n).padStart(2, '0');
  let m = /(\d{1,2})[\s_.\-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_.\-,]*(20\d{2})/i.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 31) return `${m[3]}-${two(MONTHS_SHORT[m[2].toLowerCase()])}-${two(m[1])}`;
  m = /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{2})[-_.]?(\d{2})[-_.]?(20\d{2})/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
};
