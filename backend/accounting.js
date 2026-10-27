// Pure accounting logic (no database access) so the dashboard, P&L page and Excel export
// always show the SAME numbers.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- dates (always consistent with Asia/Kolkata restaurant local time) ----------
const dayKey = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '';
  return x.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
const monthKey = (d) => {
  const k = dayKey(d);
  return k ? k.slice(0, 7) : '';
};
const monthLabel = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---------- expense categoriser ----------
// group = P&L section, category = detailed head. First matching rule wins.
const GROUPS = ['Food', 'Packaging', 'Gas', 'Transport', 'Staff', 'Salary', 'Commission', 'Rent', 'Marketing', 'Utilities', 'Maintenance', 'Tax', 'General'];

const RULES = [
  [/\bCASH\s*WITHDRAW/, 'Transfer', 'Cash Withdrawal'],
  [/\bGST\b/, 'Tax', 'GST Payment'],
  [/\bRENT\b/, 'Rent', 'Rent'],
  [/COMMISION|COMMISSION/, 'Commission', 'Parcel / Delivery Commission'],
  [/STAFF|\bOT\b|INCENTIVE|UNIFORM/, 'Staff', 'Staff OT / Incentive / Uniform'],
  [/MARKETING|DECORATION|DESING|DESIGN|BALLON|BALLOON|POSTER|BANNER/, 'Marketing', 'Marketing & Decoration'],
  [/SERVICE|REPAIR|CARPENTER|HARDWAR|\bHAR\b|WELDING|STELL|STEEL|PEST/, 'Maintenance', 'Repairs & Services'],
  [/PETROL|DIESAL|DIESEL|TEMPO/, 'Transport', 'Petrol / Diesel / Tempo'],
  [/\bGAS\b|CYLINDER/, 'Gas', 'Gas Cylinders'],
  [/KOLYA|KOYLA|COAL|CHARCOAL/, 'Gas', 'Charcoal / Coal (Kolya)'],
  [/CONTANIAR|CONTINAR|CONTAINER|PACKING|PACKAGING|\bBOX\b|FOIL/, 'Packaging', 'Containers & Packaging'],
  [/RECHARGE|WATER|ELECTRIC|\bLIGHT\b|INTERNET|LANDARY|LAUNDRY/, 'Utilities', 'Phone / Water / Laundry'],
  [/CHICKEN/, 'Food', 'Chicken'],
  [/MUTTON|FISH|PRAWN|EGG/, 'Food', 'Mutton / Fish / Egg'],
  [/COLD\s*DRINK|ICE\s*CREAM|SODA|BEVERAGE|KITCHEN WINE/, 'Food', 'Beverages & Desserts'],
  [/PANNER|PANEER|CREAM|AMUL|BUTTER|CHEESE|MILK|DAIRY|CURD|DAHI/, 'Food', 'Paneer & Dairy'],
  [/VEGETABLE|KANDA|LASOON|GARLIC|CHAKUDAR|MUSHRROM|MUSHROOM|FRUIT|ONION|TOMATO|POTATO/, 'Food', 'Vegetables & Fruits'],
  [/BHAKRI|\bPAV\b|BREAD|MAIDA|ROTI/, 'Food', 'Bread, Pav & Flour'],
  [/KIRANA|GROCERY|\bOIL\b|NOODLES|KAJU|MAGAJ|BARIK|\bSEV\b|SUPER\s*MARKET|D\s*MART|MASALA|RICE/, 'Food', 'Grocery & Dry Goods'],
  [/\bPAN\b|CHATAI/, 'Food', 'Paan & Misc Kitchen'],
  [/XEROX|SATIONRY|STATIONERY|MEDICAL|EXTRA|POOJA/, 'General', 'Office & Misc'],
];

function categorize(title) {
  const t = String(title || '').toUpperCase();
  for (const [re, group, category] of RULES) {
    if (re.test(t)) return { group, category };
  }
  return { group: 'General', category: 'Miscellaneous' };
}

// Group used for P&L (falls back to the categoriser for rows saved before groups existed)
function effectiveGroup(e) {
  if (e.group && e.group !== 'Auto') return e.group;
  return categorize(e.title).group;
}
function effectiveCategory(e) {
  if (e.category && !['Purchases', 'General', 'Bank', 'Other'].includes(e.category) && e.group) return e.category;
  return categorize(e.title).category;
}

// ---------- junk created by the old Excel importer ----------
// The old importer made a fake product + a "PURCHASE x1" order for every expense row, and a lump "SALE" per day.
function findImportJunk(products, transactions) {
  const byProduct = new Map();
  transactions.forEach(t => {
    if (!byProduct.has(t.productId)) byProduct.set(t.productId, []);
    byProduct.get(t.productId).push(t);
  });
  const junkProducts = [];
  products.forEach(p => {
    const tx = byProduct.get(p.id) || [];
    const isAssorted = p.id === 99999 || p.name === 'Assorted Items';
    const fake =
      isAssorted ||
      (Number(p.price) === 0 && Number(p.costPrice) > 0 && Number(p.quantity) === 0 && tx.length === 1 &&
        tx[0].type === 'PURCHASE' && Number(tx[0].quantity) === 1 &&
        Math.abs(Number(tx[0].total) - Number(p.costPrice)) < 0.01);
    if (fake) junkProducts.push(p);
  });
  const ids = new Set(junkProducts.map(p => p.id));
  const junkTx = transactions.filter(t => ids.has(t.productId));
  return { junkProducts, junkTx, ids };
}

// ---------- P&L ----------
const COGS_GROUPS = ['Food', 'Packaging'];
const OPEX_ORDER = ['Gas', 'Transport', 'Staff', 'Commission', 'Rent', 'Marketing', 'Utilities', 'Maintenance', 'General'];

function availableMonths({ dailySales = [], expenses = [], payroll = [], transactions = [], monthClosings = [] }) {
  const set = new Set();
  dailySales.forEach(s => { const k = monthKey(s.date); if (k) set.add(k); });
  expenses.forEach(e => { const k = monthKey(e.expenseDate || e.createdAt); if (k) set.add(k); });
  payroll.forEach(p => { const k = monthKey(p.month); if (k) set.add(k); });
  transactions.forEach(t => { const k = monthKey(t.createdAt); if (k) set.add(k); });
  (monthClosings || []).forEach(c => { if (c.month) set.add(c.month); });
  return [...set].sort();
}

// The month that has the most complete data: months with sales or inventory activity are preferred
function defaultMonth(data) {
  const months = availableMonths(data);
  if (!months.length) return null;
  const withSalesOrInv = new Set();
  (data.dailySales || []).forEach(s => { const k = monthKey(s.date); if (k) withSalesOrInv.add(k); });
  (data.transactions || []).forEach(t => { const k = monthKey(t.createdAt); if (k) withSalesOrInv.add(k); });
  (data.monthClosings || []).forEach(c => { if (c.month) withSalesOrInv.add(c.month); });
  const candidates = months.filter(m => withSalesOrInv.has(m));
  return (candidates.length ? candidates : months).slice(-1)[0];
}

function computePnL(data, monthParam) {
  const month = monthParam || data.month || null;
  const { dailySales = [], expenses = [], payroll = [], transactions = [], monthClosings = [] } = data;
  const inMonth = (d) => (month ? monthKey(d) === month : true);

  const sales = { cash: 0, card: 0, upi: 0, zomato: 0, total: 0, discount: 0 };
  const byDayMap = new Map();

  // 1. Process daily sales (both from DailySales register and SALE transactions)
  dailySales.filter(s => inMonth(s.date)).forEach(s => {
    sales.cash += s.cash; sales.card += s.card; sales.upi += s.upi; sales.zomato += s.zomato; sales.discount += s.discount || 0;
    const k = dayKey(s.date);
    if (!k) return;
    const r = byDayMap.get(k) || { date: k, cash: 0, card: 0, upi: 0, zomato: 0, sales: 0, inventory: 0, inventoryUnits: 0, items: [] };
    r.cash += s.cash; r.card += s.card; r.upi += s.upi; r.zomato += s.zomato;
    r.sales = round2(r.cash + r.card + r.upi + r.zomato);
    byDayMap.set(k, r);
  });

  // Stock Out orders only stand in for sales when no daily sales were recorded for the period.
  // Otherwise they would be counted on top of the POS sales (double counting).
  const hasDailySales = dailySales.some(s => inMonth(s.date));
  const saleTx = hasDailySales ? [] : transactions.filter(t => t.type === 'SALE' && inMonth(t.createdAt));
  saleTx.forEach(t => {
    const k = dayKey(t.createdAt);
    if (!k) return;
    const r = byDayMap.get(k) || { date: k, cash: 0, card: 0, upi: 0, zomato: 0, sales: 0, inventory: 0, inventoryUnits: 0, items: [] };
    const amt = Number(t.total) || 0;
    r.cash += amt;
    r.sales = round2(r.sales + amt);
    sales.cash += amt;
    byDayMap.set(k, r);
  });
  sales.total = round2(sales.cash + sales.card + sales.upi + sales.zomato);

  // 2. Process stock & inventory transactions
  // Opening stock (imported manually for this month)
  const openingTx = transactions.filter(t => t.type === 'OPENING_STOCK' && inMonth(t.createdAt));
  const openingStockTotal = round2(openingTx.reduce((sum, t) => sum + (Number(t.total) || 0), 0));
  const openingStockUnits = round2(openingTx.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0));

  openingTx.forEach(t => {
    const k = dayKey(t.createdAt);
    const r = byDayMap.get(k) || { date: k, cash: 0, card: 0, upi: 0, zomato: 0, sales: 0, inventory: 0, inventoryUnits: 0, items: [] };
    r.items.push({
      id: t.id,
      productName: (t.product?.name || 'Item') + ' (Opening Stock)',
      quantity: t.quantity,
      unit: t.product?.unit || 'pcs',
      total: t.total,
      price: t.product?.price || 0,
      createdAt: t.createdAt,
      type: 'OPENING_STOCK',
    });
    byDayMap.set(k, r);
  });

  // Purchases (inventory brought during the month)
  const purchaseTx = transactions.filter(t => t.type === 'PURCHASE' && inMonth(t.createdAt));
  const purchaseTotal = round2(purchaseTx.reduce((sum, t) => sum + (Number(t.total) || 0), 0));
  const purchaseUnits = round2(purchaseTx.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0));

  purchaseTx.forEach(t => {
    const k = dayKey(t.createdAt);
    const r = byDayMap.get(k) || { date: k, cash: 0, card: 0, upi: 0, zomato: 0, sales: 0, inventory: 0, inventoryUnits: 0, items: [] };
    r.inventory = round2((r.inventory || 0) + (Number(t.total) || 0));
    r.inventoryUnits = round2((r.inventoryUnits || 0) + (Number(t.quantity) || 0));
    r.items.push({
      id: t.id,
      productName: t.product?.name || 'Item',
      quantity: t.quantity,
      unit: t.product?.unit || 'pcs',
      total: t.total,
      price: t.product?.price || 0,
      createdAt: t.createdAt,
      type: 'PURCHASE',
    });
    byDayMap.set(k, r);
  });

  // Total stock available = Opening Stock + Purchases
  const totalStockAvailable = round2(openingStockTotal + purchaseTotal);
  const totalUnitsAvailable = round2(openingStockUnits + purchaseUnits);

  // Month-end closing stock for this month
  const closingRecord = month ? (monthClosings || []).find(c => c.month === month) : null;
  const isReconciled = !!closingRecord;
  const closingStockTotal = isReconciled ? round2(closingRecord.closingStockValue) : 0;
  const closingStockUnits = isReconciled ? round2(closingRecord.closingStockUnits) : 0;

  // Calculate day-by-day profit & running accumulated totals
  let accSales = 0;
  let accInv = 0;
  let accProfit = 0;
  const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => {
    const dayProfit = round2(d.sales - d.inventory);
    const dayMargin = d.sales > 0 ? round2((dayProfit / d.sales) * 100) : 0;
    accSales = round2(accSales + d.sales);
    accInv = round2(accInv + d.inventory);
    accProfit = round2(accProfit + dayProfit);
    return {
      ...d,
      total: d.sales, // for backward compatibility
      profit: dayProfit,
      margin: dayMargin,
      accumulatedSales: accSales,
      accumulatedInventory: accInv,
      accumulatedProfit: accProfit,
    };
  });

  // 3. Process expenses (overheads & manual expense rows)
  const groupTotals = {};
  const catMap = new Map();
  const modeMap = {};
  let tax = 0, transfer = 0;
  const rows = [];
  expenses.filter(e => inMonth(e.expenseDate || e.createdAt)).forEach(e => {
    const g = effectiveGroup(e);
    const c = effectiveCategory(e);
    rows.push({ ...e, _group: g, _category: c });
    if (g === 'Tax') { tax += e.amount; return; }
    if (g === 'Transfer') { transfer += e.amount; return; }
    groupTotals[g] = (groupTotals[g] || 0) + e.amount;
    const ck = `${g}||${c}`;
    catMap.set(ck, (catMap.get(ck) || 0) + e.amount);
    const mode = e.paymentMode || 'Cash';
    modeMap[mode] = (modeMap[mode] || 0) + e.amount;
  });

  const pay = payroll.filter(p => inMonth(p.month));
  const salaryCost = round2(pay.reduce((s, p) => s + p.netPay, 0));

  // Inventory consumed / COGS calculation:
  // Formula: Inventory Consumed = Opening Stock + Purchases - Closing Stock
  // (Closing stock reduces inventory consumption expense; it is not an additional expense)
  const expenseFoodCost = COGS_GROUPS.reduce((s, g) => s + (groupTotals[g] || 0), 0);
  let cogs = 0;
  if (isReconciled) {
    cogs = round2(totalStockAvailable - closingStockTotal);
  } else if (totalStockAvailable > 0) {
    cogs = totalStockAvailable;
  } else {
    cogs = expenseFoodCost;
  }
  const inventoryConsumed = cogs;

  // Operating expenses (exclude COGS groups if stock transactions are used, to avoid double counting)
  const hasStockData = totalStockAvailable > 0 || isReconciled;
  const opexExpenseRows = Object.keys(groupTotals).filter(g => hasStockData ? (!COGS_GROUPS.includes(g) && g !== 'Salary') : (!COGS_GROUPS.includes(g) && g !== 'Salary'));
  const staffExpenseSalary = groupTotals['Salary'] || 0; // manual "Salary" expense rows count with payroll
  const opexLines = [];
  const orderedGroups = [...OPEX_ORDER, ...opexExpenseRows.filter(g => !OPEX_ORDER.includes(g))];
  orderedGroups.forEach(g => { if (groupTotals[g]) opexLines.push({ group: g, amount: groupTotals[g] }); });
  const otherExpenses = round2(opexLines.reduce((s, l) => s + l.amount, 0));
  const salaryLine = round2(salaryCost + staffExpenseSalary);
  const opex = round2(otherExpenses + salaryLine);

  const totalExpenses = round2(cogs + opex); // Inventory Consumed + Operating Overheads + Salaries
  const grossProfit = round2(sales.total - cogs); // Gross Profit = Sales - Inventory Consumed
  const netProfit = round2(grossProfit - opex);   // Net Profit = Gross Profit - Payroll - Other Expenses
  const pct = (n) => (sales.total > 0 ? (n / sales.total) * 100 : 0);

  const byGroup = [
    ...(cogs > 0 ? [{ group: 'Inventory / Cost of Goods', amount: cogs }] : []),
    ...opexLines,
    ...(salaryLine ? [{ group: 'Salary & Wages', amount: salaryLine }] : []),
  ].sort((a, b) => b.amount - a.amount).map(r => ({ ...r, pct: pct(r.amount) }));

  const byCategory = [...catMap.entries()].map(([k, amount]) => {
    const [group, category] = k.split('||');
    return { group, category, amount };
  }).sort((a, b) => b.amount - a.amount);
  const byMode = Object.entries(modeMap).map(([mode, amount]) => ({ mode, amount })).sort((a, b) => b.amount - a.amount);

  return {
    month, label: month ? monthLabel(month) : 'All time',
    sales, byDay,
    openingStock: openingStockTotal,
    openingStockUnits,
    inventoryPurchases: purchaseTotal,
    inventoryUnits: purchaseUnits,
    totalStockAvailable,
    totalUnitsAvailable,
    closingStock: closingStockTotal,
    closingStockUnits,
    inventoryConsumed,
    isReconciled,
    closingRecord: closingRecord ? {
      id: closingRecord.id,
      month: closingRecord.month,
      closingDate: closingRecord.closingDate,
      openingStockValue: closingRecord.openingStockValue,
      purchasesValue: closingRecord.purchasesValue,
      totalAvailableValue: closingRecord.totalAvailableValue,
      closingStockValue: closingRecord.closingStockValue,
      consumedValue: closingRecord.consumedValue,
      fileName: closingRecord.fileName,
      reconciledAt: closingRecord.reconciledAt,
    } : null,
    cogs, grossProfit, opexLines, otherExpenses, salaryLine, salaryCost, opex,
    totalExpenses, netProfit,
    margin: pct(netProfit), grossMargin: pct(grossProfit), foodCostPct: pct(cogs), salaryPct: pct(salaryLine),
    rentPct: pct(groupTotals['Rent'] || 0),
    tax, transfer, byGroup, byCategory, byMode,
    expenseRows: rows,
    employees: pay.map(p => ({ name: p.employeeName, presentDays: p.presentDays, salary: p.salary, advance: p.advance, cost: p.netPay })),
  };
}

function monthlySeries(data, count = 6) {
  const months = availableMonths(data).slice(-count);
  return months.map(m => {
    const p = computePnL(data, m);
    return {
      month: m,
      label: monthLabel(m),
      sales: round2(p.sales.total),
      inventory: round2(p.cogs),
      grossProfit: round2(p.grossProfit),
      expenses: round2(p.totalExpenses),
      salary: round2(p.salaryLine),
      profit: round2(p.netProfit),
      margin: round2(p.margin),
    };
  });
}

// ---------- data health checks (shown in the Excel "Data Checks" sheet) ----------
function dataChecks({ products = [], transactions = [], expenses = [], dailySales = [], payroll = [], vendorBills = [] }) {
  const out = [];
  const add = (level, title, detail) => out.push({ level, title, detail });

  const { junkProducts, junkTx } = findImportJunk(products, transactions);
  if (junkProducts.length) add('warn', 'Fake products / orders from old Excel import',
    `${junkProducts.length} products and ${junkTx.length} orders were auto-created from expense & sales rows. They are excluded from this report. Use "Clean up" on the Expenses page to remove them.`);
  else add('ok', 'No fake products / orders', 'Inventory and Orders contain only real stock entries.');

  const uncat = expenses.filter(e => !e.group).length;
  if (uncat) add('warn', 'Expenses without a group', `${uncat} expenses had no group - the report auto-detected one from the title. "Clean up" saves the groups permanently.`);
  else add('ok', 'All expenses are categorised', '');

  const salesM = new Set(dailySales.map(s => monthKey(s.date)));
  const payM = new Set(payroll.map(p => monthKey(p.month)));
  const expByM = {};
  expenses.forEach(e => { const k = monthKey(e.expenseDate || e.createdAt); expByM[k] = (expByM[k] || 0) + 1; });
  Object.entries(expByM).forEach(([m, n]) => {
    if (!salesM.has(m)) add('warn', `Expenses in ${monthLabel(m)} but no sales`, `${n} expense rows fall in ${monthLabel(m)} where no sales are recorded. If they belong to the previous month, edit their date.`);
  });
  salesM.forEach(m => { if (!payM.has(m)) add('warn', `No payroll for ${monthLabel(m)}`, 'Sales exist for this month but salaries are not entered - profit is overstated.'); });

  const cash = expenses.filter(e => (e.paymentMode || '').toLowerCase() === 'cash');
  if (cash.length >= 10) {
    const c = {}; cash.forEach(e => { const k = dayKey(e.expenseDate || e.createdAt); c[k] = (c[k] || 0) + 1; });
    const [topDay, topN] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    if (topN / cash.length >= 0.8) add('info', 'Cash expenses are not day-wise', `${Math.round((topN / cash.length) * 100)}% of cash expenses are dated ${topDay} (month totals). Monthly figures are correct; daily cash trends are not available.`);
  }

  if (dailySales.length >= 5) {
    const tots = dailySales.map(s => ({ d: dayKey(s.date), t: s.cash + s.card + s.upi + s.zomato })).sort((a, b) => a.t - b.t);
    const med = tots[Math.floor(tots.length / 2)].t;
    const top = tots[tots.length - 1];
    if (top.t > 50000 && top.t > med * 5) add('info', 'One day holds a large lump of sales', `${top.d} shows ${Math.round(top.t).toLocaleString('en-IN')} (typical day ~${Math.round(med).toLocaleString('en-IN')}). This looks like a month-end balancing figure (cash sales were only available as a monthly total), so the daily chart spikes on that day. Monthly totals are unaffected.`);
  }

  const seen = new Map(); let dup = 0;
  expenses.forEach(e => {
    const k = `${String(e.title).toUpperCase()}|${e.amount}|${dayKey(e.expenseDate || e.createdAt)}|${e.paymentMode}`;
    if (seen.has(k)) dup++; else seen.set(k, 1);
  });
  if (dup) add('warn', 'Possible duplicate expenses', `${dup} expense rows have the same title, amount, date and payment mode as another row.`);
  else add('ok', 'No duplicate expenses found', '');

  if (payroll.length && payroll.every(p => !p.advance)) add('info', 'Salary advances are not recorded', 'All advances show 0; the cost column already includes the advance, so the profit is correct.');

  const pending = vendorBills.filter(b => (b.pending || 0) > 0);
  if (vendorBills.length && pending.length === vendorBills.length) add('info', 'Every vendor bill is marked Pending', `All ${vendorBills.length} bills show as unpaid (${Math.round(pending.reduce((s, b) => s + b.pending, 0)).toLocaleString('en-IN')}). Mark paid bills as Paid on the Vendor Bills page.`);

  const zeroPrice = products.filter(p => !(Number(p.price) > 0) && !findImportJunk([p], transactions.filter(t => t.productId === p.id)).junkProducts.length).length;
  if (zeroPrice) add('info', 'Products with price 0', `${zeroPrice} real products have no selling price, so their stock value shows as 0.`);

  return out;
}

module.exports = {
  GROUPS, MONTHS, monthKey, monthLabel, dayKey, round2,
  categorize, effectiveGroup, effectiveCategory, findImportJunk,
  availableMonths, defaultMonth, computePnL, monthlySeries, dataChecks,
  COGS_GROUPS, OPEX_ORDER,
};
