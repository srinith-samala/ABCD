const xlsx = require('xlsx');
const zlib = require('zlib');
const Acc = require('./accounting');

const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES = {
  date: ['date', 'expensedate', 'billdate', 'txndate', 'paymentdate', 'entrydate', 'time', 'transactiondate', 'valuedate'],
  title: ['title', 'description', 'particulars', 'particular', 'expense', 'expensename', 'item', 'narration', 'details', 'remarks', 'paidto', 'payee', 'vendor', 'name', 'accountname'],
  amount: ['amount', 'total', 'paid', 'cost', 'value', 'debit', 'dr', 'amt', 'expenseamount', 'withdrawals', 'withdrawal'],
  category: ['category', 'cat', 'expensetype', 'subgroup', 'department'],
  group: ['group', 'pnlgroup', 'section', 'head'],
  paymentMode: ['paymentmode', 'mode', 'method', 'paidvia', 'account', 'channel', 'paymenttype'],
  vendor: ['vendor', 'supplier', 'merchant', 'party', 'store', 'shop'],
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const toNumber = (s) => {
  if (typeof s === 'number') return isNaN(s) ? 0 : s;
  if (!s) return 0;
  // Handle debit amounts, strip currency and spaces
  const clean = String(s).replace(/[₹,\s$]/g, '').trim();
  const n = parseFloat(clean);
  return Number.isFinite(n) ? Math.abs(n) : 0;
};

// Converts Excel date serial or string into Date object
function parseSafeDate(val, fallbackDate) {
  if (!val) return fallbackDate || new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? (fallbackDate || new Date()) : val;

  // Excel serial number
  if (typeof val === 'number') {
    const utcDays = Math.floor(val - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dateObj.getTime())) return dateObj;
  }

  const s = String(val).trim();
  // YYYY-MM-DD
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
  }
  // DD/MM/YYYY or DD-MM-YYYY
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) {
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12, 0, 0));
  }
  // DD-Mon-YYYY (e.g. 15-Oct-2026 or 15 Oct 2026)
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  m = /^(\d{1,2})[- ]([a-z]{3,9})[- ](\d{4})/i.exec(s);
  if (m) {
    const mo = MON[m[2].toLowerCase().slice(0, 3)];
    if (mo !== undefined) {
      return new Date(Date.UTC(+m[3], mo, +m[1], 12, 0, 0));
    }
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? (fallbackDate || new Date()) : parsed;
}

function mapHeaders(rowValues) {
  const map = {};
  rowValues.forEach((val, idx) => {
    const n = norm(val);
    if (!n) return;
    for (const [field, names] of Object.entries(ALIASES)) {
      if (map[field] === undefined && names.includes(n)) {
        map[field] = idx;
      }
    }
  });
  return map;
}

// Extract plain text from PDF buffer
function extractPdfText(buffer) {
  const binary = buffer.toString('latin1');
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;
  const chunks = [];
  while ((match = streamRegex.exec(binary)) !== null) {
    let uncompressed = '';
    const buf = Buffer.from(match[1], 'latin1');
    try {
      uncompressed = zlib.inflateSync(buf).toString('latin1');
    } catch (_) {
      try {
        uncompressed = zlib.inflateRawSync(buf).toString('latin1');
      } catch (__) {
        uncompressed = buf.toString('latin1');
      }
    }

    const textPieces = [];
    const tj = /\((.*?)(?<!\\)\)\s*(?:Tj|'|")/g;
    let tm;
    while ((tm = tj.exec(uncompressed)) !== null) {
      textPieces.push(tm[1].replace(/\\([()\\])/g, '$1'));
    }

    const tjArray = /\[(.*?)\]\s*TJ/g;
    while ((tm = tjArray.exec(uncompressed)) !== null) {
      const inner = tm[1];
      const pieces = [];
      const sub = /\((.*?)(?<!\\)\)/g;
      let sm;
      while ((sm = sub.exec(inner)) !== null) {
        pieces.push(sm[1].replace(/\\([()\\])/g, '$1'));
      }
      if (pieces.length) textPieces.push(pieces.join(''));
    }

    if (textPieces.length) chunks.push(textPieces.join(' '));
  }
  return chunks.join('\n');
}

// Parses PDF text into expense items
function parsePdfExpenses(text, filename, defaultDate, defaultMode) {
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const rows = [];
  const dateRegex = /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i;
  const amountRegex = /(?:₹|Rs\.?|INR)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b/g;

  for (const line of lines) {
    // Skip summary / balance / header lines
    if (/^(total|grand total|subtotal|closing balance|opening balance|summary)\b/i.test(line)) continue;

    // Search for currency amounts in this line
    const amounts = [];
    let am;
    while ((am = amountRegex.exec(line)) !== null) {
      const val = toNumber(am[1]);
      if (val > 0) amounts.push({ text: am[0], val, index: am.index });
    }

    if (!amounts.length) continue;

    // Pick the most likely amount (last or primary numeric column)
    const targetAmt = amounts[amounts.length - 1].val;
    if (targetAmt <= 0) continue;

    // Date
    const dm = dateRegex.exec(line);
    const dateObj = dm ? parseSafeDate(dm[1], defaultDate) : defaultDate;

    // Clean title by stripping date and amount
    let title = line
      .replace(dateRegex, '')
      .replace(amountRegex, '')
      .replace(/[|:;]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!title || title.length < 2) {
      title = `Expense - ${filename.replace(/\.[^.]+$/, '')}`;
    }

    const { group, category } = Acc.categorize(title);

    rows.push({
      title: title.slice(0, 150),
      amount: round2(targetAmt),
      group,
      category,
      paymentMode: defaultMode || 'Cash',
      vendor: null,
      expenseDate: dateObj,
    });
  }

  // If no tabular rows found, see if PDF represents a single invoice
  if (rows.length === 0) {
    let maxAmt = 0;
    let foundDate = defaultDate;
    for (const line of lines) {
      const dm = dateRegex.exec(line);
      if (dm && foundDate === defaultDate) {
        foundDate = parseSafeDate(dm[1], defaultDate);
      }
      let am;
      while ((am = amountRegex.exec(line)) !== null) {
        const val = toNumber(am[1]);
        if (val > maxAmt) maxAmt = val;
      }
    }

    if (maxAmt > 0) {
      const title = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const { group, category } = Acc.categorize(title);
      rows.push({
        title,
        amount: round2(maxAmt),
        group,
        category,
        paymentMode: defaultMode || 'Bank',
        vendor: null,
        expenseDate: foundDate,
      });
    }
  }

  return rows;
}

// Main parser for CSV, XLSX, XLS, PDF
async function parseExpenseFile(buffer, filename, options = {}) {
  const lower = String(filename || '').toLowerCase();
  const defaultDate = options.date ? parseSafeDate(options.date) : new Date();
  const defaultMode = options.paymentMode || (lower.includes('bank') ? 'Bank' : 'Cash');

  let rows = [];

  if (lower.endsWith('.pdf')) {
    const text = extractPdfText(buffer);
    rows = parsePdfExpenses(text, filename, defaultDate, defaultMode);
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true });
    if (!wb.SheetNames || !wb.SheetNames.length) {
      throw new Error('Spreadsheet has no sheets');
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
    if (!rawData || !rawData.length) {
      throw new Error('Spreadsheet is empty');
    }

    // Detect header row index
    let headerRowIdx = -1;
    let headerMap = null;

    for (let r = 0; r < Math.min(rawData.length, 15); r++) {
      const row = rawData[r];
      if (!Array.isArray(row)) continue;
      const map = mapHeaders(row);
      if (map.amount !== undefined && (map.title !== undefined || map.date !== undefined)) {
        headerRowIdx = r;
        headerMap = map;
        break;
      }
    }

    // Positional fallback for bank / cash statement formats
    if (!headerMap || headerMap.amount === undefined) {
      // Heuristic: check row with numbers
      let sampleRow = rawData.find(r => Array.isArray(r) && r.some(c => toNumber(c) > 0));
      if (sampleRow && sampleRow.length >= 2) {
        headerRowIdx = -1;
        // Check if col 0 date, col 1 title, col 2 amount (standard bank format)
        if (sampleRow.length >= 3 && toNumber(sampleRow[2]) > 0) {
          headerMap = { date: 0, title: 1, amount: 2 };
        } else {
          // col 0 title, col 1 amount
          headerMap = { title: 0, amount: 1 };
        }
      } else {
        headerMap = { title: 0, amount: 1 };
      }
    }

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      const rawTitle = headerMap.title !== undefined ? String(row[headerMap.title] || '').trim() : '';
      const rawAmt = headerMap.amount !== undefined ? row[headerMap.amount] : null;
      const amt = toNumber(rawAmt);

      if (!rawTitle || !(amt > 0)) continue;

      // Skip summary / total rows
      if (/^(grand\s*|sub\s*)?total\b|^sum\b|^closing\s*balance/i.test(rawTitle)) continue;

      const dateVal = headerMap.date !== undefined ? row[headerMap.date] : null;
      const expenseDate = parseSafeDate(dateVal, defaultDate);

      // Category and Group
      let group = headerMap.group !== undefined ? String(row[headerMap.group] || '').trim() : '';
      let category = headerMap.category !== undefined ? String(row[headerMap.category] || '').trim() : '';
      if (!group || group === 'Auto' || group === 'General') {
        const catRes = Acc.categorize(rawTitle);
        group = group || catRes.group;
        category = category || catRes.category;
      }

      // Payment Mode
      let paymentMode = headerMap.paymentMode !== undefined ? String(row[headerMap.paymentMode] || '').trim() : '';
      if (!paymentMode) paymentMode = defaultMode;

      // Vendor
      let vendor = headerMap.vendor !== undefined ? String(row[headerMap.vendor] || '').trim() : null;

      rows.push({
        title: rawTitle.slice(0, 150),
        amount: round2(amt),
        group: group || 'General',
        category: category || group || 'General',
        paymentMode: paymentMode || 'Cash',
        vendor: vendor || null,
        expenseDate,
      });
    }
  } else {
    throw new Error('Unsupported file type. Please upload a .csv, .xlsx, .xls, or .pdf file');
  }

  const summary = {
    totalRows: rows.length,
    totalAmount: round2(rows.reduce((s, r) => s + r.amount, 0)),
    groups: rows.reduce((acc, r) => { acc[r.group] = round2((acc[r.group] || 0) + r.amount); return acc; }, {}),
    paymentModes: rows.reduce((acc, r) => { acc[r.paymentMode] = round2((acc[r.paymentMode] || 0) + r.amount); return acc; }, {}),
  };

  return { rows, summary };
}

module.exports = {
  parseExpenseFile,
  extractPdfText,
};

