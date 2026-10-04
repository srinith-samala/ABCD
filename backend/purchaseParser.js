// Parses an uploaded CSV / XLSX of purchases (stock in) or sales (stock out) into validated rows.
const { loadSheet, cellText, mapHeaders, toNumber } = require('./importParser');

const MAX_ROWS = 500;

const ALIASES = {
  date: ['date', 'billdate', 'orderdate', 'purchasedate'],
  type: ['type', 'ordertype', 'transactiontype'],
  product: ['product', 'productname', 'name', 'item', 'itemname'],
  quantity: ['quantity', 'qty'],
  unit: ['unit', 'uom'],
  total: ['total', 'amount', 'totalamount', 'billamount', 'netamount'],
  category: ['category', 'cat'],
  supplier: ['supplier', 'suppliername', 'vendor'],
  supplierPhone: ['supplierphone', 'supplierphoneno', 'suppliercontact', 'suppliermobile', 'vendorphone'],
  emoji: ['emoji', 'icon'],
};

// YYYY-MM-DD (or ISO) and day-first DD/MM/YYYY (Indian). Returns a Date at 12:00 UTC (so the day is right in IST too), or null.
function parseDay(str) {
  const s = String(str).trim();
  let y, m, d;
  let mt = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else {
    mt = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (!mt) return null;
    d = +mt[1]; m = +mt[2]; y = +mt[3];
  }
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

async function parseOrdersFile(buffer, filename) {
  const { ws, ignoredSheets } = await loadSheet(buffer, filename, /purchase|order|bill|transaction/i);
  if (!ws) throw new Error('The file has no data');

  let headerRowNo = 0;
  let cols = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const m = mapHeaders(ws.getRow(r).values, ALIASES);
    if (m.product !== undefined && m.quantity !== undefined && m.total !== undefined) { headerRowNo = r; cols = m; break; }
  }
  if (!headerRowNo) {
    throw new Error('Could not find the header row. The file needs at least "product", "quantity" and "total" columns');
  }

  const rows = [];
  const errors = [];
  for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values;
    const get = (f) => (cols[f] === undefined ? '' : cellText(vals[cols[f]]));
    const product = get('product');
    const qtyRaw = get('quantity');
    const totalRaw = get('total');
    if (!product && !qtyRaw && !totalRaw) continue;

    if (rows.length + errors.length >= MAX_ROWS) throw new Error(`Too many rows. Maximum is ${MAX_ROWS} per upload`);
    if (!product) { errors.push({ row: r, message: 'Missing product name' }); continue; }

    const quantity = toNumber(qtyRaw);
    if (qtyRaw === '' || Number.isNaN(quantity) || quantity <= 0) { errors.push({ row: r, name: product, message: `Invalid quantity "${qtyRaw}"` }); continue; }

    const total = toNumber(totalRaw);
    if (totalRaw === '' || Number.isNaN(total) || total < 0) { errors.push({ row: r, name: product, message: `Invalid total "${totalRaw}"` }); continue; }

    const typeRaw = get('type').toUpperCase();
    const type = typeRaw === '' ? 'PURCHASE' : typeRaw.startsWith('S') ? 'SALE' : typeRaw.startsWith('P') ? 'PURCHASE' : null;
    if (!type) { errors.push({ row: r, name: product, message: `Type must be PURCHASE or SALE, got "${typeRaw}"` }); continue; }

    const dateRaw = get('date');
    let date;
    if (dateRaw === '') {
      const n = new Date();
      date = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12, 0, 0));
    } else {
      date = parseDay(dateRaw);
      if (!date) { errors.push({ row: r, name: product, message: `Invalid date "${dateRaw}" (use YYYY-MM-DD or DD/MM/YYYY)` }); continue; }
    }

    rows.push({
      rowNumber: r,
      date,
      type,
      product: product.slice(0, 120),
      quantity: Math.round(quantity * 1000) / 1000,
      total: Math.round(total * 100) / 100,
      unit: get('unit').slice(0, 20) || 'pcs',
      category: get('category').slice(0, 60) || null,
      supplier: get('supplier').slice(0, 80) || null,
      supplierPhone: get('supplierPhone').slice(0, 80) || null,
      emoji: get('emoji').slice(0, 8) || '📦',
    });
  }
  return { rows, errors, ignoredSheets };
}

module.exports = { parseOrdersFile };
