// One-click clean-up of the mess left by the old Excel importer.
// Every step is previewed first and only runs when the admin confirms it.
const A = require('./accounting');

const IMPORT_VENDORS = ['CHICKEN', 'PAYAL', 'JIVDANI VEGETABLE', 'AMBIKA ENTERPRIES'];
const IMPORT_CATEGORIES = ['bank purchases', 'sales', 'kitchen exp'];
const BANK_MODES = ['bank', 'icici', 'svc'];

const prevMonthKey = (key) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const lastDayOf = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this one
};

async function load(prisma) {
  const [products, transactions, expenses, dailySales, vendorBills, categories] = await Promise.all([
    prisma.product.findMany({ select: { id: true, name: true, price: true, costPrice: true, quantity: true, categoryId: true } }),
    prisma.transaction.findMany({ select: { id: true, productId: true, type: true, quantity: true, total: true } }),
    prisma.expense.findMany(),
    prisma.dailySales.findMany({ select: { date: true } }),
    prisma.vendorBill.findMany(),
    prisma.category.findMany({ include: { _count: { select: { products: true } } } }),
  ]);
  return { products, transactions, expenses, dailySales, vendorBills, categories };
}

function plan(d) {
  const { junkProducts, junkTx, ids } = A.findImportJunk(d.products, d.transactions);

  // categories that would become empty and were created by the importer
  const remaining = new Map();
  d.products.filter(p => !ids.has(p.id)).forEach(p => remaining.set(p.categoryId, (remaining.get(p.categoryId) || 0) + 1));
  const emptyCategories = d.categories.filter(c => IMPORT_CATEGORIES.includes(c.name.toLowerCase()) && !remaining.get(c.id));

  const salesMonths = new Set(d.dailySales.map(s => A.monthKey(s.date)));
  const importRows = d.expenses.filter(e => !e.group);

  const shift = [];
  importRows.forEach(e => {
    const dt = new Date(e.expenseDate || e.createdAt);
    const k = A.monthKey(dt);
    if (!BANK_MODES.includes(String(e.paymentMode || '').toLowerCase())) return;
    if (dt.getUTCDate() > 5) return;
    const prev = prevMonthKey(k);
    if (!salesMonths.has(k) && salesMonths.has(prev)) shift.push({ id: e.id, title: e.title, amount: e.amount, from: dt, to: lastDayOf(prev) });
  });

  const billsToPay = d.vendorBills.filter(b => b.status === 'Pending' && !(b.paid > 0) && b.invoiceNo && IMPORT_VENDORS.includes(String(b.vendorName).toUpperCase()));

  return { junkProducts, junkTx, junkIds: ids, emptyCategories, importRows, shift, billsToPay };
}

async function preview(prisma) {
  const d = await load(prisma);
  const p = plan(d);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  return {
    needsRepair: p.junkProducts.length > 0 || p.importRows.length > 0 || p.shift.length > 0,
    junk: { products: p.junkProducts.length, orders: p.junkTx.length, categories: p.emptyCategories.length, sample: p.junkProducts.slice(0, 6).map(x => x.name) },
    categorize: { count: p.importRows.length },
    shift: { count: p.shift.length, amount: sum(p.shift, x => x.amount), sample: p.shift.slice(0, 4).map(x => x.title) },
    bills: { count: p.billsToPay.length, amount: sum(p.billsToPay, x => x.amount) },
  };
}

async function apply(prisma, opts = {}) {
  const d = await load(prisma);
  const p = plan(d);
  const done = { removedProducts: 0, removedOrders: 0, removedCategories: 0, categorized: 0, shifted: 0, billsPaid: 0 };

  await prisma.$transaction(async (tx) => {
    // 1) move early-month bank payments back into the month the sheet counted them in
    if (opts.shiftDates !== false && p.shift.length) {
      const byTarget = new Map();
      p.shift.forEach(s => { const k = s.to.toISOString(); if (!byTarget.has(k)) byTarget.set(k, []); byTarget.get(k).push(s.id); });
      for (const [iso, ids] of byTarget) {
        const r = await tx.expense.updateMany({ where: { id: { in: ids } }, data: { expenseDate: new Date(iso) } });
        done.shifted += r.count;
      }
    }
    // 2) permanent groups + categories for every expense that has none
    if (opts.categorize !== false && p.importRows.length) {
      const buckets = new Map();
      p.importRows.forEach(e => {
        const c = A.categorize(e.title);
        const k = `${c.group}||${c.category}`;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(e.id);
      });
      for (const [k, ids] of buckets) {
        const [group, category] = k.split('||');
        const r = await tx.expense.updateMany({ where: { id: { in: ids } }, data: { group, category } });
        done.categorized += r.count;
      }
    }
    // 3) delete fake products + their fake orders (orders first: foreign key)
    if (opts.removeJunk !== false && p.junkProducts.length) {
      const pids = p.junkProducts.map(x => x.id);
      const t = await tx.transaction.deleteMany({ where: { productId: { in: pids } } });
      done.removedOrders = t.count;
      const r = await tx.product.deleteMany({ where: { id: { in: pids } } });
      done.removedProducts = r.count;
      if (p.emptyCategories.length) {
        const c = await tx.category.deleteMany({ where: { id: { in: p.emptyCategories.map(x => x.id) } } });
        done.removedCategories = c.count;
      }
    }
    // 4) bills that came with an invoice number in the food-purchase sheet are settled; only the "pending bill" block stays unpaid
    if (opts.markBillsPaid !== false && p.billsToPay.length) {
      for (const b of p.billsToPay) {
        await tx.vendorBill.update({ where: { id: b.id }, data: { paid: b.amount, pending: 0, status: 'Paid' } });
        done.billsPaid++;
      }
    }
  }, { timeout: 60000, maxWait: 20000 });
  return done;
}

module.exports = { preview, apply, plan };
