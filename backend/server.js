require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { parseProductsFile, planImport, mergeDuplicateRows } = require('./importParser');
const { parseOrdersFile } = require('./purchaseParser');
const Acc = require('./accounting');
const repair = require('./repair');
const { buildWorkbookBuffer } = require('./exportWorkbook');
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
  if (has('emoji')) data.emoji = blank(body.emoji) ? '📦' : String(body.emoji).trim().slice(0, 8);
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

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

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
    const recordPurchase = String(req.body.recordPurchase) === 'true'; // off by default: importing inventory must NOT create orders

    const { rows, mergedCount } = mergeDuplicateRows(parsed.rows);
    const existing = await prisma.product.findMany({ select: { id: true, name: true, sku: true, quantity: true, price: true, unit: true } });
    const { toCreate, addUps, skipped } = planImport(rows, existing);

    const base = {
      toCreateCount: toCreate.length,
      newNames: toCreate.slice(0, 50).map(r => r.name),
      addUpCount: addUps.length,
      addUps: addUps.slice(0, 60).map(a => ({
        row: a.row, name: a.product.name, add: a.add, unit: a.product.unit,
        before: a.product.quantity, after: round3(a.product.quantity + a.add),
      })),
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 50),
      errorCount: parsed.errors.length,
      errors: parsed.errors.slice(0, 50),
      mergedCount,
      ignoredSheets: parsed.ignoredSheets,
    };
    if (preview) return res.json({ preview: true, ...base });

    // suppliers + their phone numbers are handled for every row
    const sup = await syncSuppliers(rows.filter(r => r.supplier).map(r => ({ name: r.supplier, phone: r.supplierPhone })));

    let created = 0;
    let added = 0;
    let recordedTotal = 0;
    if (toCreate.length > 0 || addUps.length > 0) {
      await prisma.$transaction(async (tx) => {
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

          const result = await tx.product.createMany({
            data: toCreate.map(r => ({
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
            })),
          });
          created = result.count;
        }

        for (const a of addUps) {
          const cur = await tx.product.findUnique({ where: { id: a.product.id } });
          if (!cur) continue;
          await tx.product.update({ where: { id: cur.id }, data: { quantity: round3(cur.quantity + a.add) } });
          if (recordPurchase) {
            const rate = a.rate > 0 ? a.rate : cur.price;
            const total = round2(a.add * rate);
            await tx.transaction.create({
              data: { productId: cur.id, type: 'PURCHASE', quantity: a.add, total, userId: req.user.id },
            });
            recordedTotal = round2(recordedTotal + total);
          }
          added++;
        }
      }, { timeout: 120000, maxWait: 20000 });

      if (req.user.role !== 'ADMIN') {
        await prisma.notification.create({ data: { message: `${req.user.name} imported a file: ${created} new products, stock added to ${added}` } });
      }
    }

    res.json({
      ...base,
      created,
      added,
      recordedPurchase: recordPurchase,
      recordedTotal,
      suppliersAdded: sup.added,
      suppliersUpdated: sup.updated,
    });
  } catch (err) {
    console.error(err);
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
    const categories = await prisma.category.findMany();
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
    const category = await prisma.category.create({ data: { name } });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} added a new category: ${name}` } });
    }
    res.json(category);
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

    const total = Math.round(qty * product.price * 100) / 100;

    const transaction = await prisma.transaction.create({
      data: { productId: parseInt(productId), type, quantity: qty, total, userId: req.user.id }
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
app.put('/api/transactions/:id', authenticateToken, isAdmin, async (req, res) => {
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

    const newProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!newProduct) return res.status(404).json({ error: 'Product not found' });

    let total;
    if (req.body.total !== undefined && req.body.total !== '' && req.body.total !== null) {
      total = round2(parseFloat(req.body.total));
      if (!(total >= 0)) return res.status(400).json({ error: 'Total must be 0 or more' });
    } else {
      total = round2(qty * newProduct.price);
    }
    let createdAt = old.createdAt;
    if (req.body.date) {
      const d = new Date(req.body.date);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid date' });
      createdAt = d;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (adjustStock) {
        // 1) undo old effect
        const oldProd = await tx.product.findUnique({ where: { id: old.productId } });
        if (oldProd) {
          const undone = round3(oldProd.quantity + (old.type === 'SALE' ? old.quantity : -old.quantity));
          if (undone < 0) throw new Error(`Cannot edit: stock of "${oldProd.name}" would go negative. Tick "Don't change stock" to edit the record only.`);
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
        data: { type, productId, quantity: qty, total, createdAt },
        include: { product: true },
      });
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete one or many orders: DELETE /api/transactions  body { ids: [1,2,3], revertStock: false }
// By default stock is NOT changed (so removing wrongly-created orders never touches your inventory).
// `revertStock=true` also undoes the stock effect of each deleted order.
app.delete('/api/transactions', authenticateToken, isAdmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(n => parseInt(n)).filter(Number.isInteger) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'No orders selected' });
    const revertStock = req.body.revertStock === true || String(req.body.revertStock) === 'true';

    const deleted = await prisma.$transaction(async (tx) => {
      const rows = await tx.transaction.findMany({ where: { id: { in: ids } } });
      if (revertStock) {
        for (const t of rows) {
          const p = await tx.product.findUnique({ where: { id: t.productId } });
          if (!p) continue;
          const q = round3(p.quantity + (t.type === 'SALE' ? t.quantity : -t.quantity));
          if (q < 0) throw new Error(`Cannot reverse stock for "${p.name}" (it would go negative). Delete without changing stock instead.`);
          await tx.product.update({ where: { id: p.id }, data: { quantity: q } });
        }
      }
      const r = await tx.transaction.deleteMany({ where: { id: { in: rows.map(t => t.id) } } });
      return r.count;
    }, { timeout: 60000, maxWait: 20000 });
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

// --- ACCOUNTING DATA (shared by dashboard, P&L page, Expenses page and the Excel export) ---
async function loadAccounting() {
  const [expenses, dailySales, payroll] = await Promise.all([
    prisma.expense.findMany(),
    prisma.dailySales.findMany(),
    prisma.payroll.findMany(),
  ]);
  return { expenses, dailySales, payroll };
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

// --- DASHBOARD REPORT DATA ---
app.get('/api/reports/dashboard', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.product.findMany({ select: { quantity: true, openingStock: true, price: true } });
    const transactions = await prisma.transaction.findMany({ select: { type: true, total: true } });
    const data = await loadAccounting();
    const month = pickMonth(data, req.query.month);
    const pnl = Acc.computePnL(data, month);
    const totalPurchases = transactions.filter(t => t.type === 'PURCHASE').reduce((sum, t) => sum + t.total, 0);
    res.json({
      month, label: pnl.label,
      months: Acc.availableMonths(data).map(m => ({ key: m, label: Acc.monthLabel(m) })),
      totalSales: pnl.sales.total,
      totalPurchases,                       // stock bought via Orders (not added to expenses - avoids double counting)
      totalExpenses: pnl.totalExpenses,     // food + packaging + operating expenses + salaries
      profit: pnl.netProfit,
      margin: pnl.margin,
      foodCostPct: pnl.foodCostPct,
      salaryPct: pnl.salaryPct,
      openingStockValue: products.reduce((sum, p) => sum + (p.openingStock * p.price), 0),
      closingStockValue: products.reduce((sum, p) => sum + (p.quantity * p.price), 0),
      monthly: Acc.monthlySeries(data, 6),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EXPORT STATISTICS (multi-sheet Excel with native charts) ---
app.get('/api/reports/export', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [products, transactions, expenses, dailySales, payroll, vendorBills] = await Promise.all([
      prisma.product.findMany({ include: { category: true } }),
      prisma.transaction.findMany({ include: { product: true } }),
      prisma.expense.findMany(),
      prisma.dailySales.findMany(),
      prisma.payroll.findMany(),
      prisma.vendorBill.findMany(),
    ]);
    const data = { products, transactions, expenses, dailySales, payroll, vendorBills };
    const month = pickMonth({ expenses, dailySales, payroll }, req.query.month);
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
app.get('/api/dailysales', authenticateToken, async (req, res) => {
  try {
    const sales = await prisma.dailySales.findMany({ orderBy: { date: 'desc' } });
    res.json(sales);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dailysales', authenticateToken, async (req, res) => {
  try {
    const { date, cash, card, upi, zomato, discount } = req.body;
    const sale = await prisma.dailySales.create({
      data: {
        date: new Date(date),
        cash: parseFloat(cash) || 0,
        card: parseFloat(card) || 0,
        upi: parseFloat(upi) || 0,
        zomato: parseFloat(zomato) || 0,
        discount: parseFloat(discount) || 0,
      }
    });
    res.json(sale);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/payroll', authenticateToken, async (req, res) => {
  try {
    const payroll = await prisma.payroll.findMany({ orderBy: { month: 'desc' } });
    res.json(payroll);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/payroll', authenticateToken, async (req, res) => {
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

app.get('/api/vendorbills', authenticateToken, async (req, res) => {
  try {
    const bills = await prisma.vendorBill.findMany({ orderBy: { date: 'desc' } });
    res.json(bills);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vendorbills', authenticateToken, async (req, res) => {
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

app.put('/api/vendorbills/:id', authenticateToken, async (req, res) => {
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
