// Pure accounting logic (no database access) so the dashboard, P&L page and Excel export
// always show the SAME numbers.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- dates (always UTC, dates are stored at UTC midnight) ----------
const monthKey = (d) => {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
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

function availableMonths({ dailySales = [], expenses = [], payroll = [] }) {
  const set = new Set();
  dailySales.forEach(s => set.add(monthKey(s.date)));
  expenses.forEach(e => set.add(monthKey(e.expenseDate || e.createdAt)));
  payroll.forEach(p => set.add(monthKey(p.month)));
  return [...set].sort();
}

// The month that has the most complete data: months with sales are preferred over expense-only months
function defaultMonth(data) {
  const months = availableMonths(data);
  if (!months.length) return null;
  const withSales = new Set(data.dailySales.map(s => monthKey(s.date)));
  const candidates = months.filter(m => withSales.has(m));
  return (candidates.length ? candidates : months).slice(-1)[0];
}

function computePnL(data, month) {
  const { dailySales = [], expenses = [], payroll = [] } = data;
  const inMonth = (d) => (month ? monthKey(d) === month : true);

  const sales = { cash: 0, card: 0, upi: 0, zomato: 0, total: 0, discount: 0 };
  const byDayMap = new Map();
  dailySales.filter(s => inMonth(s.date)).forEach(s => {
    sales.cash += s.cash; sales.card += s.card; sales.upi += s.upi; sales.zomato += s.zomato; sales.discount += s.discount || 0;
    const k = dayKey(s.date);
    const r = byDayMap.get(k) || { date: k, cash: 0, card: 0, upi: 0, zomato: 0, total: 0 };
    r.cash += s.cash; r.card += s.card; r.upi += s.upi; r.zomato += s.zomato;
    r.total = r.cash + r.card + r.upi + r.zomato;
    byDayMap.set(k, r);
  });
  sales.total = sales.cash + sales.card + sales.upi + sales.zomato;
  const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

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
  const salaryCost = pay.reduce((s, p) => s + p.netPay, 0);

  const cogs = COGS_GROUPS.reduce((s, g) => s + (groupTotals[g] || 0), 0);
  const opexExpenseRows = Object.keys(groupTotals).filter(g => !COGS_GROUPS.includes(g));
  const staffExpenseSalary = groupTotals['Salary'] || 0; // manual "Salary" expense rows count with payroll
  const opexLines = [];
  const orderedGroups = [...OPEX_ORDER, ...opexExpenseRows.filter(g => !OPEX_ORDER.includes(g) && g !== 'Salary')];
  orderedGroups.forEach(g => { if (groupTotals[g]) opexLines.push({ group: g, amount: groupTotals[g] }); });
  const salaryLine = salaryCost + staffExpenseSalary;
  const opex = opexLines.reduce((s, l) => s + l.amount, 0) + salaryLine;

  const totalExpenses = cogs + opex; // everything that reduces profit
  const grossProfit = sales.total - cogs;
  const netProfit = sales.total - totalExpenses;
  const pct = (n) => (sales.total > 0 ? (n / sales.total) * 100 : 0);

  const byGroup = [
    ...COGS_GROUPS.filter(g => groupTotals[g]).map(g => ({ group: g, amount: groupTotals[g] })),
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
    cogs, grossProfit, opexLines, salaryLine, salaryCost, opex,
    totalExpenses, netProfit,
    margin: pct(netProfit), foodCostPct: pct(cogs), salaryPct: pct(salaryLine),
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
    return { month: m, label: monthLabel(m), sales: round2(p.sales.total), expenses: round2(p.totalExpenses), salary: round2(p.salaryLine), profit: round2(p.netProfit), margin: round2(p.margin) };
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
