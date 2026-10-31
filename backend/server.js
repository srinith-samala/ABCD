require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { parseProductsFile, parseClosingStockFile, planImport, mergeDuplicateRows, mergeByProduct, norm } = require('./importParser');
const { parseOrdersFile } = require('./purchaseParser');
const { parsePayrollFile } = require('./payrollParser');
const Acc = require('./accounting');
const repair = require('./repair');
const { parseSalesBillFile, looksLikeSalesSummary } = require('./salesBillParser');
const { buildWorkbookBuffer } = require('./exportWorkbook');
const { getRelevantEmoji } = require('./emojiMap');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(o => o.trim().replace(/\/$/, ''));
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error('Not allowed by CORS')),
}));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is not set');
  process.exit(1);
}

// API Root
// app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// --- AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// --- AUTH ROUTES ---
app.post('/api/auth/register', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: role || 'WORKER' }
    });
    res.json({ message: 'User created', userId: user.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, role: user.role, name: user.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- STOCK ROUTES ---
// ---- product helpers ----
const PRODUCT_INCLUDE = { category: true, supplier: true };
const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const numOrNull = (v) => (blank(v) ? null : Number(v));

async function categoryIdFromName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const all = await prisma.category.findMany();
  const found = all.find(c => c.name.toLowerCase() === n.toLowerCase());
  if (found) return found.id;
  return (await prisma.category.create({ data: { name: n } })).id;
}

// Validates + normalises product fields from a request body. Returns { data } or { error }.
function readProductBody(body, { partial }) {
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('name')) {
    if (blank(body.name)) return { error: 'Product name is required' };
    data.name = String(body.name).trim();
  }
  if (!partial || has('price')) {
    const p = blank(body.price) ? 0 : Number(body.price);
    if (!(p >= 0)) return { error: 'Price must be a number (0 or more)' };
    data.price = p;
  }
  if (has('costPrice')) {
    const c = numOrNull(body.costPrice);
    if (c !== null && !(c >= 0)) return { error: 'Buy price must be a positive number' };
    data.costPrice = c;
  }
  if (has('unit')) data.unit = blank(body.unit) ? 'pcs' : String(body.unit).trim().slice(0, 20);
  if (has('reorderLevel')) {
    const r = blank(body.reorderLevel) ? 10 : parseInt(body.reorderLevel);
    if (!(r >= 0)) return { error: 'Reorder level must be 0 or more' };
    data.reorderLevel = r;
  }
  if (has('sku')) data.sku = blank(body.sku) ? null : String(body.sku).trim().slice(0, 60);
  if (has('emoji')) {
    data.emoji = blank(body.emoji) ? getRelevantEmoji(data.name || body.name, body.category) : String(body.emoji).trim().slice(0, 8);
  } else if (has('name')) {
    data.emoji = getRelevantEmoji(body.name, body.category);
  }
  if (has('description')) data.description = blank(body.description) ? null : String(body.description).trim().slice(0, 500);
  if (has('supplierId')) data.supplierId = blank(body.supplierId) ? null : parseInt(body.supplierId);
  if (has('expiryDate')) {
    if (blank(body.expiryDate)) data.expiryDate = null;
    else {
      const d = new Date(body.expiryDate);
      if (isNaN(d.getTime())) return { error: 'Invalid expiry date' };
      data.expiryDate = d;
    }
  }
  return { data };
}

app.get('/api/stock', authenticateToken, async (req, res) => {
  try {
    const stock = await prisma.product.findMany({ include: PRODUCT_INCLUDE });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stock level at the end of each of the last 7 days (rebuilt from sales/purchases)
app.get('/api/stock/:id/history', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await prisma.product.findUnique({ where: { id }, select: { quantity: true } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const DAY = 86400000;
    const offsetMin = parseInt(req.query.offset) || 0; // browser's getTimezoneOffset()
    const localNow = Date.now() - offsetMin * 60000;
    const todayStartLocal = Math.floor(localNow / DAY) * DAY;
    const windowStartUtc = todayStartLocal - 6 * DAY + offsetMin * 60000;

    const txs = await prisma.transaction.findMany({
      where: { productId: id, createdAt: { gte: new Date(windowStartUtc) } },
      select: { type: true, quantity: true, createdAt: true },
    });

    const out = [];
    for (let i = 6; i >= 0; i--) {
      const dayStartLocal = todayStartLocal - i * DAY;
      const dayEndUtc = dayStartLocal + DAY + offsetMin * 60000;
      const net = txs
        .filter(t => new Date(t.createdAt).getTime() >= dayEndUtc)
        .reduce((sum, t) => sum + (t.type === 'SALE' ? -t.quantity : t.quantity), 0);
      const d = new Date(dayStartLocal);
      out.push({
        date: d.toISOString().slice(0, 10),
        label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
        stock: Math.max(0, product.quantity - net),
      });
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stock', authenticateToken, async (req, res) => {
  try {
    const { data, error } = readProductBody(req.body, { partial: false });
    if (error) return res.status(400).json({ error });

    const qtyRaw = req.body.openingStock !== undefined ? req.body.openingStock : req.body.quantity;
    const qty = blank(qtyRaw) ? 0 : Math.round(parseFloat(qtyRaw) * 1000) / 1000;
    if (!(qty >= 0)) return res.status(400).json({ error: 'Stock must be 0 or more' });

    const categoryId = await categoryIdFromName(req.body.category);
    const product = await prisma.product.create({
      data: { ...data, categoryId, openingStock: qty, quantity: qty },
      include: PRODUCT_INCLUDE,
    });

    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({
        data: { message: `${req.user.name} added a new product: ${product.name}` }
      });
    }
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const uploadFile = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5 MB)' : err.message });
    }
    next();
  });
};

const uploadFiles = (req, res, next) => {
  upload.array('files', 40)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'A file is too large (max 5 MB each)' : err.message });
    }
    next();
  });
};

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

function parseSafeDate(d) {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  const s = String(d).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
  }
  return new Date(d);
}

// Makes sure every supplier in `entries` ([{ name, phone }]) exists. Missing ones are created; existing ones only get
// their phone filled in when it was blank (nothing else is touched). Returns { idByLower, added, updated }.
async function syncSuppliers(entries) {
  const wanted = new Map();
  for (const e of entries) {
    if (!e.name) continue;
    const l = e.name.toLowerCase();
    if (!wanted.has(l)) wanted.set(l, { name: e.name, phone: e.phone || null });
    else if (!wanted.get(l).phone && e.phone) wanted.get(l).phone = e.phone;
  }
  if (wanted.size === 0) return { idByLower: new Map(), added: 0, updated: 0 };

  const existing = await prisma.supplier.findMany();
  const byLower = new Map(existing.map(s => [s.name.toLowerCase(), s]));
  let added = 0;
  let updated = 0;
  for (const [l, e] of wanted) {
    const ex = byLower.get(l);
    if (!ex) {
      byLower.set(l, await prisma.supplier.create({ data: { name: e.name, contact: e.phone } }));
      added++;
    } else if (e.phone && !(ex.contact && String(ex.contact).trim())) {
      byLower.set(l, await prisma.supplier.update({ where: { id: ex.id }, data: { contact: e.phone } }));
      updated++;
    }
  }
  return { idByLower: new Map([...byLower].map(([l, s]) => [l, s.id])), added, updated };
}

// Bulk import products from a CSV / XLSX file.
// - new products are created
// - products that already exist (same name, or same SKU) get the file's quantity ADDED to their stock
//   (4 L milk today + 2 L in tomorrow's file = 6 L), and optionally recorded as a purchase
// - `preview=true` changes nothing; it only reports what the real import would do
app.post('/api/stock/import', authenticateToken, uploadFile, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let parsed;
    try {
      parsed = await parseProductsFile(req.file.buffer, req.file.originalname);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const preview = String(req.body.preview) === 'true';
    const recordPurchase = req.body.recordPurchase !== 'false'; // default TRUE for dated daily inventory
    const billDateStr = req.body.billDate || req.body.date;
    const billDate = parseSafeDate(billDateStr);
    const importType = req.body.importType === 'OPENING_STOCK' || String(req.body.isOpeningStock) === 'true' ? 'OPENING_STOCK' : 'PURCHASE';
    const isOpeningStock = importType === 'OPENING_STOCK';

    const { rows: lineRows, mergedCount } = mergeDuplicateRows(parsed.rows); // one row per bill line
    const rows = mergeByProduct(lineRows);                                    // one row per product (stock is added per product)
    const existing = await prisma.product.findMany({ select: { id: true, name: true, sku: true, quantity: true, price: true, unit: true, costPrice: true } });
    const { toCreate, addUps, skipped } = planImport(rows, existing);
    const existingByName = new Map(existing.map(p => [String(p.name).trim().toLowerCase(), p]));

    // The amount of a bill line: the file's own "Total Price" when it has one (it already includes GST/discounts),
    // otherwise quantity x unit price. Never multiplied twice.
    const costOf = (l) => {
      if (l.hasTotal || Number(l.price) > 0) return round2(l.lineTotal);
      const p = existingByName.get(l.name.toLowerCase());
      return round2(l.quantity * ((p && (Number(p.costPrice) || Number(p.price))) || 0));
    };
    const billLines = lineRows.filter(l => l.quantity > 0);
    const dayOf = (l) => (l.date ? parseSafeDate(l.date) : billDate);
    const istDayStr = (d) => new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

    // a typed "bill total" wins: the lines are scaled so they add up to exactly that amount
    const amounts = new Map(billLines.map(l => [l, costOf(l)]));
    const calcTotal = round2([...amounts.values()].reduce((t, v) => t + v, 0));
    const customRaw = req.body.customTotal;
    const custom = customRaw !== undefined && customRaw !== '' && Number.isFinite(parseFloat(customRaw)) && parseFloat(customRaw) >= 0 ? round2(parseFloat(customRaw)) : null;
    if (custom !== null && billLines.length) {
      let left = custom;
      billLines.forEach((l, i) => {
        const share = calcTotal > 0 ? amounts.get(l) / calcTotal : 1 / billLines.length;
        const v = i === billLines.length - 1 ? round2(left) : round2(custom * share);
        amounts.set(l, v); left = round2(left - v);
      });
    }
    const amountOf = (l) => amounts.get(l);

    const totalUnitsToAdd = round3(billLines.reduce((t, l) => t + l.quantity, 0));
    const estimatedBillCost = round2([...amounts.values()].reduce((t, v) => t + v, 0));

    // bills already imported on the same day (same bill reference) -> uploading again would double stock and cost
    const refs = [...new Set(billLines.map(l => l.billRef).filter(Boolean))];
    let duplicateBills = [];
    if (refs.length && !isOpeningStock) {
      const prior = await prisma.transaction.findMany({ where: { type: 'PURCHASE', note: { in: refs } }, select: { note: true, createdAt: true } });
      const seen = new Set(prior.map(t => `${t.note}|${istDayStr(t.createdAt)}`));
      duplicateBills = refs.filter(ref => billLines.some(l => l.billRef === ref && seen.has(`${ref}|${istDayStr(dayOf(l))}`)));
    }

    // Opening stock duplicate check: prevent importing opening stock for the same month twice by accident
    let duplicateOpeningStock = null;
    const targetMonth = Acc.monthKey(billDate);
    if (isOpeningStock && targetMonth) {
      const [y, m] = targetMonth.split('-').map(Number);
      const startMonth = new Date(Date.UTC(y, m - 1, 1));
      const endMonth = new Date(Date.UTC(y, m, 1));
      const priorOpening = await prisma.transaction.findFirst({
        where: { type: 'OPENING_STOCK', createdAt: { gte: startMonth, lt: endMonth } },
        select: { createdAt: true, total: true }
      });
      if (priorOpening) {
        duplicateOpeningStock = `Opening stock for ${Acc.monthLabel(targetMonth)} was already imported on ${priorOpening.createdAt.toISOString().slice(0, 10)}. Importing again will add these quantities to inventory.`;
      }
    }

    const byBill = new Map();
    billLines.forEach(l => {
      const k = l.billRef || (isOpeningStock ? 'Opening Stock' : 'No bill reference');
      const g = byBill.get(k) || { ref: k, supplier: l.supplier || '', items: 0, units: 0, total: 0 };
      g.items++; g.units = round3(g.units + l.quantity); g.total = round2(g.total + amountOf(l));
      byBill.set(k, g);
    });
    const fileDates = [...new Set(billLines.map(l => l.date).filter(Boolean))].sort();

    const base = {
      billDate: billDateStr || billDate.toISOString().slice(0, 10),
      importType,
      isOpeningStock,
      targetMonth,
      targetMonthLabel: targetMonth ? Acc.monthLabel(targetMonth) : '',
      duplicateOpeningStock,
      totalUnitsToAdd,
      estimatedBillCost,
      fileTotal: parsed.fileTotal,
      calculatedTotal: calcTotal,
      customTotal: custom,
      totalMismatch: custom === null && parsed.fileTotal !== null && Math.abs(parsed.fileTotal - estimatedBillCost) > 1,
      notes: parsed.notes,
      amountSource: parsed.amountSource,
      rowsWithoutTotal: parsed.rowsWithoutTotal,
      totalColumn: parsed.totalColumn,
      checks: (parsed.checks || []).slice(0, 40),
      duplicateBills,
      fileDates,
      bills: [...byBill.values()],
      lines: billLines.slice(0, 400).map(l => ({
        row: l.rowNumber, name: l.name, quantity: l.quantity, unit: l.unit, total: amountOf(l),
        rate: l.quantity > 0 ? round2(amountOf(l) / l.quantity) : 0, billRef: l.billRef, date: l.date,
        isNew: !existingByName.has(l.name.toLowerCase()),
      })),
      toCreateCount: toCreate.length,
      newNames: toCreate.slice(0, 50).map(r => r.name),
      addUpCount: addUps.length,
      addUps: addUps.slice(0, 60).map(a => ({
        row: a.row, name: a.product.name, add: a.add, unit: a.product.unit,
        before: a.product.quantity, after: round3(a.product.quantity + a.add),
        rate: a.add > 0 && a.lineTotal ? round2(a.lineTotal / a.add) : (a.rate > 0 ? a.rate : (a.product.costPrice || a.product.price || 0)),
        totalCost: a.lineTotal ? round2(a.lineTotal) : round2(a.add * (a.rate > 0 ? a.rate : (a.product.costPrice || a.product.price || 0))),
      })),
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 50),
      errorCount: parsed.errors.length,
      errors: parsed.errors.slice(0, 50),
      mergedCount,
      ignoredSheets: parsed.ignoredSheets,
    };
    if (preview) return res.json({ preview: true, ...base });

    if (duplicateBills.length && recordPurchase && !isOpeningStock && String(req.body.allowDuplicate) !== 'true') {
      return res.status(409).json({ code: 'DUPLICATE_BILLS', duplicateBills, error: `These bills are already recorded for this date: ${duplicateBills.slice(0, 5).join(', ')}. Importing them again would double the stock and cost.` });
    }

    if (duplicateOpeningStock && String(req.body.allowDuplicate) !== 'true') {
      return res.status(409).json({ code: 'DUPLICATE_OPENING_STOCK', error: duplicateOpeningStock });
    }

    // suppliers + their phone numbers are handled for every row
    const sup = await syncSuppliers(rows.filter(r => r.supplier).map(r => ({ name: r.supplier, phone: r.supplierPhone })));

    let created = 0;
    let added = 0;
    let recordedTotal = 0;
    let recordedUnits = 0;
    if (toCreate.length > 0 || addUps.length > 0) {
      await prisma.$transaction(async (tx) => {
        const idByName = new Map(); // product name (lower case) -> product id
        if (toCreate.length > 0) {
          const wanted = [...new Set(toCreate.map(r => r.category).filter(Boolean))];
          let cats = await tx.category.findMany();
          const lowerSet = new Set(cats.map(c => c.name.toLowerCase()));
          const missing = [];
          const seen = new Set();
          for (const name of wanted) {
            const l = name.toLowerCase();
            if (!lowerSet.has(l) && !seen.has(l)) { seen.add(l); missing.push({ name }); }
          }
          if (missing.length) {
            await tx.category.createMany({ data: missing, skipDuplicates: true });
            cats = await tx.category.findMany();
          }
          const idByLower = new Map(cats.map(c => [c.name.toLowerCase(), c.id]));

          for (const r of toCreate) {
            const p = await tx.product.create({
              data: {
                name: r.name,
                sku: r.sku,
                categoryId: r.category ? idByLower.get(r.category.toLowerCase()) ?? null : null,
                price: r.price,
                quantity: r.quantity,
                openingStock: r.quantity,
                unit: r.unit,
                reorderLevel: r.reorderLevel,
                emoji: r.emoji,
                costPrice: r.costPrice,
                description: r.description,
                supplierId: r.supplier ? sup.idByLower.get(r.supplier.toLowerCase()) ?? null : null,
              }
            });
            idByName.set(r.name.toLowerCase(), p.id);
            created++;
          }
        }

        for (const a of addUps) {
          const cur = await tx.product.findUnique({ where: { id: a.product.id } });
          if (!cur) continue;
          await tx.product.update({ where: { id: cur.id }, data: { quantity: round3(cur.quantity + a.add) } });
          idByName.set(String(a.product.name).trim().toLowerCase(), cur.id);
          added++;
        }

        // Record transactions: OPENING_STOCK for opening stock imports, PURCHASE for supplier bills
        if (recordPurchase) {
          const txType = isOpeningStock ? 'OPENING_STOCK' : 'PURCHASE';
          const defaultNote = isOpeningStock ? 'Opening Stock' : null;
          for (const l of billLines) {
            const pid = idByName.get(l.name.toLowerCase());
            if (!pid) continue;
            const total = amountOf(l);
            await tx.transaction.create({
              data: { productId: pid, type: txType, quantity: l.quantity, total, userId: req.user.id, createdAt: dayOf(l), note: l.billRef || defaultNote },
            });
            recordedTotal = round2(recordedTotal + total);
            recordedUnits = round3(recordedUnits + l.quantity);
          }
        }
      }, { timeout: 120000, maxWait: 20000 });

      if (req.user.role !== 'ADMIN') {
        const actionLabel = isOpeningStock ? 'imported Opening Stock' : 'imported inventory';
        await prisma.notification.create({ data: { message: `${req.user.name} ${actionLabel} for ${billDate.toISOString().slice(0, 10)}: ${created} new products, stock added to ${added}` } });
      }
    }

    res.json({
      ...base,
      created,
      added,
      recordedPurchase: recordPurchase,
      recordedTotal,
      recordedUnits,
      recordedDate: billDate.toISOString().slice(0, 10),
      suppliersAdded: sup.added,
      suppliersUpdated: sup.updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Create a dated Daily Inventory Bill directly from current stock (e.g. October 1 Inventory)
app.post('/api/stock/create-daily-bill', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { date, customTotal } = req.body;
    const targetDate = parseSafeDate(date);
    const dayStr = (d) => new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

    // Fetch all current products that have stock > 0
    const products = await prisma.product.findMany({ where: { quantity: { gt: 0 } } });
    if (!products.length) {
      return res.status(400).json({ error: 'No items in stock to record as an inventory bill' });
    }

    // one stock snapshot per day - pressing the button twice would double the inventory cost
    const prior = await prisma.transaction.findMany({ where: { type: 'PURCHASE', note: 'Stock snapshot' }, select: { createdAt: true } });
    if (prior.some(t => dayStr(t.createdAt) === dayStr(targetDate))) {
      return res.status(409).json({ error: `Current stock was already recorded as a bill for ${dayStr(targetDate)}. Delete those entries first if you want to record it again.` });
    }

    const lines = products.map(p => {
      const qty = Number(p.quantity);
      const rate = Number(p.costPrice || p.price || 0);
      return { p, qty, total: round2(qty * rate) };
    }).filter(l => l.qty > 0);
    const computed = round2(lines.reduce((t, l) => t + l.total, 0));

    // a typed bill total is respected: the lines are scaled so that they add up to exactly that amount
    const custom = customTotal !== undefined && customTotal !== '' && !isNaN(parseFloat(customTotal)) && parseFloat(customTotal) >= 0 ? round2(parseFloat(customTotal)) : null;
    if (custom !== null) {
      let left = custom;
      lines.forEach((l, i) => {
        const share = computed > 0 ? l.total / computed : 1 / lines.length;
        l.total = i === lines.length - 1 ? round2(left) : round2(custom * share);
        left = round2(left - l.total);
      });
    }

    let recordedUnits = 0;
    await prisma.$transaction(async (tx) => {
      for (const l of lines) {
        await tx.transaction.create({
          data: { productId: l.p.id, type: 'PURCHASE', quantity: l.qty, total: l.total, userId: req.user.id, createdAt: targetDate, note: 'Stock snapshot' },
        });
        recordedUnits = round3(recordedUnits + l.qty);
      }
    }, { timeout: 120000, maxWait: 20000 });

    res.json({
      success: true,
      date: targetDate.toISOString().slice(0, 10),
      itemsCount: lines.length,
      totalUnits: recordedUnits,
      totalCost: custom !== null ? custom : computed,
    });
  } catch (err) {
    console.error('Failed to create daily bill:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MONTH-END CLOSING STOCK RECONCILIATION ENDPOINTS
// ============================================================================

// List all saved month-end closings and available months
app.get('/api/closing-stock', authenticateToken, async (req, res) => {
  try {
    const closings = await prisma.monthClosing.findMany({ orderBy: { month: 'desc' } });
    const data = await loadAccounting();
    const months = Acc.availableMonths(data);
    res.json({
      closings,
      availableMonths: months.map(m => ({ key: m, label: Acc.monthLabel(m) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single saved month-end closing record
app.get('/api/closing-stock/:month', authenticateToken, async (req, res) => {
  try {
    const { month } = req.params;
    const closing = await prisma.monthClosing.findUnique({ where: { month } });
    if (!closing) return res.status(404).json({ error: `No closing record found for ${month}` });
    let parsedDetails = null;
    if (closing.details) {
      try { parsedDetails = JSON.parse(closing.details); } catch (e) {}
    }
    res.json({
      ...closing,
      details: parsedDetails,
      monthLabel: Acc.monthLabel(month),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview Month-End Closing Stock file against current inventory & calculations
app.post('/api/closing-stock/preview', authenticateToken, uploadFile, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No closing file uploaded' });
    const month = req.body.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'A valid month (YYYY-MM) is required' });
    }

    let parsed;
    try {
      parsed = await parseClosingStockFile(req.file.buffer, req.file.originalname);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const existingProducts = await prisma.product.findMany({
      select: { id: true, name: true, sku: true, quantity: true, price: true, costPrice: true, unit: true, categoryId: true, category: { select: { name: true } } }
    });
    const existingByName = new Map(existingProducts.map(p => [norm(p.name), p]));
    const existingBySku = new Map(existingProducts.filter(p => p.sku).map(p => [norm(p.sku), p]));

    // Calculate Opening Stock & Purchases for this month from database transactions
    const [y, m] = month.split('-').map(Number);
    const startMonth = new Date(Date.UTC(y, m - 1, 1));
    const endMonth = new Date(Date.UTC(y, m, 1));

    const monthTx = await prisma.transaction.findMany({
      where: {
        createdAt: { gte: startMonth, lt: endMonth },
        type: { in: ['OPENING_STOCK', 'PURCHASE'] }
      }
    });

    const openingStockValue = round2(monthTx.filter(t => t.type === 'OPENING_STOCK').reduce((s, t) => s + (Number(t.total) || 0), 0));
    const openingStockUnits = round3(monthTx.filter(t => t.type === 'OPENING_STOCK').reduce((s, t) => s + (Number(t.quantity) || 0), 0));

    const purchasesValue = round2(monthTx.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + (Number(t.total) || 0), 0));
    const purchasesUnits = round3(monthTx.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + (Number(t.quantity) || 0), 0));

    const totalAvailableValue = round2(openingStockValue + purchasesValue);
    const totalAvailableUnits = round3(openingStockUnits + purchasesUnits);

    // Reconcile file rows against existing products
    const matched = [];
    const unmatched = [];
    const matchedProductIds = new Set();

    for (const row of parsed.rows) {
      const match = existingByName.get(norm(row.name)) || (row.sku ? existingBySku.get(norm(row.sku)) : null);
      if (match) {
        matchedProductIds.add(match.id);
        const currentStock = round3(Number(match.quantity) || 0);
        const closingStock = round3(row.quantity);
        const consumedStock = round3(Math.max(0, currentStock - closingStock));
        matched.push({
          productId: match.id,
          name: match.name,
          fileItemName: row.name,
          category: row.category || match.category?.name || 'General',
          unit: row.unit || match.unit || 'pcs',
          currentStock,
          closingStock,
          difference: round3(closingStock - currentStock),
          consumedStock,
          rate: row.price > 0 ? row.price : (Number(match.costPrice) || Number(match.price) || 0),
          closingValue: row.total,
          sheet: row.sheet,
        });
      } else {
        unmatched.push({
          name: row.name,
          category: row.category,
          unit: row.unit,
          closingStock: row.quantity,
          rate: row.price,
          closingValue: row.total,
          sheet: row.sheet,
        });
      }
    }

    // Products currently in stock in DB that were NOT in the closing file
    const unlistedProducts = existingProducts.filter(p => !matchedProductIds.has(p.id) && (Number(p.quantity) > 0)).map(p => ({
      productId: p.id,
      name: p.name,
      category: p.category?.name || 'General',
      currentStock: Number(p.quantity),
      unit: p.unit || 'pcs',
      rate: Number(p.costPrice || p.price || 0),
      currentValue: round2(Number(p.quantity) * Number(p.costPrice || p.price || 0)),
    }));

    const closingStockValue = parsed.totalValue;
    const closingStockUnits = parsed.totalQuantity;

    // Formula: Inventory Consumed = Opening Stock + Purchases - Closing Stock
    const consumedValue = round2(Math.max(0, totalAvailableValue - closingStockValue));
    const consumedUnits = round3(Math.max(0, totalAvailableUnits - closingStockUnits));

    // Check if closing record already exists for this month
    const priorClosing = await prisma.monthClosing.findUnique({ where: { month } });

    res.json({
      month,
      monthLabel: Acc.monthLabel(month),
      fileName: req.file.originalname,
      openingStockValue,
      openingStockUnits,
      purchasesValue,
      purchasesUnits,
      totalAvailableValue,
      totalAvailableUnits,
      closingStockValue,
      closingStockUnits,
      consumedValue,
      consumedUnits,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      unlistedCount: unlistedProducts.length,
      duplicateCount: parsed.duplicateRows.length,
      errorCount: parsed.errors.length,
      duplicateRows: parsed.duplicateRows,
      errors: parsed.errors,
      matched: matched.slice(0, 300),
      unmatched: unmatched.slice(0, 100),
      unlistedProducts: unlistedProducts.slice(0, 100),
      sheetNames: parsed.sheetNames,
      alreadyReconciled: !!priorClosing,
      priorClosing: priorClosing ? {
        closingDate: priorClosing.closingDate,
        closingStockValue: priorClosing.closingStockValue,
        reconciledAt: priorClosing.reconciledAt,
      } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Apply Month-End Closing Stock Reconciliation
app.post('/api/closing-stock/reconcile', authenticateToken, isAdmin, uploadFile, async (req, res) => {
  try {
    const month = req.body.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Valid month (YYYY-MM) is required' });
    }
    if (!req.file) return res.status(400).json({ error: 'No closing file uploaded' });

    const parsed = await parseClosingStockFile(req.file.buffer, req.file.originalname);
    const existingProducts = await prisma.product.findMany({
      select: { id: true, name: true, sku: true, quantity: true, price: true, costPrice: true, unit: true, categoryId: true, category: { select: { name: true } } }
    });
    const existingByName = new Map(existingProducts.map(p => [norm(p.name), p]));
    const existingBySku = new Map(existingProducts.filter(p => p.sku).map(p => [norm(p.sku), p]));

    const [y, m] = month.split('-').map(Number);
    const startMonth = new Date(Date.UTC(y, m - 1, 1));
    const endMonth = new Date(Date.UTC(y, m, 1));
    const closingDate = new Date(Date.UTC(y, m, 0, 23, 59, 59));

    const monthTx = await prisma.transaction.findMany({
      where: {
        createdAt: { gte: startMonth, lt: endMonth },
        type: { in: ['OPENING_STOCK', 'PURCHASE'] }
      }
    });

    const openingStockValue = round2(monthTx.filter(t => t.type === 'OPENING_STOCK').reduce((s, t) => s + (Number(t.total) || 0), 0));
    const openingStockUnits = round3(monthTx.filter(t => t.type === 'OPENING_STOCK').reduce((s, t) => s + (Number(t.quantity) || 0), 0));
    const purchasesValue = round2(monthTx.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + (Number(t.total) || 0), 0));
    const purchasesUnits = round3(monthTx.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + (Number(t.quantity) || 0), 0));
    const totalAvailableValue = round2(openingStockValue + purchasesValue);
    const totalAvailableUnits = round3(openingStockUnits + purchasesUnits);

    const closingStockValue = parsed.totalValue;
    const closingStockUnits = parsed.totalQuantity;
    const consumedValue = round2(Math.max(0, totalAvailableValue - closingStockValue));
    const consumedUnits = round3(Math.max(0, totalAvailableUnits - closingStockUnits));

    const createUnmatched = String(req.body.createUnmatched) === 'true';
    const zeroUnlisted = String(req.body.zeroUnlisted) === 'true';

    let matchedCount = 0;
    let unmatchedCount = 0;
    const reconciliationRows = [];

    await prisma.$transaction(async (tx) => {
      const matchedProductIds = new Set();

      for (const row of parsed.rows) {
        const match = existingByName.get(norm(row.name)) || (row.sku ? existingBySku.get(norm(row.sku)) : null);
        if (match) {
          matchedProductIds.add(match.id);
          matchedCount++;
          const currentStock = round3(Number(match.quantity) || 0);
          const closingStock = round3(row.quantity);
          const consumed = round3(Math.max(0, currentStock - closingStock));

          // Update product inventory balance to reflect actual remaining closing stock
          await tx.product.update({
            where: { id: match.id },
            data: {
              quantity: closingStock,
              price: row.price > 0 ? row.price : match.price,
              costPrice: row.price > 0 ? row.price : match.costPrice,
            }
          });

          reconciliationRows.push({
            id: match.id,
            name: match.name,
            currentStock,
            closingStock,
            consumed,
            rate: row.price > 0 ? row.price : (match.costPrice || match.price || 0),
            closingValue: row.total,
          });
        } else {
          unmatchedCount++;
          if (createUnmatched) {
            const p = await tx.product.create({
              data: {
                name: row.name,
                quantity: row.quantity,
                price: row.price,
                costPrice: row.price,
                unit: row.unit || 'pcs',
                emoji: row.emoji || '📦',
              }
            });
            matchedProductIds.add(p.id);
            reconciliationRows.push({
              id: p.id,
              name: p.name,
              currentStock: 0,
              closingStock: row.quantity,
              consumed: 0,
              rate: row.price,
              closingValue: row.total,
              isNew: true,
            });
          }
        }
      }

      if (zeroUnlisted) {
        for (const p of existingProducts) {
          if (!matchedProductIds.has(p.id) && Number(p.quantity) > 0) {
            await tx.product.update({
              where: { id: p.id },
              data: { quantity: 0 }
            });
          }
        }
      }

      // Upsert MonthClosing record
      await tx.monthClosing.upsert({
        where: { month },
        create: {
          month,
          closingDate,
          openingStockValue,
          purchasesValue,
          totalAvailableValue,
          closingStockValue,
          consumedValue,
          openingStockUnits,
          purchasesUnits,
          closingStockUnits,
          consumedUnits,
          totalItems: parsed.rows.length,
          matchedItems: matchedCount,
          unmatchedItems: unmatchedCount,
          fileName: req.file.originalname,
          reconciledBy: req.user.id,
          reconciledAt: new Date(),
          details: JSON.stringify(reconciliationRows),
        },
        update: {
          closingDate,
          openingStockValue,
          purchasesValue,
          totalAvailableValue,
          closingStockValue,
          consumedValue,
          openingStockUnits,
          purchasesUnits,
          closingStockUnits,
          consumedUnits,
          totalItems: parsed.rows.length,
          matchedItems: matchedCount,
          unmatchedItems: unmatchedCount,
          fileName: req.file.originalname,
          reconciledBy: req.user.id,
          reconciledAt: new Date(),
          details: JSON.stringify(reconciliationRows),
        }
      });

      // Record reconciliation audit trail in Transaction (does not modify historical purchase records)
      const auditProductId = existingProducts[0]?.id || 1;
      await tx.transaction.create({
        data: {
          productId: auditProductId,
          type: 'RECONCILIATION',
          quantity: closingStockUnits,
          total: closingStockValue,
          userId: req.user.id,
          createdAt: closingDate,
          note: `Month-End Closing Reconciliation: ${month} (Closing: ₹${closingStockValue}, Consumed: ₹${consumedValue})`
        }
      });
    }, { timeout: 120000, maxWait: 20000 });

    res.json({
      success: true,
      month,
      monthLabel: Acc.monthLabel(month),
      openingStockValue,
      purchasesValue,
      totalAvailableValue,
      closingStockValue,
      consumedValue,
      matchedCount,
      unmatchedCount,
      reconciledAt: new Date(),
      // Explicit verification: no next month carry-forward
      nextMonthCarryForward: false,
      message: `Successfully reconciled ${Acc.monthLabel(month)} closing stock! Inventory balance updated to ₹${closingStockValue.toLocaleString('en-IN')}. Next month opening stock remains independent.`
    });
  } catch (err) {
    console.error('Reconciliation failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a saved month-end closing reconciliation
app.delete('/api/closing-stock/:month', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { month } = req.params;
    await prisma.monthClosing.delete({ where: { month } });
    res.json({ success: true, message: `Reconciliation for ${month} removed` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import purchases (stock in) / sales (stock out) from a CSV / XLSX, e.g. supplier bills.
// - products are matched by name (case-insensitive); missing products are created for PURCHASE rows
// - rows that are already recorded (same product, type, qty, total and day) are skipped, so re-uploading is safe
// - `updateStock=false` records the purchase for the books without changing stock levels
app.post('/api/transactions/import', authenticateToken, isAdmin, uploadFile, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    if (await looksLikeSalesSummary(req.file.buffer, req.file.originalname)) {
      return res.status(422).json({ code: 'SALES_REPORT', error: 'This is a POS Daily Sales Summary (bill-by-bill sales report), not a stock bill. It is imported under "Daily Sales Bills".' });
    }

    let parsed;
    try {
      parsed = await parseOrdersFile(req.file.buffer, req.file.originalname);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const updateStock = String(req.body.updateStock) !== 'false';
    const rows = parsed.rows;
    const errors = [...parsed.errors];
    const skipped = [];
    const newProducts = [];
    let created = 0;
    let totalAmount = 0;

    if (rows.length > 0) {
      const products = await prisma.product.findMany();
      const byName = new Map(products.map(p => [p.name.trim().toLowerCase(), p]));
      const sup = await syncSuppliers(rows.filter(r => r.supplier).map(r => ({ name: r.supplier, phone: r.supplierPhone })));

      // identical transactions already in the database (so the same file can't be added twice)
      const DAY = 86400000;
      const times = rows.map(r => r.date.getTime());
      const existingTx = await prisma.transaction.findMany({
        where: { createdAt: { gte: new Date(Math.min(...times) - DAY), lte: new Date(Math.max(...times) + DAY) } },
        select: { productId: true, type: true, quantity: true, total: true, createdAt: true },
      });
      const keyOf = (pid, type, qty, total, date) => `${pid}|${type}|${round3(qty)}|${round2(total)}|${date.toISOString().slice(0, 10)}`;
      const already = new Map();
      for (const t of existingTx) {
        const k = keyOf(t.productId, t.type, t.quantity, t.total, new Date(t.createdAt));
        already.set(k, (already.get(k) || 0) + 1);
      }

      await prisma.$transaction(async (tx) => {
        const catIds = new Map((await tx.category.findMany()).map(c => [c.name.toLowerCase(), c.id]));
        const stockNow = new Map(products.map(p => [p.id, p.quantity]));

        for (const r of rows) {
          const lower = r.product.toLowerCase();
          let product = byName.get(lower);

          if (!product) {
            if (r.type === 'SALE') {
              errors.push({ row: r.rowNumber, name: r.product, message: 'Product not found (a sale needs an existing product)' });
              continue;
            }
            let categoryId = null;
            if (r.category) {
              const cl = r.category.toLowerCase();
              if (!catIds.has(cl)) catIds.set(cl, (await tx.category.create({ data: { name: r.category } })).id);
              categoryId = catIds.get(cl);
            }
            const unitPrice = round2(r.total / r.quantity);
            product = await tx.product.create({
              data: {
                name: r.product, categoryId, price: unitPrice, costPrice: unitPrice, quantity: 0, openingStock: 0,
                unit: r.unit, emoji: r.emoji,
                supplierId: r.supplier ? sup.idByLower.get(r.supplier.toLowerCase()) ?? null : null,
              },
            });
            byName.set(lower, product);
            stockNow.set(product.id, 0);
            newProducts.push(product.name);
          }

          const k = keyOf(product.id, r.type, r.quantity, r.total, r.date);
          const left = already.get(k) || 0;
          if (left > 0) {
            already.set(k, left - 1);
            skipped.push({ row: r.rowNumber, name: r.product, reason: 'Already recorded' });
            continue;
          }

          let current = stockNow.get(product.id);
          if (updateStock) {
            if (r.type === 'SALE') {
              if (current < r.quantity) {
                errors.push({ row: r.rowNumber, name: r.product, message: `Insufficient stock (have ${current})` });
                continue;
              }
              current = round3(current - r.quantity);
            } else {
              current = round3(current + r.quantity);
            }
            stockNow.set(product.id, current);
          }

          await tx.transaction.create({
            data: { productId: product.id, type: r.type, quantity: r.quantity, total: r.total, userId: req.user.id, createdAt: r.date },
          });
          if (updateStock) await tx.product.update({ where: { id: product.id }, data: { quantity: current } });
          created++;
          totalAmount = round2(totalAmount + r.total);
        }
      }, { timeout: 60000, maxWait: 20000 });
    }

    res.json({
      created,
      totalAmount,
      newProducts,
      updateStock,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 50),
      errorCount: errors.length,
      errors: errors.slice(0, 50),
      ignoredSheets: parsed.ignoredSheets,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stock/:id', authenticateToken, async (req, res) => {
  try {
    const { data, error } = readProductBody(req.body, { partial: true });
    if (error) return res.status(400).json({ error });

    if (req.body.quantity !== undefined) {
      const q = Math.round(parseFloat(req.body.quantity) * 1000) / 1000;
      if (!(q >= 0)) return res.status(400).json({ error: 'Stock must be 0 or more' });
      data.quantity = q;
    }
    if (req.body.category !== undefined) {
      data.categoryId = await categoryIdFromName(req.body.category);
    }

    const product = await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data,
      include: PRODUCT_INCLUDE,
    });

    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({
        data: { message: `${req.user.name} updated product: ${product.name}` }
      });
    }
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/stock/:id', authenticateToken, async (req, res) => {
  try {
    const pid = parseInt(req.params.id);
    await prisma.transaction.deleteMany({ where: { productId: pid } });
    const product = await prisma.product.delete({ where: { id: pid } });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} deleted product: ${product.name}` } });
    }
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- CATEGORY ROUTES ---
app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: { select: { products: true } }
      },
      orderBy: { name: 'asc' }
    });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const exists = (await prisma.category.findMany()).some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.status(400).json({ error: 'This category already exists' });
    const category = await prisma.category.create({
      data: { name },
      include: { _count: { select: { products: true } } }
    });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} added a new category: ${name}` } });
    }
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const duplicate = (await prisma.category.findMany()).some(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(400).json({ error: 'Another category with this name already exists' });
    const category = await prisma.category.update({
      where: { id },
      data: { name },
      include: { _count: { select: { products: true } } }
    });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} updated category: ${name}` } });
    }
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null }
    });
    const category = await prisma.category.delete({ where: { id } });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} deleted category: ${category.name}` } });
    }
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- SUPPLIER ROUTES ---
app.get('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany();
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const { name, contact, email, status } = req.body;
    const supplier = await prisma.supplier.create({
      data: { name, contact, email, status }
    });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} added a new supplier: ${name}` } });
    }
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', authenticateToken, async (req, res) => {
  try {
    const { name, contact, email, status } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Supplier name is required' });
    const supplier = await prisma.supplier.update({
      where: { id: parseInt(req.params.id) },
      data: { name: String(name).trim(), contact, email, status: status || 'Active' }
    });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} edited supplier: ${supplier.name}` } });
    }
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await prisma.supplier.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- TRANSACTIONS ROUTES ---
app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { productId, type } = req.body;
    const qty = Math.round(parseFloat(req.body.quantity) * 1000) / 1000;
    if (!(qty > 0)) return res.status(400).json({ error: 'Quantity must be greater than 0' });
    if (type !== 'SALE' && type !== 'PURCHASE') return res.status(400).json({ error: 'Type must be SALE or PURCHASE' });

    const product = await prisma.product.findUnique({ where: { id: parseInt(productId) } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let newQuantity = product.quantity;
    if (type === 'SALE') {
      if (product.quantity < qty) return res.status(400).json({ error: 'Insufficient stock' });
      newQuantity = Math.round((newQuantity - qty) * 1000) / 1000;
    } else {
      newQuantity = Math.round((newQuantity + qty) * 1000) / 1000;
    }

    const total = req.body.total !== undefined && req.body.total !== '' && !isNaN(parseFloat(req.body.total))
      ? Math.round(parseFloat(req.body.total) * 100) / 100
      : Math.round(qty * (type === 'PURCHASE' && product.costPrice ? product.costPrice : product.price) * 100) / 100;
    const createdAt = parseSafeDate(req.body.date);

    const transaction = await prisma.transaction.create({
      data: { productId: parseInt(productId), type, quantity: qty, total, userId: req.user.id, createdAt }
    });

    await prisma.product.update({
      where: { id: parseInt(productId) },
      data: { quantity: newQuantity }
    });

    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} logged a ${type} transaction for ${product.name}` } });
    }

    res.json(transaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edit an order. The stock effect of the OLD order is undone and the NEW one applied, so stock stays correct.
// `adjustStock=false` edits the record only and leaves product stock untouched.
app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const old = await prisma.transaction.findUnique({ where: { id } });
    if (!old) return res.status(404).json({ error: 'Order not found' });

    const type = req.body.type !== undefined ? req.body.type : old.type;
    if (type !== 'SALE' && type !== 'PURCHASE') return res.status(400).json({ error: 'Type must be SALE or PURCHASE' });
    const productId = req.body.productId !== undefined ? parseInt(req.body.productId) : old.productId;
    const qty = req.body.quantity !== undefined ? round3(parseFloat(req.body.quantity)) : old.quantity;
    if (!(qty > 0)) return res.status(400).json({ error: 'Quantity must be greater than 0' });
    const adjustStock = String(req.body.adjustStock) !== 'false';
    const note = req.body.note !== undefined ? (req.body.note ? String(req.body.note).trim() : null) : old.note;

    const newProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!newProduct) return res.status(404).json({ error: 'Product not found' });

    let total;
    if (req.body.total !== undefined && req.body.total !== '' && req.body.total !== null) {
      total = round2(parseFloat(req.body.total));
      if (!(total >= 0)) return res.status(400).json({ error: 'Total must be 0 or more' });
    } else {
      total = round2(qty * (newProduct.costPrice || newProduct.price || 0));
    }
    let createdAt = old.createdAt;
    if (req.body.date) {
      const d = parseSafeDate(req.body.date);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid date' });
      createdAt = d;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (adjustStock) {
        // 1) undo old effect
        const oldProd = await tx.product.findUnique({ where: { id: old.productId } });
        if (oldProd) {
          const undone = round3(oldProd.quantity + (old.type === 'SALE' ? old.quantity : -old.quantity));
          if (undone < 0) throw new Error(`Cannot edit: stock of "${oldProd.name}" would go negative. Untick "Adjust stock" to edit the record only.`);
          await tx.product.update({ where: { id: oldProd.id }, data: { quantity: undone } });
        }
        // 2) apply new effect
        const cur = await tx.product.findUnique({ where: { id: productId } });
        const applied = round3(cur.quantity + (type === 'SALE' ? -qty : qty));
        if (applied < 0) throw new Error(`Insufficient stock for "${cur.name}" (have ${cur.quantity})`);
        await tx.product.update({ where: { id: productId }, data: { quantity: applied } });
      }
      return tx.transaction.update({
        where: { id },
        data: { type, productId, quantity: qty, total, createdAt, note },
        include: { product: true },
      });
    });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} edited a transaction (TRX-${id})` } });
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete one or many transactions: DELETE /api/transactions body { ids: [1,2,3], day: 'YYYY-MM-DD', note: 'Bill...', revertStock: true }
// `revertStock=true` undoes the stock effect of each deleted entry.
app.delete('/api/transactions', authenticateToken, async (req, res) => {
  try {
    let ids = Array.isArray(req.body.ids) ? req.body.ids.map(n => parseInt(n)).filter(Number.isInteger) : [];
    const revertStock = req.body.revertStock === true || String(req.body.revertStock) === 'true';

    // If day is passed, find all transactions on that day (in local IST day range)
    if (ids.length === 0 && req.body.day) {
      const dStr = String(req.body.day).slice(0, 10);
      const start = new Date(`${dStr}T00:00:00.000Z`);
      const end = new Date(`${dStr}T23:59:59.999Z`);
      // Also account for IST +/- 12h
      const dayRows = await prisma.transaction.findMany({
        where: {
          createdAt: {
            gte: new Date(start.getTime() - 14 * 3600 * 1000),
            lte: new Date(end.getTime() + 14 * 3600 * 1000),
          }
        }
      });
      const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      ids = dayRows.filter(r => istDay(r.createdAt) === dStr).map(r => r.id);
    } else if (ids.length === 0 && req.body.note) {
      const noteRows = await prisma.transaction.findMany({ where: { note: String(req.body.note).trim() } });
      ids = noteRows.map(r => r.id);
    }

    if (ids.length === 0) return res.status(400).json({ error: 'No items or bill found to delete' });

    const deleted = await prisma.$transaction(async (tx) => {
      const rows = await tx.transaction.findMany({ where: { id: { in: ids } } });
      if (revertStock) {
        for (const t of rows) {
          const p = await tx.product.findUnique({ where: { id: t.productId } });
          if (!p) continue;
          const q = round3(p.quantity + (t.type === 'SALE' ? t.quantity : -t.quantity));
          if (q < 0) throw new Error(`Cannot reverse stock for "${p.name}" (it would go negative). Delete without reversing stock instead.`);
          await tx.product.update({ where: { id: p.id }, data: { quantity: q } });
        }
      }
      const r = await tx.transaction.deleteMany({ where: { id: { in: rows.map(t => t.id) } } });
      return r.count;
    }, { timeout: 60000, maxWait: 20000 });

    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} deleted ${deleted} inventory transaction(s)` } });
    }
    res.json({ deleted, revertStock });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({ include: { product: true }, orderBy: { createdAt: 'desc' } });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EXPENSE ROUTES ---
app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({ orderBy: { expenseDate: 'desc' } });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const { title, amount, category, date, paymentMode, vendor, group } = req.body;
    const amt = parseFloat(amount);
    if (!title || !String(title).trim() || !(amt > 0)) {
      return res.status(400).json({ error: 'Title and an amount greater than 0 are required' });
    }
    const auto = Acc.categorize(title);
    const useAuto = !group || group === 'Auto';
    const expense = await prisma.expense.create({
      data: {
        title: String(title).trim(),
        amount: amt,
        category: useAuto ? ((category && !['General', 'Other', 'Auto'].includes(category)) ? category : auto.category) : (category || 'General'),
        paymentMode: paymentMode || 'Cash',
        vendor: vendor || null,
        group: useAuto ? auto.group : group,
        ...(date ? { expenseDate: new Date(date) } : {})
      }
    });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} added a new expense: ${title}` } });
    }
    res.json(expense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/expenses/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { title, amount, category, date, paymentMode, vendor, group } = req.body;
    const amt = parseFloat(amount);
    if (!title || !String(title).trim() || !(amt > 0)) {
      return res.status(400).json({ error: 'Title and an amount greater than 0 are required' });
    }
    const auto = Acc.categorize(title);
    const useAuto = !group || group === 'Auto';
    const expense = await prisma.expense.update({
      where: { id: parseInt(req.params.id) },
      data: {
        title: String(title).trim(),
        amount: amt,
        category: useAuto ? ((category && !['General', 'Other', 'Auto'].includes(category)) ? category : auto.category) : (category || 'General'),
        paymentMode: paymentMode || 'Cash',
        vendor: vendor || null,
        group: useAuto ? auto.group : group,
        ...(date ? { expenseDate: new Date(date) } : {})
      }
    });
    res.json(expense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await prisma.expense.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- NOTIFICATIONS ROUTES ---
app.get('/api/notifications', authenticateToken, isAdmin, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DAILY SALES BILLS (POS "Detailed Sales Summary", one file per day) ---
const dayStart = (d) => { const x = new Date(d); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())); };

// Saves one parsed day: replaces that day's bills + summary and updates the daily sales register (used by Profit & Loss)
async function saveSalesDay(parsed, fileName) {
  const date = dayStart(parsed.date);
  const s = parsed.summary;
  return prisma.$transaction(async (tx) => {
    await tx.salesBill.deleteMany({ where: { billDate: date } });
    if (parsed.bills.length) {
      await tx.salesBill.createMany({
        data: parsed.bills.map(b => ({
          billDate: date, billNo: b.billNo, billTime: b.billTime || null, gross: b.gross, discount: b.discount, net: b.net,
          cgst: b.cgst, sgst: b.sgst, exTax: b.exTax, food: b.food, liquor: b.liquor, paymentType: b.paymentType || null,
          pax: b.pax, tableNo: b.tableNo || null, employee: b.employee || null, discountReason: b.discountReason || null,
          onlineOrderNo: b.onlineOrderNo || null, hall: b.hall || null,
        })),
      });
    }
    const details = JSON.stringify({
      channels: s.channels, departments: s.departments, categories: s.categories, subCategories: s.subCategories,
      taxCategories: s.taxCategories, alterations: s.alterations, cgst: s.cgst, sgst: s.sgst, rounding: s.rounding,
      unsettled: s.unsettled, payOut: s.payOut, payIn: s.payIn, cashInDrawer: s.cashInDrawer, paxAmount: s.pax.b,
    });
    const report = {
      sales: s.sales, taxes: s.taxes, grossSale: s.grossSale || parsed.totals.gross, discount: s.discount || parsed.totals.discount,
      netSale: s.netSale || parsed.totals.net, netExTax: s.netExTax || parsed.totals.exTax, cash: s.cash, digital: s.digital, zomato: s.zomato,
      bills: parsed.bills.length || s.noOfBills, pax: Math.round(s.pax.a) || parsed.totals.pax, firstBill: s.firstBill, lastBill: s.lastBill,
      details, fileName: fileName || null,
    };
    await tx.salesReport.upsert({ where: { reportDate: date }, create: { reportDate: date, ...report }, update: report });

    // Daily sales register (net of tax). Card / UPI already entered for this day (e.g. from the online-payment sheet) are kept,
    // because the POS records every payment mode as "Cash".
    const existing = await tx.dailySales.findUnique({ where: { date } });
    let { cash, card, upi, zomato } = parsed.daily;
    if (existing && (existing.card > 0 || existing.upi > 0) && card === 0 && upi === 0) {
      card = existing.card; upi = existing.upi;
      cash = Math.max(0, round2(cash - card - upi));
    }
    const data = { cash: round2(cash), card: round2(card), upi: round2(upi), zomato: round2(zomato), discount: round2(parsed.daily.discount) };
    await tx.dailySales.upsert({ where: { date }, create: { date, ...data }, update: data });
    return { date, bills: parsed.bills.length };
  }, { timeout: 60000, maxWait: 20000 });
}

// POST files[]  (+ dryRun=true to only read them and show what would be saved)
app.post('/api/sales-bills/import', authenticateToken, isAdmin, uploadFiles, async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No file uploaded' });
    const dryRun = String(req.body.dryRun) === 'true';
    const results = [];
    const seenDates = new Map();
    for (const f of files) {
      const out = { fileName: f.originalname };
      try {
        const parsed = await parseSalesBillFile(f.buffer, f.originalname);
        const key = parsed.date.toISOString().slice(0, 10);
        if (seenDates.has(key)) { out.ok = false; out.error = `Same date (${key}) as "${seenDates.get(key)}" in this upload`; results.push(out); continue; }
        seenDates.set(key, f.originalname);
        const existing = await prisma.salesReport.findUnique({ where: { reportDate: dayStart(parsed.date) } });
        Object.assign(out, {
          ok: true, date: key, exists: !!existing, bills: parsed.bills.length, gross: parsed.totals.gross, discount: parsed.totals.discount,
          net: parsed.totals.net, exTax: parsed.totals.exTax, pax: parsed.totals.pax, warnings: parsed.warnings,
          daily: parsed.daily, firstBill: parsed.summary.firstBill, lastBill: parsed.summary.lastBill,
        });
        if (!dryRun) { await saveSalesDay(parsed, f.originalname); out.saved = true; }
      } catch (e) {
        out.ok = false; out.error = e.message;
      }
      results.push(out);
    }
    res.json({ dryRun, results, saved: results.filter(r => r.saved).length, failed: results.filter(r => !r.ok).length });
  } catch (err) {
    console.error('Sales bill import failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Days list (one row per uploaded day) - ?month=YYYY-MM or nothing for all
app.get('/api/sales-bills', authenticateToken, isAdmin, async (req, res) => {
  try {
    const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ''));
    const where = m ? { reportDate: { gte: new Date(Date.UTC(+m[1], +m[2] - 1, 1)), lt: new Date(Date.UTC(+m[1], +m[2], 1)) } } : {};
    const [reports, all] = await Promise.all([
      prisma.salesReport.findMany({ where, orderBy: { reportDate: 'desc' } }),
      prisma.salesReport.findMany({ select: { reportDate: true } }),
    ]);
    const months = [...new Set(all.map(r => Acc.monthKey(r.reportDate)))].sort().map(k => ({ key: k, label: Acc.monthLabel(k) }));
    res.json({ reports: reports.map(r => ({ ...r, details: undefined })), months });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// One day: summary details + every bill
app.get('/api/sales-bills/day/:date', authenticateToken, isAdmin, async (req, res) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
    const date = new Date(`${req.params.date}T00:00:00.000Z`);
    const [report, bills] = await Promise.all([
      prisma.salesReport.findUnique({ where: { reportDate: date } }),
      prisma.salesBill.findMany({ where: { billDate: date }, orderBy: { billNo: 'asc' } }),
    ]);
    if (!report && !bills.length) return res.status(404).json({ error: 'No bills for this date' });
    res.json({ report: report ? { ...report, details: report.details ? JSON.parse(report.details) : null } : null, bills });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a whole day (bills + summary + its daily-sales row)
app.delete('/api/sales-bills/day/:date', authenticateToken, isAdmin, async (req, res) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
    const date = new Date(`${req.params.date}T00:00:00.000Z`);
    await prisma.$transaction(async (tx) => {
      await tx.salesBill.deleteMany({ where: { billDate: date } });
      await tx.salesReport.deleteMany({ where: { reportDate: date } });
      const ds = await tx.dailySales.findUnique({ where: { date } });
      if (ds) {
        if (ds.card > 0 || ds.upi > 0) await tx.dailySales.update({ where: { date }, data: { cash: 0, zomato: 0, discount: 0 } });
        else await tx.dailySales.deleteMany({ where: { date } });
      }
    });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// --- ACCOUNTING DATA (shared by dashboard, P&L page, Expenses page and the Excel export) ---
async function loadAccounting() {
  const [expenses, dailySales, payroll, transactions, monthClosings] = await Promise.all([
    prisma.expense.findMany(),
    prisma.dailySales.findMany(),
    prisma.payroll.findMany(),
    prisma.transaction.findMany({ include: { product: true }, orderBy: { createdAt: 'desc' } }),
    prisma.monthClosing.findMany({ orderBy: { month: 'desc' } }),
  ]);
  return { expenses, dailySales, payroll, transactions, monthClosings };
}
// ?month=2026-09 -> that month, ?month=all -> all time, nothing -> the latest month that has sales
function pickMonth(data, q) {
  if (q === 'all') return null;
  const months = Acc.availableMonths(data);
  if (q && months.includes(q)) return q;
  return Acc.defaultMonth(data);
}

app.get('/api/accounts/pnl', authenticateToken, isAdmin, async (req, res) => {
  try {
    const data = await loadAccounting();
    const month = pickMonth(data, req.query.month);
    const pnl = Acc.computePnL(data, month);
    const { expenseRows, ...slim } = pnl;
    const months = Acc.availableMonths(data);
    const idx = month ? months.indexOf(month) : -1;
    const prev = idx > 0 ? Acc.computePnL(data, months[idx - 1]) : null;
    res.json({
      ...slim,
      months: months.map(m => ({ key: m, label: Acc.monthLabel(m) })),
      defaultMonth: Acc.defaultMonth(data),
      previous: prev ? { month: prev.month, label: prev.label, sales: prev.sales.total, totalExpenses: prev.totalExpenses, netProfit: prev.netProfit, margin: prev.margin } : null,
      series: Acc.monthlySeries(data, 12),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- DAILY LEDGER & ACCUMULATED PROFIT ---
app.get('/api/accounts/daily-ledger', authenticateToken, isAdmin, async (req, res) => {
  try {
    const data = await loadAccounting();
    const month = pickMonth(data, req.query.month);
    const pnl = Acc.computePnL(data, month);
    res.json({
      month,
      label: pnl.label,
      months: Acc.availableMonths(data).map(m => ({ key: m, label: Acc.monthLabel(m) })),
      totalSales: pnl.sales.total,
      openingStock: pnl.openingStock,
      totalPurchases: pnl.inventoryPurchases,
      totalStockAvailable: pnl.totalStockAvailable,
      closingStock: pnl.closingStock,
      totalInventory: pnl.cogs,
      inventoryConsumed: pnl.inventoryConsumed,
      isReconciled: pnl.isReconciled,
      grossProfit: pnl.grossProfit,
      grossMargin: pnl.grossMargin,
      salaryCost: pnl.salaryLine,
      otherExpenses: pnl.otherExpenses,
      totalExpenses: pnl.totalExpenses,
      netProfit: pnl.netProfit,
      margin: pnl.margin,
      byDay: pnl.byDay,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DASHBOARD REPORT DATA ---
app.get('/api/reports/dashboard', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.product.findMany({ select: { quantity: true, openingStock: true, price: true } });
    const data = await loadAccounting();
    const month = pickMonth(data, req.query.month);
    const pnl = Acc.computePnL(data, month);
    res.json({
      month, label: pnl.label,
      months: Acc.availableMonths(data).map(m => ({ key: m, label: Acc.monthLabel(m) })),
      totalSales: pnl.sales.total,
      openingStock: pnl.openingStock,
      totalPurchases: pnl.inventoryPurchases,
      totalStockAvailable: pnl.totalStockAvailable,
      closingStock: pnl.closingStock,
      totalInventory: pnl.cogs,
      inventoryConsumed: pnl.inventoryConsumed,
      isReconciled: pnl.isReconciled,
      grossProfit: pnl.grossProfit,
      grossMargin: pnl.grossMargin,
      salaryCost: pnl.salaryLine,
      otherExpenses: pnl.otherExpenses,
      totalExpenses: pnl.totalExpenses,
      profit: pnl.netProfit,
      margin: pnl.margin,
      foodCostPct: pnl.foodCostPct,
      salaryPct: pnl.salaryPct,
      byDay: pnl.byDay,
      openingStockValue: pnl.openingStock || 0,
      closingStockValue: pnl.closingStock || 0,
      monthly: Acc.monthlySeries(data, 6),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EXPORT STATISTICS (multi-sheet Excel with native charts) ---
app.get('/api/reports/export', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [products, transactions, expenses, dailySales, payroll, vendorBills, monthClosings] = await Promise.all([
      prisma.product.findMany({ include: { category: true } }),
      prisma.transaction.findMany({ include: { product: true } }),
      prisma.expense.findMany(),
      prisma.dailySales.findMany(),
      prisma.payroll.findMany(),
      prisma.vendorBill.findMany(),
      prisma.monthClosing.findMany({ orderBy: { month: 'desc' } }),
    ]);
    const data = { products, transactions, expenses, dailySales, payroll, vendorBills, monthClosings };
    const month = pickMonth({ expenses, dailySales, payroll, monthClosings }, req.query.month);
    const buffer = await buildWorkbookBuffer(data, { month: month || 'all' });
    const label = (month ? Acc.monthLabel(month) : 'All_Months').replace(' ', '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Takatak_Statistics_${label}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Export failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- DATA REPAIR (clean up the old Excel import) ---
app.get('/api/accounts/repair/preview', authenticateToken, isAdmin, async (req, res) => {
  try { res.json(await repair.preview(prisma)); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/accounts/repair/apply', authenticateToken, isAdmin, async (req, res) => {
  try {
    const o = req.body || {};
    res.json(await repair.apply(prisma, { removeJunk: o.removeJunk !== false, categorize: o.categorize !== false, shiftDates: o.shiftDates !== false, markBillsPaid: o.markBillsPaid !== false }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- USERS ROUTES ---
app.get('/api/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true } });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NEW PHASE 1 & 2 ROUTES ---
app.get('/api/dailysales', authenticateToken, isAdmin, async (req, res) => {
  try {
    const sales = await prisma.dailySales.findMany({ orderBy: { date: 'desc' } });
    res.json(sales);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dailysales', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { date, cash, card, upi, zomato, discount } = req.body;
    const targetDate = parseSafeDate(date);
    const data = {
      cash: parseFloat(cash) || 0,
      card: parseFloat(card) || 0,
      upi: parseFloat(upi) || 0,
      zomato: parseFloat(zomato) || 0,
      discount: parseFloat(discount) || 0,
    };
    const sale = await prisma.dailySales.upsert({
      where: { date: targetDate },
      create: { date: targetDate, ...data },
      update: data,
    });
    res.json(sale);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/payroll', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    let where = {};
    if (month && month !== 'all') {
      const m = /^(\d{4})-(\d{2})$/.exec(month);
      if (m) {
        where = {
          month: {
            gte: new Date(Date.UTC(+m[1], +m[2] - 1, 1)),
            lt: new Date(Date.UTC(+m[1], +m[2], 1)),
          }
        };
      }
    }
    const payroll = await prisma.payroll.findMany({ where, orderBy: { month: 'desc' } });
    res.json(payroll);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/payroll', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { employeeName, month, presentDays, salary, advance, netPay } = req.body;
    const pr = await prisma.payroll.create({
      data: {
        employeeName,
        month: new Date(month),
        presentDays: parseFloat(presentDays) || 0,
        salary: parseFloat(salary) || 0,
        advance: parseFloat(advance) || 0,
        netPay: parseFloat(netPay) || 0,
      }
    });
    res.json(pr);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/payroll/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { employeeName, month, presentDays, salary, advance, netPay } = req.body;
    const pr = await prisma.payroll.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(employeeName ? { employeeName } : {}),
        ...(month ? { month: new Date(month) } : {}),
        ...(presentDays !== undefined ? { presentDays: parseFloat(presentDays) || 0 } : {}),
        ...(salary !== undefined ? { salary: parseFloat(salary) || 0 } : {}),
        ...(advance !== undefined ? { advance: parseFloat(advance) || 0 } : {}),
        ...(netPay !== undefined ? { netPay: parseFloat(netPay) || 0 } : {}),
      }
    });
    res.json(pr);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/payroll/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await prisma.payroll.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Payroll entry deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/payroll/import', authenticateToken, isAdmin, uploadFile, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please choose an Excel (.xlsx) or CSV file' });
    const isPreview = String(req.body.preview || req.query.preview) === 'true';
    const fallbackMonth = req.body.month || req.query.month || '';

    const parsed = await parsePayrollFile(req.file.buffer, req.file.originalname, fallbackMonth);
    if (!parsed.rows.length) {
      return res.status(422).json({ error: 'No valid payroll rows found in this file. Please ensure employee names and salary or present days are provided.' });
    }

    if (isPreview) {
      return res.json({
        preview: true,
        fileName: req.file.originalname,
        totalRows: parsed.summary.totalRows,
        totalSalary: parsed.summary.totalSalary,
        totalAdvance: parsed.summary.totalAdvance,
        totalNetPay: parsed.summary.totalNetPay,
        months: parsed.summary.months,
        rows: parsed.rows.slice(0, 50),
      });
    }

    // Insert into database
    const created = await prisma.payroll.createMany({
      data: parsed.rows.map(r => ({
        employeeName: r.employeeName,
        month: r.month,
        presentDays: r.presentDays,
        salary: r.salary,
        advance: r.advance,
        netPay: r.netPay,
      })),
    });

    try {
      await prisma.notification.create({
        data: {
          message: `${req.user?.name || 'Admin'} imported ${created.count} payroll records for ${parsed.summary.months.join(', ')}`,
        }
      });
    } catch (_) {}

    res.json({
      success: true,
      importedCount: created.count,
      summary: parsed.summary,
    });
  } catch (err) {
    console.error('Payroll import error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/vendorbills', authenticateToken, isAdmin, async (req, res) => {
  try {
    const bills = await prisma.vendorBill.findMany({ orderBy: { date: 'desc' } });
    res.json(bills);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vendorbills', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { vendorName, invoiceNo, amount, paid, pending, status, date } = req.body;
    const bill = await prisma.vendorBill.create({
      data: {
        vendorName, invoiceNo,
        amount: parseFloat(amount) || 0,
        paid: parseFloat(paid) || 0,
        pending: parseFloat(pending) || 0,
        status: status || 'Pending',
        date: date ? new Date(date) : undefined
      }
    });
    res.json(bill);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/vendorbills/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { vendorName, invoiceNo, amount, paid, pending, status, date } = req.body;
    const bill = await prisma.vendorBill.update({
      where: { id: parseInt(req.params.id) },
      data: {
        vendorName, invoiceNo,
        amount: parseFloat(amount) || 0,
        paid: parseFloat(paid) || 0,
        pending: parseFloat(pending) || 0,
        status: status || 'Pending',
        date: date ? new Date(date) : undefined
      }
    });
    res.json(bill);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Unknown API paths must answer with JSON (not the web page), so the app can show a clear error
app.use('/api', (req, res) => res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}. The server may need the latest update.` }));

// --- SERVE FRONTEND (FOR PRODUCTION) ---
const path = require('path');
const distPath = path.join(__dirname, '../dashboard/dist');
app.use(express.static(distPath));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
