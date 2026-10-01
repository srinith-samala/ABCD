// Parses an uploaded CSV / XLSX file into validated product rows.
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

const MAX_ROWS = 2000;

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

function mapHeaders(rowValues) {
  const map = {};
  rowValues.forEach((val, idx) => {
    const n = norm(cellText(val));
    if (!n) return;
    for (const [field, names] of Object.entries(ALIASES)) {
      if (map[field] === undefined && names.includes(n)) map[field] = idx;
    }
  });
  return map;
}

const toNumber = (s) => {
  const n = Number(String(s).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

async function loadSheet(buffer, filename) {
  const wb = new ExcelJS.Workbook();
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.csv')) {
    let buf = buffer;
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3); // strip BOM
    return wb.csv.read(Readable.from(buf));
  }
  if (lower.endsWith('.xlsx')) {
    await wb.xlsx.load(buffer);
    return wb.worksheets[0];
  }
  throw new Error('Unsupported file type. Please upload a .csv or .xlsx file');
}

async function parseProductsFile(buffer, filename) {
  const ws = await loadSheet(buffer, filename);
  if (!ws) throw new Error('The file has no data');

  // find header row (within the first 10 rows) that has both name and price columns
  let headerRowNo = 0;
  let cols = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const m = mapHeaders(ws.getRow(r).values);
    if (m.name !== undefined && m.price !== undefined) { headerRowNo = r; cols = m; break; }
  }
  if (!headerRowNo) {
    throw new Error('Could not find the header row. The file needs at least "name" and "price" columns');
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

    const price = toNumber(priceRaw);
    if (priceRaw === '' || Number.isNaN(price) || price < 0) {
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
      quantity: Math.round(quantity),
      unit: get('unit').slice(0, 20) || 'pcs',
      reorderLevel: Math.round(reorderLevel),
      sku: get('sku').slice(0, 60) || null,
      emoji: get('emoji').slice(0, 8) || '📦',
      costPrice,
      description: get('description').slice(0, 500) || null,
      supplier: get('supplier').slice(0, 80) || null,
    });
  }
  return { rows, errors };
}

// Decide which parsed rows to create. Existing products (same name or SKU) are skipped, never overwritten.
function planImport(rows, existing) {
  const names = new Set(existing.map(p => String(p.name).trim().toLowerCase()));
  const skus = new Set(existing.filter(p => p.sku).map(p => String(p.sku).trim().toLowerCase()));
  const toCreate = [];
  const skipped = [];
  for (const row of rows) {
    const n = row.name.toLowerCase();
    const s = row.sku ? row.sku.toLowerCase() : null;
    if (names.has(n)) { skipped.push({ row: row.rowNumber, name: row.name, reason: 'Product already exists' }); continue; }
    if (s && skus.has(s)) { skipped.push({ row: row.rowNumber, name: row.name, reason: `SKU "${row.sku}" already exists` }); continue; }
    names.add(n);
    if (s) skus.add(s);
    toCreate.push(row);
  }
  return { toCreate, skipped };
}

module.exports = { parseProductsFile, planImport, MAX_ROWS };
