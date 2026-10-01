require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { parseProductsFile, planImport } = require('./importParser');
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

app.get('/', (req, res) => res.json({ status: 'ok' }));
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
    const p = Number(body.price);
    if (blank(body.price) || !(p >= 0)) return { error: 'A valid sell price is required' };
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
    const qty = blank(qtyRaw) ? 0 : parseInt(qtyRaw);
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

// Bulk import products from a CSV / XLSX file. Existing products (same name or SKU) are skipped, never overwritten.
app.post('/api/stock/import', authenticateToken, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5 MB)' : err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let parsed;
    try {
      parsed = await parseProductsFile(req.file.buffer, req.file.originalname);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const existing = await prisma.product.findMany({ select: { name: true, sku: true } });
    const { toCreate, skipped } = planImport(parsed.rows, existing);

    let created = 0;
    if (toCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
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

        // suppliers: match by name (case-insensitive), create the ones that don't exist yet
        const wantedSup = [...new Set(toCreate.map(r => r.supplier).filter(Boolean))];
        let sups = await tx.supplier.findMany();
        const supLower = new Set(sups.map(x => x.name.toLowerCase()));
        const missingSup = [];
        const seenSup = new Set();
        for (const name of wantedSup) {
          const l = name.toLowerCase();
          if (!supLower.has(l) && !seenSup.has(l)) { seenSup.add(l); missingSup.push({ name }); }
        }
        if (missingSup.length) {
          await tx.supplier.createMany({ data: missingSup });
          sups = await tx.supplier.findMany();
        }
        const supIdByLower = new Map(sups.map(x => [x.name.toLowerCase(), x.id]));

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
            supplierId: r.supplier ? supIdByLower.get(r.supplier.toLowerCase()) ?? null : null,
          })),
        });
        created = result.count;
      }, { timeout: 30000 });

      if (req.user.role !== 'ADMIN') {
        await prisma.notification.create({ data: { message: `${req.user.name} imported ${created} products from a file` } });
      }
    }

    res.json({
      created,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 50),
      errorCount: parsed.errors.length,
      errors: parsed.errors.slice(0, 50),
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
      const q = parseInt(req.body.quantity);
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
    const { productId, type, quantity } = req.body;
    const product = await prisma.product.findUnique({ where: { id: parseInt(productId) } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    let newQuantity = product.quantity;
    if (type === 'SALE') {
      if (product.quantity < parseInt(quantity)) return res.status(400).json({ error: 'Insufficient stock' });
      newQuantity -= parseInt(quantity);
    } else if (type === 'PURCHASE') {
      newQuantity += parseInt(quantity);
    }
    
    const total = quantity * product.price;
    
    const transaction = await prisma.transaction.create({
      data: { productId: parseInt(productId), type, quantity: parseInt(quantity), total, userId: req.user.id }
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

app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({ include: { product: true } });
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
    const { title, amount, category, date } = req.body;
    const amt = parseFloat(amount);
    if (!title || !String(title).trim() || !(amt > 0)) {
      return res.status(400).json({ error: 'Title and an amount greater than 0 are required' });
    }
    const expense = await prisma.expense.create({
      data: {
        title: String(title).trim(),
        amount: amt,
        category: category || 'General',
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
    const { title, amount, category, date } = req.body;
    const amt = parseFloat(amount);
    if (!title || !String(title).trim() || !(amt > 0)) {
      return res.status(400).json({ error: 'Title and an amount greater than 0 are required' });
    }
    const expense = await prisma.expense.update({
      where: { id: parseInt(req.params.id) },
      data: {
        title: String(title).trim(),
        amount: amt,
        category: category || 'General',
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

// --- DASHBOARD REPORT DATA ---
app.get('/api/reports/dashboard', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.product.findMany();
    const transactions = await prisma.transaction.findMany();
    const expenses = await prisma.expense.findMany();
    
    const totalSales = transactions.filter(t => t.type === 'SALE').reduce((sum, t) => sum + t.total, 0);
    const totalPurchases = transactions.filter(t => t.type === 'PURCHASE').reduce((sum, t) => sum + t.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const profit = totalSales - totalPurchases - totalExpenses;
    
    const openingStockValue = products.reduce((sum, p) => sum + (p.openingStock * p.price), 0);
    const closingStockValue = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);
    
    res.json({
      totalSales,
      totalPurchases,
      totalExpenses,
      profit,
      openingStockValue,
      closingStockValue
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EXPORT STATISTICS ROUTE ---
app.get('/api/reports/export', authenticateToken, async (req, res) => {
  try {
    const exceljs = require('exceljs');
    const products = await prisma.product.findMany({ include: { category: true } });
    const transactions = await prisma.transaction.findMany({ include: { product: true }, orderBy: { createdAt: 'desc' } });
    const expenses = await prisma.expense.findMany();

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Store Analytics Dashboard';

    // Helper for styling headers
    const styleHeader = (worksheet) => {
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2ECC71' } };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    };

    // Sheet 1: Dashboard Summary
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 }
    ];
    styleHeader(summarySheet);
    
    const totalSales = transactions.filter(t => t.type === 'SALE').reduce((sum, t) => sum + t.total, 0);
    const totalPurchases = transactions.filter(t => t.type === 'PURCHASE').reduce((sum, t) => sum + t.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    summarySheet.addRows([
      { metric: 'Total Sales', value: `₹${totalSales}` },
      { metric: 'Total Purchases', value: `₹${totalPurchases}` },
      { metric: 'Total Expenses', value: `₹${totalExpenses}` },
      { metric: 'Net Profit', value: `₹${totalSales - totalPurchases - totalExpenses}` }
    ]);
    summarySheet.getColumn(2).alignment = { horizontal: 'right' };

    // Sheet 2: Products
    const prodSheet = workbook.addWorksheet('Products');
    prodSheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Price', key: 'price', width: 15 },
      { header: 'Opening Stock', key: 'opening', width: 20 },
      { header: 'Closing Stock', key: 'closing', width: 20 },
    ];
    styleHeader(prodSheet);
    products.forEach(p => prodSheet.addRow({ id: p.id, name: p.name, category: p.category?.name || '', price: `₹${p.price}`, opening: p.openingStock, closing: p.quantity }));

    // Sheet 3: Transactions
    const txSheet = workbook.addWorksheet('Transactions');
    txSheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'Quantity', key: 'qty', width: 15 },
      { header: 'Total Value', key: 'total', width: 15 },
      { header: 'Date', key: 'date', width: 25 },
    ];
    styleHeader(txSheet);
    transactions.forEach(t => txSheet.addRow({ id: t.id, type: t.type, product: t.product?.name || '', qty: t.quantity, total: `₹${t.total}`, date: t.createdAt.toLocaleString() }));

    // Sheet 4: Expenses
    const expSheet = workbook.addWorksheet('Expenses');
    expSheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Date', key: 'date', width: 25 },
    ];
    styleHeader(expSheet);
    expenses.forEach(e => expSheet.addRow({ id: e.id, title: e.title, category: e.category, amount: `₹${e.amount}`, date: e.createdAt.toLocaleString() }));

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment('Detailed_Statistics.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
