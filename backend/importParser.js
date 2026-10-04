// Parses an uploaded CSV / XLSX file into validated product rows.
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

const MAX_ROWS = 1000;

const ALIASES = {
  name: ['name', 'product', 'productname', 'item', 'itemname'],
  category: ['category', 'cat', 'group', 'type'],
  price: ['price', 'sellingprice', 'mrp', 'rate', 'unitprice', 'sp'],
  quantity: ['quantity', 'qty', 'stock', 'openingstock', 'currentstock', 'closingstock'],
  unit: ['unit', 'uom'],
  reorderLevel: ['reorderlevel', 'reorder', 'minstock', 'minimumstock'],
  sku: ['sku', 'code', 'productcode', 'barcode'],
  emoji: ['emoji', 'icon'],
  costPrice: ['costprice', 'buyprice', 'buyingprice', 'purchaseprice', 'cost'],
  description: ['description', 'desc', 'notes'],
  supplier: ['supplier', 'suppliername', 'vendor'],
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

  const rows = [];
  const errors = [];
  for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
    const rowVals = ws.getRow(r).values;
    const get = (f) => (cols[f] === undefined ? '' : cellText(rowVals[cols[f]]));
    const name = get('name');
    const priceRaw = get('price');
    if (!name && !priceRaw && !get('quantity') && !get('category')) continue; // blank line

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

    const qtyRaw = get('quantity');
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

    const costRaw = get('costPrice');
    const costPrice = costRaw === '' ? null : toNumber(costRaw);
    if (costPrice !== null && (Number.isNaN(costPrice) || costPrice < 0)) {
      errors.push({ row: r, name, message: `Invalid buy price "${costRaw}"` });
      continue;
    }

    rows.push({
      rowNumber: r,
      name,
      category: get('category').slice(0, 60) || null,
      price,
      quantity: Math.round(quantity * 1000) / 1000,
      unit: get('unit').slice(0, 20) || 'pcs',
      reorderLevel: Math.round(reorderLevel),
      sku: get('sku').slice(0, 60) || null,
      emoji: get('emoji').slice(0, 8) || '📦',
      costPrice,
      description: get('description').slice(0, 500) || null,
      supplier: get('supplier').slice(0, 80) || null,
      supplierPhone: get('supplierPhone').slice(0, 80) || null,
    });
  }
  return { rows, errors, ignoredSheets };
}

// Rows for the same product inside one file are combined (quantities added together).
function mergeDuplicateRows(rows) {
  const byName = new Map();
  let mergedCount = 0;
  for (const row of rows) {
    const k = row.name.toLowerCase();
    const first = byName.get(k);
    if (!first) { byName.set(k, { ...row }); continue; }
    first.quantity = Math.round((first.quantity + row.quantity) * 1000) / 1000;
    if (!first.supplier && row.supplier) { first.supplier = row.supplier; first.supplierPhone = row.supplierPhone; }
    mergedCount++;
  }
  return { rows: [...byName.values()], mergedCount };
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
    addUps.push({ row: row.rowNumber, product: match, add: row.quantity, rate: row.price });
  }
  return { toCreate, addUps, skipped };
}

module.exports = { parseProductsFile, planImport, mergeDuplicateRows, MAX_ROWS, loadSheet, cellText, mapHeaders, toNumber, norm };
