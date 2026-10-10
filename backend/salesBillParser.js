// Parses the POS "DETAILED SALES SUMMARY" export the client sends for each day:
//  - top block: totals, tax, discount, cash / zomato, hall split, categories, altered bills, PAX ...
//  - bottom table: one row per bill (Bill No, Gross, Disc., Net, CGST, SGST, Ex.Tax, Time, Payment Type, Hall ...)
const ExcelJS = require('exceljs');

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MAX_BILLS = 2000;

const text = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (v.result !== undefined) return text(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
    if (v.text !== undefined) return text(v.text);
    return '';
  }
  return String(v).replace(/_x000D_/g, ' ').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
};
const norm = (s) => text(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = text(v).replace(/[₹,\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
// "8879 (35)" -> { a: 8879, b: 35 };  "41  (1728.43)" -> { a: 41, b: 1728.43 };  0 -> { a: 0, b: 0 }
const pair = (v) => {
  if (typeof v === 'number') return { a: v, b: 0 };
  const s = text(v);
  const m = /^(-?[\d,]*\.?\d+)\s*(?:\(\s*(-?[\d,]*\.?\d+)\s*\))?/.exec(s);
  if (!m) return { a: 0, b: 0 };
  return { a: Number(m[1].replace(/,/g, '')) || 0, b: m[2] ? Number(m[2].replace(/,/g, '')) || 0 : 0 };
};

function parseDateLine(line) {
  // "Date: Thursday 01-Oct-2026"  or  "Date: 01-Sep-2026 - 30-Sep-2026" (a range = many days)
  const all = [...String(line).matchAll(/(\d{1,2})[-\/ ]([A-Za-z]{3,9}|\d{1,2})[-\/ ](\d{4})/g)];
  const toDate = (m) => {
    const d = Number(m[1]); const y = Number(m[3]);
    let mo;
    if (/^\d+$/.test(m[2])) mo = Number(m[2]) - 1; else mo = MONTHS[m[2].toLowerCase().slice(0, 4) === 'sept' ? 'sept' : m[2].toLowerCase().slice(0, 3)];
    if (mo === undefined || Number.isNaN(mo)) return null;
    const dt = new Date(Date.UTC(y, mo, d));
    return dt.getUTCMonth() === mo && dt.getUTCDate() === d ? dt : null;
  };
  const dates = all.map(toDate).filter(Boolean);
  return { dates, text: String(line) };
}

const HEADERS = {
  1: ['salesdetails', 'taxbreakup', 'cashierdetails', 'prepaidcarddetails'],
  3: ['hall', 'department', 'category', 'subcategory', 'taxcategory'],
  5: ['ordersaltered', 'freeitems', 'billsaltered', 'othervalues'],
};

const BILL_COLS = {
  billNo: ['billno'], gross: ['grossamount', 'gross'], discount: ['disc', 'discount'], net: ['netamount', 'net'],
  cgst: ['cgst'], sgst: ['sgst'], exTax: ['extaxamount', 'extax'], food: ['foodamount', 'food'], liquor: ['liquoramount', 'liquor'],
  time: ['billtime', 'time'], paymentType: ['paymenttype', 'payment'], pax: ['pax'], tableNo: ['tno', 'tableno', 'table'],
  employee: ['emp', 'employee'], reason: ['discountreason', 'reason'], online: ['onlineorder', 'onlineorderno'], hall: ['hall'],
};

function timeText(v) {
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
  const s = text(v);
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}

// Which bucket of DailySales a bill's payment type belongs to
function bucketOf(paymentType) {
  const p = String(paymentType || '').toLowerCase();
  if (/zm|zomato|swig|swg|aggregat/.test(p)) return 'zomato';
  if (/card|debit|credit|pos|visa|master/.test(p)) return 'card';
  if (/upi|paytm|gpay|google|phonepe|bhim|digital|online|wallet|qr/.test(p)) return 'upi';
  return 'cash';
}

async function loadFirstSheet(buffer, filename) {
  const wb = new ExcelJS.Workbook();
  if (String(filename || '').toLowerCase().endsWith('.csv')) throw new Error('Please upload the .xlsx file exported from the POS');
  await wb.xlsx.load(buffer);
  // the sheet that holds the report (others are usually empty "Sheet2/Sheet3")
  const ws = wb.worksheets.find(w => {
    for (let r = 1; r <= Math.min(8, w.rowCount); r++) {
      const row = w.getRow(r).values;
      if (row.some(c => /detailed sales summary/i.test(text(c)))) return true;
    }
    return false;
  });
  return ws || null;
}

// Cheap check used by the old "Import stock orders" screen to redirect this kind of file
async function looksLikeSalesSummary(buffer, filename) {
  try {
    if (!/\.xlsx$/i.test(filename || '')) return false;
    return !!(await loadFirstSheet(buffer, filename));
  } catch { return false; }
}

async function parseSalesBillFile(buffer, filename) {
  const ws = await loadFirstSheet(buffer, filename);
  if (!ws) throw new Error('This does not look like a POS "Detailed Sales Summary" file');

  // ---- date
  let dateInfo = null;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r).values;
    const cell = row.map(text).find(t => /^date\s*:/i.test(t));
    if (cell) { dateInfo = parseDateLine(cell); break; }
  }
  if (!dateInfo || !dateInfo.dates.length) throw new Error('Could not find the report date ("Date: ..." line)');
  if (dateInfo.dates.length > 1 && +dateInfo.dates[0] !== +dateInfo.dates[1]) {
    const f = (d) => d.toISOString().slice(0, 10);
    throw new Error(`This report covers many days (${f(dateInfo.dates[0])} to ${f(dateInfo.dates[1])}). Upload one report per day so each bill gets the right date.`);
  }
  const date = dateInfo.dates[0];

  // ---- bill table header
  let headerRow = 0; let cols = {};
  for (let r = 1; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values;
    const map = {};
    vals.forEach((v, i) => {
      const n = norm(v);
      if (!n) return;
      for (const [k, names] of Object.entries(BILL_COLS)) if (map[k] === undefined && names.includes(n)) map[k] = i;
    });
    if (map.billNo !== undefined && map.gross !== undefined && map.net !== undefined) { headerRow = r; cols = map; break; }
  }

  // ---- summary block (rows above the bill table)
  const lastSummaryRow = headerRow ? headerRow - 1 : ws.rowCount;
  const blocks = { 1: {}, 3: {}, 5: {} };
  const cur = { 1: '', 3: '', 5: '' };
  for (let r = 1; r <= lastSummaryRow; r++) {
    const row = ws.getRow(r).values;
    [1, 3, 5].forEach(c => {
      const label = text(row[c]);
      if (!label) return;
      const n = norm(label);
      if (HEADERS[c].includes(n)) { cur[c] = n; return; }
      const sec = cur[c];
      if (!blocks[c][sec]) blocks[c][sec] = [];
      blocks[c][sec].push({ label, key: n, value: row[c + 1] });
    });
  }
  const find = (c, sec, key) => { const e = (blocks[c][sec] || []).find(x => x.key === key || x.key.startsWith(key)); return e ? e.value : undefined; };
  const left = (key) => num(find(1, 'salesdetails', key));
  const cashier = (key) => num(find(1, 'cashierdetails', key));
  const taxLines = blocks[1].taxbreakup || [];
  const taxOf = (prefix) => taxLines.filter(t => t.key.startsWith(prefix)).reduce((s, t) => s + num(t.value), 0);
  const list = (sec) => (blocks[3][sec] || []).map(e => ({ name: e.label, amount: pair(e.value).a, pct: pair(e.value).b }));
  const alt = (sec, key) => pair(find(5, sec, key));

  const summary = {
    sales: left('sales'), taxes: left('taxescgs'), rounding: left('roundingamt'), grossSale: left('grosssale'),
    discount: left('discount'), netSale: left('netsale'), netExTax: left('netexcltax'),
    cgst: taxOf('cgst'), sgst: taxOf('sgst'),
    cash: cashier('cash'), digital: cashier('digital'), zomato: cashier('zomato'), unsettled: cashier('unsettledbills'),
    payOut: cashier('payout'), payIn: cashier('payin'), cashInDrawer: cashier('cashindrawer'),
    channels: list('hall'), departments: list('department'), categories: list('category'),
    subCategories: list('subcategory'), taxCategories: (blocks[3].taxcategory || []).map(e => ({ name: e.label, amount: num(e.value) })),
    alterations: {
      cancelled: alt('ordersaltered', 'cancelled'), noCharge: alt('ordersaltered', 'nocharge'), transferred: alt('ordersaltered', 'transferred'),
      discounted: alt('billsaltered', 'discounted'), reprinted: alt('billsaltered', 'reprinted'), modified: alt('billsaltered', 'modified'),
      voided: alt('billsaltered', 'void'), complimentary: alt('billsaltered', 'complimentary'), staff: alt('billsaltered', 'staff'), guest: alt('billsaltered', 'guest'),
    },
    pax: alt('othervalues', 'pax'),
    firstBill: num(find(5, 'othervalues', 'firstbillno')) || null,
    lastBill: num(find(5, 'othervalues', 'lastbillno')) || null,
    noOfBills: num(find(5, 'othervalues', 'noofbills')),
  };

  // ---- bills
  const bills = []; const warnings = []; let totalRow = null;
  if (headerRow) {
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const vals = ws.getRow(r).values;
      const g = (k) => (cols[k] === undefined ? undefined : vals[cols[k]]);
      const noRaw = text(g('billNo'));
      if (!noRaw) {
        // the first row without a bill number but with amounts is the printed TOTAL row
        if (num(g('gross')) > 0 || num(g('net')) > 0) { totalRow = { gross: num(g('gross')), discount: num(g('discount')), net: num(g('net')), exTax: num(g('exTax')) }; break; }
        continue;
      }
      if (bills.length >= MAX_BILLS) throw new Error(`Too many bills (maximum ${MAX_BILLS} per day)`);
      const billNo = parseInt(noRaw, 10);
      if (!Number.isInteger(billNo)) { warnings.push(`Row ${r}: bill number "${noRaw}" is not a number, skipped`); continue; }
      const gross = num(g('gross')), discount = num(g('discount')), net = num(g('net'));
      const cgst = num(g('cgst')), sgst = num(g('sgst'));
      const exTax = g('exTax') === undefined || text(g('exTax')) === '' ? Math.round((net - cgst - sgst) * 100) / 100 : num(g('exTax'));
      bills.push({
        billNo, billTime: timeText(g('time')), gross, discount, net, cgst, sgst, exTax,
        food: num(g('food')), liquor: num(g('liquor')),
        paymentType: text(g('paymentType')), pax: Math.round(num(g('pax'))), tableNo: text(g('tableNo')),
        employee: text(g('employee')), discountReason: text(g('reason')), onlineOrderNo: text(g('online')),
        hall: text(g('hall')),
      });
    }
  }

  // ---- checks
  const sum = (k) => Math.round(bills.reduce((s, b) => s + b[k], 0) * 100) / 100;
  if (!headerRow) warnings.push('No bill-by-bill table found in this file - only the day summary was read.');
  if (bills.length) {
    if (totalRow && Math.abs(sum('net') - totalRow.net) > 1) warnings.push(`Bill rows add up to ${sum('net')} but the printed total is ${totalRow.net}.`);
    if (summary.grossSale && Math.abs(sum('gross') - summary.grossSale) > 1) warnings.push(`Bills gross ${sum('gross')} differs from the summary Gross Sale ${summary.grossSale}.`);
    if (summary.noOfBills && summary.noOfBills !== bills.length) warnings.push(`Summary says ${summary.noOfBills} bills but ${bills.length} bill rows were found.`);
    const dup = bills.length - new Set(bills.map(b => b.billNo)).size;
    if (dup) warnings.push(`${dup} duplicate bill numbers in the file (the last one is kept).`);
  }
  const unknown = [...new Set(bills.map(b => b.paymentType).filter(Boolean))].filter(p => !/^cash$/i.test(p) && bucketOf(p) === 'cash');
  if (unknown.length) warnings.push(`Payment type "${unknown.join('", "')}" is not recognised and counted as cash.`);

  // de-duplicate by bill number (keep last)
  const byNo = new Map(); bills.forEach(b => byNo.set(b.billNo, b));
  const uniqueBills = [...byNo.values()].sort((a, b) => a.billNo - b.billNo);

  // ---- how the day goes into the daily sales register (ex-tax so it matches Profit & Loss)
  const buckets = { cash: 0, card: 0, upi: 0, zomato: 0 };
  uniqueBills.forEach(b => { buckets[bucketOf(b.paymentType)] += b.exTax; });
  const dayDiscount = uniqueBills.reduce((s, b) => s + b.discount, 0);
  const r2 = (n) => Math.round(n * 100) / 100;
  const hasBills = uniqueBills.length > 0;
  const f = summary.netSale > 0 && summary.netExTax > 0 ? summary.netExTax / summary.netSale : 1; // share left after tax
  const daily = hasBills
    ? { cash: r2(buckets.cash), card: r2(buckets.card), upi: r2(buckets.upi), zomato: r2(buckets.zomato), discount: r2(dayDiscount) }
    : { cash: r2(summary.cash * f), card: 0, upi: r2(summary.digital * f), zomato: r2(summary.zomato * f), discount: r2(summary.discount) };

  return { date, summary, bills: uniqueBills, warnings, daily, totals: {
    bills: uniqueBills.length, gross: sum('gross'), discount: sum('discount'), net: sum('net'), exTax: sum('exTax'), pax: uniqueBills.reduce((s, b) => s + b.pax, 0),
  } };
}

module.exports = { parseSalesBillFile, looksLikeSalesSummary, bucketOf };
