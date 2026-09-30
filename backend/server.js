require('dotenv').config();
const express = require('express');
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
app.get('/api/stock', authenticateToken, async (req, res) => {
  try {
    const stock = await prisma.product.findMany();
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stock', authenticateToken, async (req, res) => {
  try {
    const { name, category, price, openingStock } = req.body;
    
    // Find or create category
    let categoryRecord = null;
    if (category) {
      categoryRecord = await prisma.category.findFirst({ where: { name: category } });
      if (!categoryRecord) {
        categoryRecord = await prisma.category.create({ data: { name: category } });
      }
    }

    const product = await prisma.product.create({
      data: { 
        name, 
        categoryId: categoryRecord ? categoryRecord.id : null, 
        price: parseFloat(price), 
        openingStock: parseInt(openingStock), 
        quantity: parseInt(openingStock) 
      }
    });
    
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({
        data: { message: `${req.user.name} added a new product: ${name}` }
      });
    }
    
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/stock/:id', authenticateToken, async (req, res) => {
  try {
    const { name, category, price, quantity } = req.body;
    const data = { name, price: parseFloat(price), quantity: parseInt(quantity) };
    if (category) {
      let categoryRecord = await prisma.category.findFirst({ where: { name: category } });
      if (!categoryRecord) categoryRecord = await prisma.category.create({ data: { name: category } });
      data.categoryId = categoryRecord.id;
    }
    const product = await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data
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
    const category = await prisma.category.create({ data: { name: req.body.name } });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} added a new category: ${req.body.name}` } });
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
    const expenses = await prisma.expense.findMany();
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const { title, amount, category } = req.body;
    const expense = await prisma.expense.create({
      data: { title, amount: parseFloat(amount), category }
    });
    if (req.user.role !== 'ADMIN') {
      await prisma.notification.create({ data: { message: `${req.user.name} added a new expense: ${title}` } });
    }
    res.json(expense);
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
