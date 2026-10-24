// Parses an uploaded CSV / XLSX file into validated product rows.
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

const MAX_ROWS = 1000;

const ALIASES = {
  name: ['name', 'product', 'productname', 'item', 'itemname'],
  category: ['category', 'cat', 'group', 'type'],
  price: ['price', 'sellingprice', 'mrp', 'rate', 'unitprice', 'sp'],
  quantity: ['quantity', 'qty', 'stock', 'openingstock', 'currentstock', 'closingstock', 'qtyreceived', 'quantityreceived', 'qtyordered', 'quantityordered', 'nos', 'units', 'weight'],
  unit: ['unit', 'uom'],
  reorderLevel: ['reorderlevel', 'reorder', 'minstock', 'minimumstock'],
  sku: ['sku', 'code', 'productcode', 'barcode'],
  emoji: ['emoji', 'icon'],
  costPrice: ['costprice', 'buyprice', 'buyingprice', 'purchaseprice', 'cost'],
  description: ['description', 'desc', 'notes'],
  supplier: ['supplier', 'suppliername', 'vendor'],
  // the amount the bill charges for the whole line (authoritative when present)
  total: ['totalprice', 'total', 'totalamount', 'amount', 'linetotal', 'lineamount', 'billamount', 'netamount', 'amt', 'totalcost', 'itemtotal'],
  // "Lalanji's - Bill 6893", "Bill No", "Invoice"
  billRef: ['bill', 'billno', 'billnumber', 'invoice', 'invoiceno', 'invoicenumber', 'billsupplier', 'supplierbill', 'billfrom'],
  date: ['date', 'billdate', 'purchasedate', 'orderdate', 'receiveddate'],
  supplierPhone: ['supplierphone', 'supplierphoneno', 'suppliercontact', 'suppliermobile', 'vendorphone'],
};

const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (v.result !== undefined) return cellText(v.result);      // formula
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
    if (v.text !== undefined) return cellText(v.text);          // hyperlink
    return '';
  }
  return String(v).trim();
}

function mapHeaders(rowValues, aliases = ALIASES) {
  const map = {};
  rowValues.forEach((val, idx) => {
    const n = norm(cellText(val));
    if (!n) return;
    for (const [field, names] of Object.entries(aliases)) {
      if (map[field] === undefined && names.includes(n)) map[field] = idx;
    }
  });
  return map;
}

const toNumber = (s) => {
  const n = Number(String(s).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// Returns { ws, ignoredSheets }. For .xlsx the sheet whose name matches `prefer` is used (else the first one).
async function loadSheet(buffer, filename, prefer) {
  const wb = new ExcelJS.Workbook();
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.csv')) {
    let buf = buffer;
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3); // strip BOM
    return { ws: await wb.csv.read(Readable.from(buf)), ignoredSheets: [] };
  }
  if (lower.endsWith('.xlsx')) {
    await wb.xlsx.load(buffer);
    const sheets = wb.worksheets;
    const ws = (prefer && sheets.find(w => prefer.test(w.name))) || sheets[0];
    return { ws, ignoredSheets: sheets.filter(w => w !== ws).map(w => w.name) };
  }
  throw new Error('Unsupported file type. Please upload a .csv or .xlsx file');
}


const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;
const looksNumericHeader = (v) => typeof v === 'number' || /^\d+([.,]\d+)?$/.test(cellText(v));
const SUMMARY_NAME = /^(grand\s*|sub\s*|bill\s*)?total\b|^total\s*(amount|bill|cost)?\b|^sum\b/i;

// "Lalanji's – Bill 6893" -> { supplier: "Lalanji's", billNo: "6893" };  "Jivdani" -> { supplier: "Jivdani", billNo: '' }
function splitBillRef(ref) {
  const t = String(ref || '').trim();
  if (!t) return { supplier: '', billNo: '' };
  const m = /^(.*?)\s*[–—\-:|\/]+\s*(?:bill|inv(?:oice)?)\s*(?:no\.?|number|#)?\s*([A-Za-z0-9\-\/]+)\s*$/i.exec(t);
  if (m && m[1]) return { supplier: m[1].trim(), billNo: m[2].trim() };
  if (/^(?:bill|inv(?:oice)?)\s*(?:no\.?|number|#)?\s*[A-Za-z0-9\-\/]+$/i.test(t)) return { supplier: '', billNo: t.replace(/^\D*/, '') };
  return { supplier: t, billNo: '' };
}

// Day from a cell: "2026-10-02", "02/10/2026", "02-Oct-2026" or a Date. Returns 'YYYY-MM-DD' or ''.
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function dayFromCell(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = /^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/,]*(\d{4})$/.exec(s);
  if (m && MON[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${String(MON[m[2].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return '';
}

// When the quantity column has no usable heading (e.g. Excel turned "Qty" into "0.5"), find it from the data:
// an unmapped column with a blank / numeric heading whose cells are mostly positive numbers - preferably the one next to "Unit".
function inferQuantityColumn(ws, headerRowNo, cols) {
  const used = new Set(Object.values(cols));
  const hdr = ws.getRow(headerRowNo).values;
  const lastRow = Math.min(ws.rowCount, headerRowNo + 80);
  const cands = [];
  for (let c = 1; c < Math.max(hdr.length, 2); c++) {
    if (used.has(c)) continue;
    const h = hdr[c];
    if (cellText(h) !== '' && !looksNumericHeader(h)) continue;
    let rows = 0; let nums = 0;
    for (let r = headerRowNo + 1; r <= lastRow; r++) {
      const v = ws.getRow(r).values;
      if (cols.name !== undefined && !cellText(v[cols.name])) continue;
      rows++;
      const n = toNumber(cellText(v[c]));
      if (cellText(v[c]) !== '' && Number.isFinite(n) && n > 0) nums++;
    }
    if (rows >= 1 && nums / rows >= 0.7) cands.push({ c, header: cellText(h) });
  }
  if (!cands.length) return null;
  const nextToUnit = cols.unit !== undefined ? cands.find(x => x.c === cols.unit - 1) : null;
  return nextToUnit || cands.find(x => x.header !== '') || cands[0];
}


// When no heading says "Total"/"Amount", find the bill-amount column from the numbers: a column to the right of the price
// whose value is about quantity x price (or a bit more, because of GST) on most rows.
function inferTotalColumn(ws, headerRowNo, cols) {
  if (cols.price === undefined || cols.quantity === undefined) return null;
  const used = new Set(Object.values(cols));
  const hdr = ws.getRow(headerRowNo).values;
  const lastRow = Math.min(ws.rowCount, headerRowNo + 80);
  let best = null;
  for (let c = 1; c < hdr.length; c++) {
    if (used.has(c)) continue;
    let rows = 0; let ok = 0;
    for (let r = headerRowNo + 1; r <= lastRow; r++) {
      const v = ws.getRow(r).values;
      if (cols.name !== undefined && !cellText(v[cols.name])) continue;
      const q = toNumber(cellText(v[cols.quantity])); const p = toNumber(cellText(v[cols.price])); const t = toNumber(cellText(v[c]));
      if (!(q > 0) || !(p > 0)) continue;
      rows++;
      if (Number.isFinite(t) && t > 0) { const ratio = t / (q * p); if (ratio >= 0.97 && ratio <= 1.35) ok++; }
    }
    if (rows >= 2 && ok / rows >= 0.7 && (!best || ok / rows > best.share)) best = { c, share: ok / rows, header: cellText(hdr[c]) };
  }
  return best;
}

function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

async function parseProductsFile(buffer, filename) {
  const { ws, ignoredSheets } = await loadSheet(buffer, filename, /inventory|product|stock|item/i);
  if (!ws) throw new Error('The file has no data');

  // find header row (within the first 10 rows) that has both name and price columns
  let headerRowNo = 0;
  let cols = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const m = mapHeaders(ws.getRow(r).values);
    if (m.name !== undefined) { headerRowNo = r; cols = m; break; }
  }
  if (!headerRowNo) {
    throw new Error('Could not find the header row. The file needs at least a "name" column');
  }
  const notes = [];
  if (cols.quantity === undefined) {
    const guess = inferQuantityColumn(ws, headerRowNo, cols);
    if (guess) {
      cols.quantity = guess.c;
      notes.push(guess.header
        ? `The quantity column heading looked odd ("${guess.header}") - quantities were read from column ${colLetter(guess.c)}.`
        : `No heading found for quantities - they were read from column ${colLetter(guess.c)}.`);
    }
  }
  if (cols.total === undefined) {
    const t = inferTotalColumn(ws, headerRowNo, cols);
    if (t) {
      cols.total = t.c;
      notes.push(`The bill-amount column${t.header ? ` ("${t.header}")` : ''} was found from the numbers (column ${colLetter(t.c)}); its amounts are recorded exactly as written.`);
    }
  }
  let fileTotal = null;
  let subTotalSum = 0;
  let rowsWithoutTotal = 0;

  const rows = [];
  const errors = [];
  for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
    const rowVals = ws.getRow(r).values;
    const get = (f) => (cols[f] === undefined ? '' : cellText(rowVals[cols[f]]));
    const name = get('name');
    const priceRaw = get('price');
    const totalRaw = get('total');
    if (!name && !priceRaw && !get('quantity') && !get('category') && !totalRaw) continue; // blank line

    // the "TOTAL" line some bills have at the bottom is not a product - it is kept to double-check our own sum
    if ((SUMMARY_NAME.test(name) || (!name && totalRaw && !priceRaw && !get('quantity'))) && totalRaw) {
      const t = toNumber(totalRaw);
      if (Number.isFinite(t)) {
        // "Sub total" lines (per bill) are added up; a "Total" / "Grand total" line is the final figure and replaces them
        if (/^sub\s*total/i.test(name)) subTotalSum = round2(subTotalSum + t); else fileTotal = round2(t);
      }
      continue;
    }
    if (SUMMARY_NAME.test(name)) continue;

    if (rows.length + errors.length >= MAX_ROWS) {
      throw new Error(`Too many rows. Maximum is ${MAX_ROWS} per upload`);
    }
    if (!name) { errors.push({ row: r, message: 'Missing product name' }); continue; }
    if (name.length > 120) { errors.push({ row: r, name, message: 'Name is too long (max 120 characters)' }); continue; }

    const price = priceRaw === '' ? 0 : toNumber(priceRaw);
    if (Number.isNaN(price) || price < 0) {
      errors.push({ row: r, name, message: `Invalid price "${priceRaw}"` });
      continue;
    }

    let qtyRaw = get('quantity');
    let qtyUnit = '';
    if (qtyRaw !== '' && Number.isNaN(toNumber(qtyRaw))) {
      // "7 packs", "2.5 kg" in one cell -> quantity 7 / 2.5 and the unit
      const mq = /^\s*(\d[\d,]*\.?\d*)\s*([A-Za-z]+\.?)?\s*$/.exec(qtyRaw);
      if (mq) { qtyRaw = mq[1]; qtyUnit = mq[2] || ''; }
    }
    const quantity = qtyRaw === '' ? 0 : toNumber(qtyRaw);
    if (Number.isNaN(quantity) || quantity < 0) {
      errors.push({ row: r, name, message: `Invalid quantity "${qtyRaw}"` });
      continue;
    }

    const reorderRaw = get('reorderLevel');
    const reorderLevel = reorderRaw === '' ? 10 : toNumber(reorderRaw);
    if (Number.isNaN(reorderLevel) || reorderLevel < 0) {
      errors.push({ row: r, name, message: `Invalid reorder level "${reorderRaw}"` });
      continue;
    }

    let lineTotal = null;
    if (totalRaw === '' && quantity > 0) rowsWithoutTotal++;
    if (totalRaw !== '') {
      lineTotal = toNumber(totalRaw);
      if (Number.isNaN(lineTotal) || lineTotal < 0) { errors.push({ row: r, name, message: `Invalid total price "${totalRaw}"` }); continue; }
      lineTotal = round2(lineTotal);
    }
    const dateRaw = get('date');
    const day = dayFromCell(dateRaw);
    if (dateRaw && !day) { errors.push({ row: r, name, message: `Invalid date "${dateRaw}" (use YYYY-MM-DD or DD/MM/YYYY)` }); continue; }

    const billRef = get('billRef').slice(0, 120);
    const split = splitBillRef(billRef);
    let check = null;
    if (lineTotal !== null && price > 0 && quantity > 0) {
      const expected = quantity * price;
      const ratio = lineTotal / expected;
      if (ratio < 0.9 || ratio > 1.25) check = `Price x quantity = ${round2(expected)} but Total Price = ${lineTotal}; the Total Price is used.`;
    }

    const costRaw = get('costPrice');
    const costPrice = costRaw === '' ? null : toNumber(costRaw);
    if (costPrice !== null && (Number.isNaN(costPrice) || costPrice < 0)) {
      errors.push({ row: r, name, message: `Invalid buy price "${costRaw}"` });
      continue;
    }

    const finalTotal = lineTotal !== null ? lineTotal : round2(quantity * price);
    const unitPrice = price > 0 ? price : (quantity > 0 && lineTotal !== null ? round2(lineTotal / quantity) : 0);
    rows.push({
      rowNumber: r,
      name,
      category: get('category').slice(0, 60) || null,
      price: unitPrice,
      lineTotal: finalTotal,
      hasTotal: lineTotal !== null,
      billRef: billRef || null,
      billNo: split.billNo || null,
      date: day || null,
      check,
      quantity: Math.round(quantity * 1000) / 1000,
      unit: (get('unit') || qtyUnit).slice(0, 20) || 'pcs',
      reorderLevel: Math.round(reorderLevel),
      sku: get('sku').slice(0, 60) || null,
      emoji: get('emoji').slice(0, 8) || '📦',
      costPrice: costPrice !== null ? costPrice : (lineTotal !== null && quantity > 0 ? round2(lineTotal / quantity) : null),
      description: get('description').slice(0, 500) || null,
      supplier: (get('supplier') || split.supplier).slice(0, 80) || null,
      supplierPhone: get('supplierPhone').slice(0, 80) || null,
    });
  }
  const computedTotal = round2(rows.reduce((t, x) => t + (x.lineTotal || 0), 0));
  const checks = rows.filter(x => x.check).map(x => ({ row: x.rowNumber, name: x.name, message: x.check }));
  if (fileTotal === null && subTotalSum > 0) fileTotal = subTotalSum;
  const hasTotalCol = cols.total !== undefined;
  const amountSource = !hasTotalCol ? 'calculated' : (rowsWithoutTotal > 0 ? 'mixed' : 'total-column');
  return { rows, errors, ignoredSheets, notes, fileTotal, computedTotal, checks, amountSource, rowsWithoutTotal, totalColumn: hasTotalCol ? colLetter(cols.total) : null };
}

// Identical lines (same product, same bill, same date) are combined. The same product on DIFFERENT bills stays separate,
// so every supplier bill keeps its own lines.
function mergeDuplicateRows(rows) {
  const byKey = new Map();
  let mergedCount = 0;
  for (const row of rows) {
    const k = `${row.name.toLowerCase()}|${(row.billRef || '').toLowerCase()}|${row.date || ''}`;
    const first = byKey.get(k);
    if (!first) { byKey.set(k, { ...row }); continue; }
    first.quantity = round3(first.quantity + row.quantity);
    first.lineTotal = round2((first.lineTotal || 0) + (row.lineTotal || 0));
    first.price = first.quantity > 0 && first.lineTotal ? round2(first.lineTotal / first.quantity) : first.price;
    if (!first.supplier && row.supplier) { first.supplier = row.supplier; first.supplierPhone = row.supplierPhone; }
    mergedCount++;
  }
  return { rows: [...byKey.values()], mergedCount };
}

// One row per product (stock is added per product): quantities and amounts of all its lines are added together.
function mergeByProduct(lines) {
  const byName = new Map();
  for (const row of lines) {
    const k = row.name.toLowerCase();
    const first = byName.get(k);
    if (!first) { byName.set(k, { ...row }); continue; }
    first.quantity = round3(first.quantity + row.quantity);
    first.lineTotal = round2((first.lineTotal || 0) + (row.lineTotal || 0));
    first.price = first.quantity > 0 && first.lineTotal ? round2(first.lineTotal / first.quantity) : first.price;
    if (first.costPrice !== null && first.quantity > 0 && first.lineTotal) first.costPrice = round2(first.lineTotal / first.quantity);
    if (!first.supplier && row.supplier) { first.supplier = row.supplier; first.supplierPhone = row.supplierPhone; }
  }
  return [...byName.values()];
}

// Splits rows into new products (toCreate) and products that already exist (addUps: the file's quantity is
// ADDED to the current stock). Match is by name, or by SKU when the name is not found.
function planImport(rows, existing) {
  const byName = new Map(existing.map(p => [String(p.name).trim().toLowerCase(), p]));
  const bySku = new Map(existing.filter(p => p.sku).map(p => [String(p.sku).trim().toLowerCase(), p]));
  const toCreate = [];
  const addUps = [];
  const skipped = [];
  for (const row of rows) {
    const match = byName.get(row.name.toLowerCase()) || (row.sku ? bySku.get(row.sku.toLowerCase()) : null);
    if (!match) { toCreate.push(row); continue; }
    if (!(row.quantity > 0)) { skipped.push({ row: row.rowNumber, name: row.name, reason: 'Already exists, no quantity to add' }); continue; }
    addUps.push({ row: row.rowNumber, product: match, add: row.quantity, rate: row.price, lineTotal: row.lineTotal });
  }
  return { toCreate, addUps, skipped };
}

module.exports = { parseProductsFile, planImport, mergeDuplicateRows, mergeByProduct, dayFromCell, splitBillRef, MAX_ROWS, loadSheet, cellText, mapHeaders, toNumber, norm };
