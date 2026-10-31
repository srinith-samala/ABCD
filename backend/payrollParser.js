// Parses an uploaded CSV / XLSX file into validated payroll rows.
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES = {
  employeeName: ['employeename', 'employee', 'empname', 'name', 'staff', 'staffname', 'worker', 'workername', 'person', 'particulars'],
  month: ['month', 'date', 'salarymonth', 'paymonth', 'period', 'forperiod', 'salarydate'],
  presentDays: ['presentdays', 'present', 'days', 'workingdays', 'duty', 'attendance', 'daysworked', 'totaldays', 'totalworkingdays'],
  salary: ['salary', 'basesalary', 'basic', 'basicsalary', 'grosssalary', 'monthlysalary', 'fixedsalary', 'gross', 'amount'],
  advance: ['advance', 'advances', 'advancededucted', 'deduction', 'deductions', 'loan', 'adv', 'lessadvance'],
  netPay: ['netpay', 'net', 'netsalary', 'totalpay', 'payable', 'netamount', 'finalpay', 'payout', 'takehome'],
};

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (v.result !== undefined) return cellText(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
    if (v.text !== undefined) return cellText(v.text);
    return '';
  }
  return String(v).trim();
}

const toNumber = (s) => {
  if (typeof s === 'number') return isNaN(s) ? 0 : s;
  const n = Number(String(s || '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const MON_MAP = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseMonthString(val, fallbackDate) {
  if (!val) return fallbackDate || new Date();
  if (val instanceof Date) return val;
  const s = String(val).trim();
  // YYYY-MM or YYYY-MM-DD
  let m = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/.exec(s);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    return new Date(Date.UTC(y, mo, 1, 12, 0, 0));
  }
  // MM/YYYY or DD/MM/YYYY
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) {
    const y = parseInt(m[3], 10);
    const mo = parseInt(m[2], 10) - 1;
    return new Date(Date.UTC(y, mo, 1, 12, 0, 0));
  }
  // Month Name e.g. "Oct 2026" or "October 2026"
  m = /([a-z]{3,9})[\s,]+(\d{4})/i.exec(s);
  if (m) {
    const moKey = m[1].toLowerCase().slice(0, 3);
    if (MON_MAP[moKey]) {
      const y = parseInt(m[2], 10);
      return new Date(Date.UTC(y, MON_MAP[moKey] - 1, 1, 12, 0, 0));
    }
  }
  // Try native date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12, 0, 0));
  }
  return fallbackDate || new Date();
}

async function loadSheet(buffer, filename) {
  const wb = new ExcelJS.Workbook();
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.csv')) {
    let buf = buffer;
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3);
    const ws = await wb.csv.read(Readable.from(buf));
    return ws;
  }
  if (lower.endsWith('.xlsx')) {
    await wb.xlsx.load(buffer);
    return wb.worksheets[0];
  }
  throw new Error('Unsupported file format. Please upload a .xlsx or .csv file');
}

function mapHeaders(rowValues) {
  const map = {};
  rowValues.forEach((val, idx) => {
    const n = norm(cellText(val));
    if (!n) return;
    for (const [field, names] of Object.entries(ALIASES)) {
      if (map[field] === undefined && names.includes(n)) {
        map[field] = idx;
      }
    }
  });
  return map;
}

async function parsePayrollFile(buffer, filename, fallbackMonthStr) {
  const ws = await loadSheet(buffer, filename);
  if (!ws) throw new Error('File contains no worksheets');

  const fallbackDate = fallbackMonthStr
    ? parseMonthString(fallbackMonthStr)
    : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 12, 0, 0));

  let headerRowIdx = -1;
  let headerMap = null;

  // Search first 15 rows for a header containing employee name or salary
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    const row = ws.getRow(r);
    const map = mapHeaders(row.values);
    if (map.employeeName !== undefined || (map.salary !== undefined && map.presentDays !== undefined)) {
      headerRowIdx = r;
      headerMap = map;
      break;
    }
  }

  // If no header found, default to positional order: 1: Name, 2: Present Days, 3: Salary, 4: Advance, 5: Net Pay
  if (!headerMap || headerMap.employeeName === undefined) {
    headerMap = {
      employeeName: 1,
      presentDays: 2,
      salary: 3,
      advance: 4,
      netPay: 5,
    };
    headerRowIdx = 0; // Data starts at row 1
  }

  const rows = [];
  const errors = [];

  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row || !row.values || row.values.length === 0) continue;

    const rawName = cellText(row.getCell(headerMap.employeeName).value);
    if (!rawName) continue;

    // Skip summary / grand total rows
    if (/^(grand\s*)?total\b|^sum\b|^average\b/i.test(rawName)) continue;

    const rowMonth = headerMap.month !== undefined ? cellText(row.getCell(headerMap.month).value) : '';
    const dateObj = rowMonth ? parseMonthString(rowMonth, fallbackDate) : fallbackDate;

    const presentDays = headerMap.presentDays !== undefined
      ? toNumber(row.getCell(headerMap.presentDays).value)
      : 0;

    const salary = headerMap.salary !== undefined
      ? toNumber(row.getCell(headerMap.salary).value)
      : 0;

    const advance = headerMap.advance !== undefined
      ? toNumber(row.getCell(headerMap.advance).value)
      : 0;

    let netPay = headerMap.netPay !== undefined
      ? toNumber(row.getCell(headerMap.netPay).value)
      : 0;

    // If netPay is missing or 0, compute salary - advance
    if (netPay <= 0 && salary > 0) {
      netPay = Math.max(0, salary - advance);
    }

    if (!salary && !presentDays && !netPay) {
      // Line with just a name and no numbers, skip or ignore
      continue;
    }

    rows.push({
      employeeName: rawName,
      month: dateObj,
      monthKey: `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}`,
      presentDays: round2(presentDays),
      salary: round2(salary),
      advance: round2(advance),
      netPay: round2(netPay),
    });
  }

  const summary = {
    totalRows: rows.length,
    totalSalary: round2(rows.reduce((s, r) => s + r.salary, 0)),
    totalAdvance: round2(rows.reduce((s, r) => s + r.advance, 0)),
    totalNetPay: round2(rows.reduce((s, r) => s + r.netPay, 0)),
    months: [...new Set(rows.map(r => r.monthKey))],
  };

  return { rows, summary, errors };
}

module.exports = {
  parsePayrollFile,
  parseMonthString,
};

