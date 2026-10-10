const ExcelJS = require('exceljs');
const { injectCharts, ref } = require('./xlsxCharts');
const A = require('./accounting');

const COL = {
  navy: 'FF0F1B2D', green: 'FF2ECC71', greenDark: 'FF16A34A', red: 'FFEF4444', amber: 'FFF59E0B',
  grey: 'FF8A94A6', light: 'FFF4F5F7', zebra: 'FFFAFBFC', white: 'FFFFFFFF', border: 'FFE3E6EB',
  okBg: 'FFD6F5E3', warnBg: 'FFFEF3C7', infoBg: 'FFE0F2FE', badBg: 'FFFEE2E2',
};
const FMT = {
  money: '"₹"#,##0;[Red]-"₹"#,##0;"-"',
  money2: '"₹"#,##0.00;[Red]-"₹"#,##0.00;"-"',
  pct: '0.0%;[Red]-0.0%;"-"',
  date: 'dd-mmm-yyyy',
  int: '#,##0;-#,##0;"-"',
  num: '#,##0.##;-#,##0.##;"-"',
  axis: '#,##0',
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const val = (v) => (v && typeof v === 'object' && 'result' in v ? v.result : v);
const thin = { style: 'thin', color: { argb: COL.border } };
const boxBorder = { top: thin, left: thin, bottom: thin, right: thin };
const asDate = (d) => { const x = new Date(d); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())); };
const L = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function setup(ws, { tab, widths = [], landscape = true }) {
  ws.properties.tabColor = { argb: tab };
  ws.views = [{ showGridLines: false, state: 'normal' }];
  widths.forEach((w, i) => { if (w) ws.getColumn(i + 1).width = w; });
  ws.pageSetup = { orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

function band(ws, row, c1, c2, text, { size = 16, fill = COL.navy, color = COL.white, height = 30, bold = true, align = 'left' } = {}) {
  ws.mergeCells(row, c1, row, c2);
  const cell = ws.getCell(row, c1);
  cell.value = text;
  cell.font = { name: 'Calibri', size, bold, color: { argb: color } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.alignment = { vertical: 'middle', horizontal: align, indent: 1 };
  ws.getRow(row).height = height;
}

function sectionHeader(ws, row, c1, c2, text) {
  ws.mergeCells(row, c1, row, c2);
  const cell = ws.getCell(row, c1);
  cell.value = text;
  cell.font = { size: 12, bold: true, color: { argb: COL.navy } };
  cell.border = { bottom: { style: 'medium', color: { argb: COL.green } } };
  cell.alignment = { vertical: 'middle' };
  ws.getRow(row).height = 22;
}

// Writes a styled table. rows: array of arrays. formats: { colIndex(0-based): numFmt }.
// totals: array of 0-based column indexes that get a SUM/SUBTOTAL row. Returns the row/col coordinates used.
function writeTable(ws, { row, col = 1, headers, rows, formats = {}, totals = null, totalLabel = 'TOTAL', subtotal = false, filter = false, align = {} }) {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, col + i);
    c.value = h;
    c.font = { bold: true, color: { argb: COL.white }, size: 10.5 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL.navy } };
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : (formats[i] ? 'right' : 'left'), wrapText: true, indent: i === 0 ? 1 : 0 };
    c.border = boxBorder;
  });
  ws.getRow(row).height = 24;
  rows.forEach((r, ri) => {
    const rr = row + 1 + ri;
    r.forEach((v, i) => {
      const c = ws.getCell(rr, col + i);
      c.value = v === undefined ? null : v;
      if (formats[i]) c.numFmt = formats[i];
      c.border = boxBorder;
      c.font = { size: 10.5 };
      c.alignment = { vertical: 'middle', horizontal: align[i] || (formats[i] ? 'right' : 'left'), indent: i === 0 ? 1 : 0 };
      if (ri % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL.zebra } };
    });
  });
  const first = row + 1, last = row + rows.length;
  let totalRow = null;
  if (totals && rows.length) {
    totalRow = last + 1;
    const lc = ws.getCell(totalRow, col);
    lc.value = totalLabel;
    headers.forEach((_, i) => {
      const c = ws.getCell(totalRow, col + i);
      c.font = { bold: true, size: 10.5 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL.light } };
      c.border = { top: { style: 'medium', color: { argb: COL.navy } }, bottom: thin, left: thin, right: thin };
      if (formats[i]) { c.numFmt = formats[i]; c.alignment = { horizontal: 'right' }; }
    });
    lc.alignment = { indent: 1 };
    totals.forEach(i => {
      const letter = L(col + i);
      const result = sum(rows.map(r => val(r[i])));
      ws.getCell(totalRow, col + i).value = {
        formula: subtotal ? `SUBTOTAL(109,${letter}${first}:${letter}${last})` : `SUM(${letter}${first}:${letter}${last})`,
        result,
      };
    });
  }
  if (filter && rows.length) ws.autoFilter = { from: { row, column: col }, to: { row: last, column: col + headers.length - 1 } };
  return { headerRow: row, first, last, totalRow, col, count: rows.length };
}

function emptyNote(ws, row, col, text) {
  const c = ws.getCell(row, col);
  c.value = text;
  c.font = { italic: true, color: { argb: COL.grey } };
}

// ============================================================================================
async function buildWorkbookBuffer(data, opts = {}) {
  const { products = [], transactions = [], expenses = [], dailySales = [], payroll = [], vendorBills = [] } = data;
  const months = A.availableMonths({ dailySales, expenses, payroll });
  const focusMonth = opts.month === 'all' ? null : (opts.month && months.includes(opts.month) ? opts.month : A.defaultMonth({ dailySales, expenses, payroll }));
  const focus = A.computePnL({ dailySales, expenses, payroll }, focusMonth);
  const pnlMonths = months.slice(-12);
  const pnlBy = Object.fromEntries(pnlMonths.map(m => [m, A.computePnL({ dailySales, expenses, payroll }, m)]));
  const periodLabel = focusMonth ? A.monthLabel(focusMonth) : 'All months';
  const { junkProducts, junkTx, ids: junkIds } = A.findImportJunk(products, transactions);
  const realProducts = products.filter(p => !junkIds.has(p.id));
  const realTx = transactions.filter(t => !junkIds.has(t.productId));
  const checks = A.dataChecks(data);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Takatak Inventory Manager';
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const charts = [];

  // -------------------------------------------------------------------- 1. SUMMARY
  {
    const S = 'Summary';
    const ws = wb.addWorksheet(S);
    setup(ws, { tab: COL.green, widths: [2, 24, 15, 17, 17, 15, 15, 15, 13, 3, 12, 12, 12, 12, 12, 12, 12, 12] });
    band(ws, 1, 2, 18, 'Takatak - Business Statistics Report', { size: 20, height: 40 });
    band(ws, 2, 2, 18, `Period: ${periodLabel}   |   Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}   |   Profit = Sales - Food & Packaging - Operating expenses - Salaries (GST and cash withdrawals excluded)`, { size: 10, fill: COL.light, color: 'FF5B6577', height: 22, bold: false });

    const profitColor = focus.netProfit >= 0 ? COL.greenDark : COL.red;
    const tiles = [
      ['TOTAL SALES', focus.sales.total, FMT.money, COL.navy, 'Net of tax'],
      ['TOTAL COSTS', focus.totalExpenses, FMT.money, COL.amber, `${focus.sales.total ? (focus.totalExpenses / focus.sales.total * 100).toFixed(1) : 0}% of sales`],
      [focus.netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS', focus.netProfit, FMT.money, profitColor, `${focus.margin.toFixed(1)}% margin`],
      ['FOOD COST %', focus.foodCostPct / 100, FMT.pct, COL.navy, 'Food + packaging / sales'],
      ['SALARY COST %', focus.salaryPct / 100, FMT.pct, COL.navy, `${focus.employees.length} staff`],
      ['RENT %', focus.rentPct / 100, FMT.pct, COL.navy, 'Rent / sales'],
    ];
    // tiles sit on columns B..I in pairs (B:C, D:E, F:G, H:I) then K:L, M:N
    const tilePos = [[2, 3], [4, 5], [6, 7], [8, 9], [11, 12], [13, 14]];
    tiles.forEach((t, i) => {
      const [a, b] = tilePos[i];
      [4, 5, 6].forEach(r => ws.mergeCells(r, a, r, b));
      const lab = ws.getCell(4, a), v = ws.getCell(5, a), sub = ws.getCell(6, a);
      lab.value = t[0]; lab.font = { size: 9, bold: true, color: { argb: COL.grey } };
      v.value = t[1]; v.numFmt = t[2]; v.font = { size: 20, bold: true, color: { argb: t[3] } };
      sub.value = t[4]; sub.font = { size: 9, color: { argb: COL.grey } };
      [lab, v, sub].forEach(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL.light } }; c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }; });
      ws.getCell(4, a).border = { top: { style: 'medium', color: { argb: t[3] } } };
      ws.getCell(4, b).border = { top: { style: 'medium', color: { argb: t[3] } } };
    });
    ws.getRow(5).height = 34;

    // Month-wise table
    sectionHeader(ws, 8, 2, 9, 'Month-wise summary');
    const mrows = pnlMonths.map((m, idx) => {
      const p = pnlBy[m]; const r = 10 + idx;
      return [
        A.monthLabel(m), r2(p.sales.total), r2(p.cogs), r2(p.opex - p.salaryLine), r2(p.salaryLine),
        r2(p.totalExpenses), r2(p.netProfit), p.sales.total ? p.netProfit / p.sales.total : 0,
      ];
    });
    // header: Month | Sales | Food & Packaging | Other Opex | Salaries | Total Costs | Net Profit | Margin  (columns B..I)
    const mt = writeTable(ws, {
      row: 9, col: 2, headers: ['Month', 'Sales', 'Food & Packaging', 'Other Expenses', 'Salaries', 'Total Costs', 'Net Profit', 'Margin'],
      rows: mrows,
      formats: { 1: FMT.money, 2: FMT.money, 3: FMT.money, 4: FMT.money, 5: FMT.money, 6: FMT.money, 7: FMT.pct }, totals: null,
    });
    // fix formulas now that the real column letters are known (B=Month C=Sales D=Food E=Other F=Sal G=Total H=Profit I=Margin)
    pnlMonths.forEach((m, idx) => {
      const r = 10 + idx; const p = pnlBy[m];
      ws.getCell(r, 7).value = { formula: `SUM(D${r}:F${r})`, result: r2(p.totalExpenses) };
      ws.getCell(r, 8).value = { formula: `C${r}-G${r}`, result: r2(p.netProfit) };
      ws.getCell(r, 9).value = { formula: `IF(C${r}=0,0,H${r}/C${r})`, result: p.sales.total ? p.netProfit / p.sales.total : 0 };
      ws.getCell(r, 8).font = { bold: true, size: 10.5, color: { argb: p.netProfit >= 0 ? COL.greenDark : COL.red } };
    });
    let cursor = 10 + Math.max(mt.count, 1) + 2;
    if (!mt.count) emptyNote(ws, 10, 2, 'No data yet.');

    // Expense mix
    sectionHeader(ws, cursor, 2, 9, `Where the money went - ${periodLabel}`);
    const mix = focus.byGroup;
    const mixTable = writeTable(ws, {
      row: cursor + 1, col: 2, headers: ['Cost head', 'Amount', '% of sales'],
      rows: mix.map(g => [g.group, r2(g.amount), g.pct / 100]), formats: { 1: FMT.money, 2: FMT.pct }, totals: [1],
    });
    const mixRows = cursor + 1 + Math.max(mix.length, 1) + 2;
    if (!mix.length) emptyNote(ws, cursor + 2, 2, 'No expenses recorded for this period.');

    // Sales channels
    const chStart = mixRows + 1;
    sectionHeader(ws, chStart, 2, 9, `How customers paid - ${periodLabel}`);
    const channels = [['Cash', focus.sales.cash], ['Card', focus.sales.card], ['UPI / Online', focus.sales.upi], ['Zomato', focus.sales.zomato]].filter(c => c[1] > 0);
    const chTable = writeTable(ws, {
      row: chStart + 1, col: 2, headers: ['Channel', 'Amount', 'Share'],
      rows: channels.map(c => [c[0], r2(c[1]), focus.sales.total ? c[1] / focus.sales.total : 0]), formats: { 1: FMT.money, 2: FMT.pct }, totals: [1],
    });

    // Charts (right side, columns K..R)
    if (mt.count) charts.push({
      sheet: S, type: 'column', title: 'Sales vs Costs vs Profit by month', numFmt: FMT.axis, anchor: { col: 10, row: 7, cols: 8, rows: 17 },
      categories: { ref: ref(S, 2, mt.first, 2, mt.last), values: pnlMonths.map(A.monthLabel) },
      series: [
        { name: 'Sales', nameRef: ref(S, 3, 9), ref: ref(S, 3, mt.first, 3, mt.last), values: pnlMonths.map(m => r2(pnlBy[m].sales.total)), color: '2ECC71' },
        { name: 'Total Costs', nameRef: ref(S, 7, 9), ref: ref(S, 7, mt.first, 7, mt.last), values: pnlMonths.map(m => r2(pnlBy[m].totalExpenses)), color: 'F59E0B' },
        { name: 'Net Profit', nameRef: ref(S, 8, 9), ref: ref(S, 8, mt.first, 8, mt.last), values: pnlMonths.map(m => r2(pnlBy[m].netProfit)), color: '0F1B2D' },
      ],
    });
    if (mixTable.count) charts.push({
      sheet: S, type: 'doughnut', title: `Cost split - ${periodLabel}`, anchor: { col: 10, row: 25, cols: 8, rows: 17 },
      categories: { ref: ref(S, 2, mixTable.first, 2, mixTable.last), values: mix.map(g => g.group) },
      series: [{ name: 'Amount', ref: ref(S, 3, mixTable.first, 3, mixTable.last), values: mix.map(g => r2(g.amount)) }],
    });
    if (chTable.count) charts.push({
      sheet: S, type: 'pie', title: `Sales by payment type - ${periodLabel}`, anchor: { col: 10, row: 43, cols: 8, rows: 16 },
      categories: { ref: ref(S, 2, chTable.first, 2, chTable.last), values: channels.map(c => c[0]) },
      series: [{ name: 'Amount', ref: ref(S, 3, chTable.first, 3, chTable.last), values: channels.map(c => r2(c[1])) }],
    });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 2 }];
  }

  // -------------------------------------------------------------------- 2. PROFIT AND LOSS
  {
    const S = 'Profit and Loss';
    const ws = wb.addWorksheet(S);
    const nM = Math.max(pnlMonths.length, 1);
    setup(ws, { tab: COL.navy, widths: [2, 34, ...Array(nM + 1).fill(15)] });
    band(ws, 1, 2, 3 + nM, 'Profit & Loss Statement', { size: 18, height: 36 });
    band(ws, 2, 2, 3 + nM, 'All amounts in Rs. Sales are net of tax. Payments counted when paid (bank + cash). GST payments and cash withdrawals are not costs.', { size: 9.5, fill: COL.light, color: 'FF5B6577', height: 20, bold: false });
    const totalCol = 3 + pnlMonths.length; // column index of "Total"
    const hdr = ws.getRow(4);
    hdr.height = 24;
    const heads = ['', ...pnlMonths.map(A.monthLabel), 'Total'];
    heads.forEach((h, i) => {
      const c = ws.getCell(4, 2 + i);
      c.value = i === 0 ? 'Particulars' : h;
      c.font = { bold: true, color: { argb: COL.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL.navy } };
      c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', indent: i === 0 ? 1 : 0 };
    });

    let r = 5;
    const rowOf = {};
    const mcols = pnlMonths.map((_, i) => 3 + i);
    const writeRow = (key, label, getter, { style = 'line', pct = false, formula = null, fmt = pct ? FMT.pct : FMT.money } = {}) => {
      const rr = r++; rowOf[key] = rr;
      const lc = ws.getCell(rr, 2); lc.value = label;
      lc.alignment = { indent: style === 'line' ? 2 : 1 };
      lc.font = { bold: style !== 'line', size: 10.5, italic: pct };
      const results = pnlMonths.map(m => getter(pnlBy[m]));
      pnlMonths.forEach((m, i) => {
        const c = ws.getCell(rr, 3 + i);
        c.value = formula ? { formula: formula(L(3 + i)), result: results[i] } : results[i];
        c.numFmt = fmt;
      });
      const tc = ws.getCell(rr, totalCol);
      if (pct) {
        // percentage rows: recompute from total column cells of the numerator/denominator
        tc.value = { formula: formula(L(totalCol)), result: getter(A.computePnL({ dailySales, expenses, payroll }, null)) };
      } else {
        tc.value = { formula: `SUM(${L(3)}${rr}:${L(totalCol - 1)}${rr})`, result: sum(results) };
      }
      tc.numFmt = fmt;
      for (let c = 2; c <= totalCol; c++) {
        const cell = ws.getCell(rr, c);
        cell.border = { bottom: { style: 'hair', color: { argb: COL.border } } };
        if (style === 'total') { cell.font = { bold: true, size: 10.5 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL.light } }; cell.border = { top: thin, bottom: thin }; }
        if (style === 'grand') { if (c > 2) cell.numFmt = '"₹"#,##0;-"₹"#,##0;"-"'; cell.font = { bold: true, size: 12, color: { argb: COL.white } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL.navy } }; }
        if (c > 2) cell.alignment = { horizontal: 'right' };
      }
      return rr;
    };
    const head = (text) => { const rr = r++; ws.mergeCells(rr, 2, rr, totalCol); const c = ws.getCell(rr, 2); c.value = text; c.font = { bold: true, size: 11, color: { argb: COL.greenDark } }; c.border = { bottom: { style: 'thin', color: { argb: COL.green } } }; ws.getRow(rr).height = 20; };
    const sumF = (rows) => (col) => `SUM(${rows.map(x => `${col}${x}`).join(',')})`;

    head('SALES');
    const s1 = writeRow('cash', 'Cash sales', p => r2(p.sales.cash));
    const s2 = writeRow('card', 'Card sales', p => r2(p.sales.card));
    const s3 = writeRow('upi', 'UPI / Online sales', p => r2(p.sales.upi));
    const s4 = writeRow('zomato', 'Zomato sales', p => r2(p.sales.zomato));
    const tS = writeRow('sales', 'TOTAL SALES', p => r2(p.sales.total), { style: 'total', formula: (c) => `SUM(${c}${s1}:${c}${s4})` });

    head('COST OF GOODS (Food & Packaging)');
    const grp = (g) => (p) => r2((p.byGroup.find(x => x.group === g) || {}).amount || 0);
    const c1 = writeRow('food', 'Food & raw material', grp('Food'));
    const c2 = writeRow('pack', 'Containers & packaging', grp('Packaging'));
    const tC = writeRow('cogs', 'TOTAL COST OF GOODS', p => r2(p.cogs), { style: 'total', formula: (c) => `SUM(${c}${c1}:${c}${c2})` });
    const gP = writeRow('gross', 'GROSS PROFIT', p => r2(p.grossProfit), { style: 'total', formula: (c) => `${c}${tS}-${c}${tC}` });

    head('OPERATING EXPENSES');
    const o1 = writeRow('sal', 'Salaries & wages (payroll)', p => r2(p.salaryLine));
    const opexKeys = ['Gas', 'Rent', 'Staff', 'Commission', 'Marketing', 'Utilities', 'Maintenance', 'Transport', 'General'];
    const labels = { Gas: 'Gas & charcoal (fuel)', Rent: 'Rent', Staff: 'Staff OT, incentive, uniform', Commission: 'Parcel / delivery commission', Marketing: 'Marketing & decoration', Utilities: 'Phone, water, laundry', Maintenance: 'Repairs & services', Transport: 'Petrol, diesel, tempo', General: 'Other / miscellaneous' };
    const oRows = [o1];
    opexKeys.forEach(k => { oRows.push(writeRow('o_' + k, labels[k], p => r2((p.opexLines.find(x => x.group === k) || {}).amount || 0))); });
    const tO = writeRow('opex', 'TOTAL OPERATING EXPENSES', p => r2(p.opex), { style: 'total', formula: (c) => `SUM(${c}${oRows[0]}:${c}${oRows[oRows.length - 1]})` });

    r++;
    const np = writeRow('net', 'NET PROFIT / (LOSS)', p => r2(p.netProfit), { style: 'grand', formula: (c) => `${c}${gP}-${c}${tO}` });
    r++;
    head('KEY RATIOS');
    writeRow('margin', 'Net profit margin', p => (p.sales.total ? p.netProfit / p.sales.total : 0), { pct: true, formula: (c) => `IF(${c}${tS}=0,0,${c}${np}/${c}${tS})` });
    writeRow('foodpct', 'Food cost % (food + packaging)', p => (p.sales.total ? p.cogs / p.sales.total : 0), { pct: true, formula: (c) => `IF(${c}${tS}=0,0,${c}${tC}/${c}${tS})` });
    writeRow('salpct', 'Salary cost %', p => (p.sales.total ? p.salaryLine / p.sales.total : 0), { pct: true, formula: (c) => `IF(${c}${tS}=0,0,${c}${o1}/${c}${tS})` });
    writeRow('rentpct', 'Rent %', p => (p.sales.total ? ((p.opexLines.find(x => x.group === 'Rent') || {}).amount || 0) / p.sales.total : 0), { pct: true, formula: (c) => `IF(${c}${tS}=0,0,${c}${rowOf['o_Rent']}/${c}${tS})` });
    r++;
    head('MEMO (not included in profit)');
    writeRow('gst', 'GST paid to government', p => r2(p.tax));
    writeRow('xfer', 'Cash withdrawn from bank (transfer)', p => r2(p.transfer));
    ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 2, ySplit: 4 }];

    if (pnlMonths.length) {
      const rangeRow = (key) => ref(S, 3, rowOf[key], 2 + pnlMonths.length, rowOf[key]);
      charts.push({
        sheet: S, type: 'column', title: 'Sales, Costs and Net Profit', numFmt: FMT.axis, anchor: { col: 1, row: r + 1, cols: 5, rows: 18 },
        categories: { ref: ref(S, 3, 4, 2 + pnlMonths.length, 4), values: pnlMonths.map(A.monthLabel) },
        series: [
          { name: 'Sales', ref: rangeRow('sales'), values: pnlMonths.map(m => r2(pnlBy[m].sales.total)), color: '2ECC71' },
          { name: 'Gross Profit', ref: rangeRow('gross'), values: pnlMonths.map(m => r2(pnlBy[m].grossProfit)), color: '6C63FF' },
          { name: 'Net Profit', ref: rangeRow('net'), values: pnlMonths.map(m => r2(pnlBy[m].netProfit)), color: '0F1B2D' },
        ],
      });
      // cost-lines chart for the focus month column (horizontal bars over contiguous opex rows)
      const fi = focusMonth ? pnlMonths.indexOf(focusMonth) : pnlMonths.length - 1;
      if (fi >= 0) {
        const colN = 3 + fi;
        const lines = [['Salaries', oRows[0]], ...opexKeys.map((k, i) => [labels[k], oRows[i + 1]])];
        charts.push({
          sheet: S, type: 'bar', horizontal: true, labels: false, title: `Operating expenses - ${A.monthLabel(pnlMonths[fi])}`, numFmt: FMT.axis, anchor: { col: 6, row: r + 1, cols: Math.max(nM + 1, 5), rows: 18 },
          categories: { ref: ref(S, 2, oRows[0], 2, oRows[oRows.length - 1]), values: lines.map(l => (l[0] === 'Salaries' ? 'Salaries & wages (payroll)' : l[0])) },
          series: [{ name: 'Amount', ref: ref(S, colN, oRows[0], colN, oRows[oRows.length - 1]), values: oRows.map((rr, i) => r2(i === 0 ? pnlBy[pnlMonths[fi]].salaryLine : ((pnlBy[pnlMonths[fi]].opexLines.find(x => x.group === opexKeys[i - 1]) || {}).amount || 0))), color: 'F59E0B' }],
        });
      }
    }
  }

  // -------------------------------------------------------------------- 3. DAILY SALES
  {
    const S = 'Daily Sales';
    const ws = wb.addWorksheet(S);
    setup(ws, { tab: COL.green, widths: [2, 15, 14, 14, 14, 14, 15, 13, 17, 3, 14, 14, 14, 3] });
    band(ws, 1, 2, 9, 'Daily Sales Register', { size: 18, height: 36 });
    const days = A.computePnL({ dailySales, expenses: [], payroll: [] }, null).byDay;
    const discByDay = {}; dailySales.forEach(s => { discByDay[A.dayKey(s.date)] = (discByDay[A.dayKey(s.date)] || 0) + (s.discount || 0); });
    let running = 0;
    const rows = days.map((d, i) => {
      const rr = 4 + i; running += d.total;
      return [asDate(d.date), r2(d.cash), r2(d.card), r2(d.upi), r2(d.zomato),
        { formula: `SUM(C${rr}:F${rr})`, result: r2(d.total) }, r2(discByDay[d.date] || 0),
        { formula: i === 0 ? `G${rr}` : `I${rr - 1}+G${rr}`, result: r2(running) }];
    });
    const t = writeTable(ws, { row: 3, col: 2, headers: ['Date', 'Cash', 'Card', 'UPI / Online', 'Zomato', 'Total Sales', 'Discount', 'Running Total'], rows, formats: { 0: FMT.date, 1: FMT.money, 2: FMT.money, 3: FMT.money, 4: FMT.money, 5: FMT.money, 6: FMT.money, 7: FMT.money }, totals: [1, 2, 3, 4, 5, 6], align: { 0: 'left' } });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];
    if (!t.count) emptyNote(ws, 4, 2, 'No daily sales recorded yet.');
    else {
      // channel table + weekday pattern
      const chans = [['Cash', sum(days.map(d => d.cash))], ['Card', sum(days.map(d => d.card))], ['UPI / Online', sum(days.map(d => d.upi))], ['Zomato', sum(days.map(d => d.zomato))]].filter(c => c[1] > 0);
      sectionHeader(ws, 3, 11, 13, 'Payment mix');
      const ct = writeTable(ws, { row: 4, col: 11, headers: ['Channel', 'Amount', 'Share'], rows: chans.map(c => [c[0], r2(c[1]), c[1] / sum(chans.map(x => x[1]))]), formats: { 1: FMT.money, 2: FMT.pct } });
      // weekday averages (skip single-day lumps)
      const tots = days.map(d => d.total).sort((a, b) => a - b); const med = tots[Math.floor(tots.length / 2)] || 0;
      const clean = days.filter(d => !(d.total > 50000 && d.total > med * 5));
      const wd = WEEKDAYS.map((n, i) => { const ds = clean.filter(d => new Date(d.date).getUTCDay() === i); return [n, ds.length ? r2(sum(ds.map(d => d.total)) / ds.length) : 0, ds.length]; });
      const wStart = 4 + chans.length + 4;
      sectionHeader(ws, wStart - 1, 11, 13, 'Average sale by weekday');
      const wt = writeTable(ws, { row: wStart, col: 11, headers: ['Weekday', 'Avg sale', 'Days'], rows: wd, formats: { 1: FMT.money, 2: FMT.int } });
      const dayLabels = days.map(d => new Date(d.date).toISOString().slice(5, 10).split('-').reverse().join('/'));
      charts.push({
        sheet: S, type: 'line', title: 'Daily total sales', numFmt: FMT.axis, anchor: { col: 14, row: 2, cols: 9, rows: 16 },
        categories: { ref: ref(S, 2, t.first, 2, t.last), values: days.map(d => d.date) },
        series: [{ name: 'Total Sales', ref: ref(S, 7, t.first, 7, t.last), values: days.map(d => r2(d.total)), color: '2ECC71' }],
      });
      void dayLabels;
      charts.push({
        sheet: S, type: 'column', stacked: true, title: 'Daily sales by payment type', numFmt: FMT.axis, anchor: { col: 14, row: 19, cols: 9, rows: 16 },
        categories: { ref: ref(S, 2, t.first, 2, t.last), values: days.map(d => d.date) },
        series: [
          { name: 'Card', nameRef: ref(S, 4, 3), ref: ref(S, 4, t.first, 4, t.last), values: days.map(d => r2(d.card)), color: '6C63FF' },
          { name: 'UPI / Online', nameRef: ref(S, 5, 3), ref: ref(S, 5, t.first, 5, t.last), values: days.map(d => r2(d.upi)), color: '06B6D4' },
          { name: 'Cash', nameRef: ref(S, 3, 3), ref: ref(S, 3, t.first, 3, t.last), values: days.map(d => r2(d.cash)), color: '2ECC71' },
          { name: 'Zomato', nameRef: ref(S, 6, 3), ref: ref(S, 6, t.first, 6, t.last), values: days.map(d => r2(d.zomato)), color: 'EF4444' },
        ],
      });
      charts.push({
        sheet: S, type: 'pie', title: 'Payment mix', anchor: { col: 10, row: 20 + 0, cols: 4, rows: 14 },
        categories: { ref: ref(S, 11, ct.first, 11, ct.last), values: chans.map(c => c[0]) },
        series: [{ name: 'Amount', ref: ref(S, 12, ct.first, 12, ct.last), values: chans.map(c => r2(c[1])) }],
      });
      charts.push({
        sheet: S, type: 'column', title: 'Average sale by weekday', numFmt: FMT.axis, anchor: { col: 14, row: 36, cols: 9, rows: 15 },
        categories: { ref: ref(S, 11, wt.first, 11, wt.last), values: WEEKDAYS },
        series: [{ name: 'Avg sale', ref: ref(S, 12, wt.first, 12, wt.last), values: wd.map(w => w[1]), color: 'F59E0B' }],
      });
    }
  }

  // -------------------------------------------------------------------- 4. EXPENSES (register)
  {
    const S = 'Expenses';
    const ws = wb.addWorksheet(S);
    setup(ws, { tab: COL.amber, widths: [2, 14, 11, 26, 14, 30, 18, 12, 15] });
    band(ws, 1, 2, 9, 'Expense Register', { size: 18, height: 36 });
    band(ws, 2, 2, 9, 'Use the filter arrows in the header. The TOTAL row recalculates for whatever you filter (month, group, payment mode...).', { size: 9.5, fill: COL.light, color: 'FF5B6577', height: 20, bold: false });
    const sorted = [...expenses].sort((a, b) => new Date(b.expenseDate || b.createdAt) - new Date(a.expenseDate || a.createdAt));
    const rows = sorted.map(e => {
      const d = e.expenseDate || e.createdAt;
      return [asDate(d), A.monthLabel(A.monthKey(d)), e.title, A.effectiveGroup(e), A.effectiveCategory(e), e.vendor || '', e.paymentMode || 'Cash', r2(e.amount)];
    });
    // total row on TOP (so filtering never hides it)
    const hdrRow = 5;
    const t = writeTable(ws, { row: hdrRow, col: 2, headers: ['Date', 'Month', 'Title', 'Group', 'Category', 'Vendor', 'Mode', 'Amount'], rows, formats: { 0: FMT.date, 7: FMT.money }, filter: true, align: { 0: 'left' } });
    const tr = ws.getCell(4, 2); tr.value = 'TOTAL (filtered)'; tr.font = { bold: true };
    ws.getCell(4, 9).value = { formula: t.count ? `SUBTOTAL(109,I${t.first}:I${t.last})` : '0', result: sum(rows.map(r => r[7])) };
    ws.getCell(4, 9).numFmt = FMT.money; ws.getCell(4, 9).font = { bold: true, size: 12, color: { argb: COL.greenDark } };
    for (let c = 2; c <= 9; c++) ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COL.light } };
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: hdrRow }];
    if (!t.count) emptyNote(ws, 6, 2, 'No expenses recorded yet.');
  }

  // -------------------------------------------------------------------- 5. EXPENSE ANALYSIS
  {
    const S = 'Expense Analysis';
    const ws = wb.addWorksheet(S);
    setup(ws, { tab: COL.amber, widths: [2, 30, 15, 12, 3, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12] });
    band(ws, 1, 2, 15, `Expense Analysis - ${periodLabel}`, { size: 18, height: 36 });
    let r = 3;
    const place = (title, headers, rows, formats, totals) => {
      sectionHeader(ws, r, 2, 4, title);
      const t = writeTable(ws, { row: r + 1, col: 2, headers, rows, formats, totals });
      const used = r + 1 + Math.max(rows.length, 1) + (totals ? 1 : 0);
      if (!rows.length) emptyNote(ws, r + 2, 2, 'No data');
      const startRow = r;
      r = Math.max(used + 2, startRow + 18); // leave space for the chart on the right
      return { t, startRow };
    };
    const tot = focus.totalExpenses || 1;
    // by group
    const g = place('By cost head', ['Cost head', 'Amount', '% of costs'], focus.byGroup.map(x => [x.group, r2(x.amount), x.amount / tot]), { 1: FMT.money, 2: FMT.pct }, [1]);
    if (g.t.count) {
      charts.push({ sheet: S, type: 'doughnut', title: 'Cost heads', anchor: { col: 4, row: g.startRow - 1, cols: 5, rows: 17 }, categories: { ref: ref(S, 2, g.t.first, 2, g.t.last), values: focus.byGroup.map(x => x.group) }, series: [{ name: 'Amount', ref: ref(S, 3, g.t.first, 3, g.t.last), values: focus.byGroup.map(x => r2(x.amount)) }] });
      charts.push({ sheet: S, type: 'bar', horizontal: true, labels: true, title: 'Cost heads (amount)', numFmt: FMT.axis, anchor: { col: 9, row: g.startRow - 1, cols: 6, rows: 17 }, categories: { ref: ref(S, 2, g.t.first, 2, g.t.last), values: focus.byGroup.map(x => x.group) }, series: [{ name: 'Amount', ref: ref(S, 3, g.t.first, 3, g.t.last), values: focus.byGroup.map(x => r2(x.amount)), color: 'F59E0B' }] });
    }
    // by category (top 15)
    const cats = focus.byCategory.slice(0, 15);
    const c = place('Top categories', ['Category', 'Amount', 'Group'], cats.map(x => [x.category, r2(x.amount), x.group]), { 1: FMT.money }, null);
    if (c.t.count) charts.push({ sheet: S, type: 'bar', horizontal: true, labels: true, title: 'Top categories', numFmt: FMT.axis, anchor: { col: 4, row: c.startRow - 1, cols: 11, rows: 17 }, categories: { ref: ref(S, 2, c.t.first, 2, c.t.last), values: cats.map(x => x.category) }, series: [{ name: 'Amount', ref: ref(S, 3, c.t.first, 3, c.t.last), values: cats.map(x => r2(x.amount)), color: '6C63FF' }] });
    // by payment mode
    const m = place('By payment mode', ['Mode', 'Amount', '% of costs'], focus.byMode.map(x => [x.mode, r2(x.amount), x.amount / (sum(focus.byMode.map(y => y.amount)) || 1)]), { 1: FMT.money, 2: FMT.pct }, [1]);
    if (m.t.count) charts.push({ sheet: S, type: 'pie', title: 'Paid via', anchor: { col: 4, row: m.startRow - 1, cols: 6, rows: 17 }, categories: { ref: ref(S, 2, m.t.first, 2, m.t.last), values: focus.byMode.map(x => x.mode) }, series: [{ name: 'Amount', ref: ref(S, 3, m.t.first, 3, m.t.last), values: focus.byMode.map(x => r2(x.amount)) }] });
    // top payees
    const payees = {};
    focus.expenseRows.filter(e => !['Tax', 'Transfer'].includes(e._group)).forEach(e => { const k = String(e.title).trim().toUpperCase().replace(/^NEW\s+/, ''); payees[k] = (payees[k] || 0) + e.amount; });
    const top = Object.entries(payees).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const p = place('Biggest payees / items', ['Payee / item', 'Amount', '% of costs'], top.map(([k, v]) => [k, r2(v), v / tot]), { 1: FMT.money, 2: FMT.pct }, null);
    if (p.t.count) charts.push({ sheet: S, type: 'bar', horizontal: true, labels: true, title: 'Biggest payees / items', numFmt: FMT.axis, anchor: { col: 4, row: p.startRow - 1, cols: 11, rows: 17 }, categories: { ref: ref(S, 2, p.t.first, 2, p.t.last), values: top.map(x => x[0]) }, series: [{ name: 'Amount', ref: ref(S, 3, p.t.first, 3, p.t.last), values: top.map(x => r2(x[1])), color: '2ECC71' }] });
  }

  // -------------------------------------------------------------------- 6. PAYROLL
  {
    const S = 'Payroll';
    const ws = wb.addWorksheet(S);
    setup(ws, { tab: COL.navy, widths: [2, 14, 28, 13, 15, 17, 13, 14, 3] });
    band(ws, 1, 2, 8, 'Payroll', { size: 18, height: 36 });
    band(ws, 2, 2, 8, '"Salary cost" is the salary earned for the days present (advances are already included in it), i.e. the amount that counts as a business cost.', { size: 9.5, fill: COL.light, color: 'FF5B6577', height: 20, bold: false });
    const sorted = [...payroll].sort((a, b) => (A.monthKey(a.month) === A.monthKey(b.month) ? b.netPay - a.netPay : new Date(a.month) - new Date(b.month)));
    const rows = sorted.map(pr => [A.monthLabel(A.monthKey(pr.month)), pr.employeeName, pr.presentDays, r2(pr.salary), r2(pr.netPay), r2(pr.advance), 0]);
    const t = writeTable(ws, { row: 4, col: 2, headers: ['Month', 'Employee', 'Days present', 'Monthly salary', 'Salary cost (earned)', 'Advance', '% of month'], rows, formats: { 2: FMT.num, 3: FMT.money, 4: FMT.money, 5: FMT.money, 6: FMT.pct }, totals: [4, 5] });
    // share-of-month formulas
    sorted.forEach((pr, i) => {
      const rr = t.first + i; const mk = A.monthKey(pr.month);
      const monthTotal = sum(sorted.filter(x => A.monthKey(x.month) === mk).map(x => x.netPay));
      ws.getCell(rr, 8).value = { formula: `IF(SUMIF($B$${t.first}:$B$${t.last},B${rr},$F$${t.first}:$F$${t.last})=0,0,F${rr}/SUMIF($B$${t.first}:$B$${t.last},B${rr},$F$${t.first}:$F$${t.last}))`, result: monthTotal ? pr.netPay / monthTotal : 0 };
    });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
    if (!t.count) emptyNote(ws, 5, 2, 'No payroll recorded yet.');
    else {
      const fm = focusMonth || A.monthKey(sorted[sorted.length - 1].month);
      const idx = sorted.map((pr, i) => [A.monthKey(pr.month), i]).filter(x => x[0] === fm).map(x => x[1]);
      if (idx.length) {
        const a = t.first + idx[0], b = t.first + idx[idx.length - 1];
        charts.push({ sheet: S, type: 'bar', horizontal: true, labels: true, title: `Salary cost by employee - ${A.monthLabel(fm)}`, numFmt: FMT.axis, anchor: { col: 9, row: 3, cols: 9, rows: Math.max(14, idx.length + 4) }, categories: { ref: ref(S, 3, a, 3, b), values: idx.map(i => sorted[i].employeeName) }, series: [{ name: 'Salary cost', ref: ref(S, 6, a, 6, b), values: idx.map(i => r2(sorted[i].netPay)), color: '0F1B2D' }] });
      }
    }
  }

  // -------------------------------------------------------------------- 7. VENDOR BILLS
  {
    const S = 'Vendor Bills';
    const ws = wb.addWorksheet(S);
    setup(ws, { tab: COL.navy, widths: [2, 14, 26, 14, 14, 14, 14, 11, 3, 24, 14, 14, 14] });
    band(ws, 1, 2, 8, 'Vendor Bills & Payables', { size: 18, height: 36 });
    const sorted = [...vendorBills].sort((a, b) => new Date(b.date) - new Date(a.date));
    const rows = sorted.map((b, i) => { const rr = 4 + i; return [asDate(b.date), b.vendorName, b.invoiceNo || '', r2(b.amount), r2(b.paid), r2(b.pending), b.status]; });
    const t = writeTable(ws, { row: 3, col: 2, headers: ['Date', 'Vendor', 'Invoice no.', 'Bill amount', 'Paid', 'Pending', 'Status'], rows, formats: { 0: FMT.date, 3: FMT.money, 4: FMT.money, 5: FMT.money }, totals: [3, 4, 5], filter: true, align: { 0: 'left' } });
    sorted.forEach((b, i) => { const rr = t.first + i; ws.getCell(rr, 7).value = { formula: `E${rr}-F${rr}`, result: r2(b.pending) }; if ((b.pending || 0) > 0) ws.getCell(rr, 8).font = { bold: true, color: { argb: 'FFB45309' } }; else ws.getCell(rr, 8).font = { bold: true, color: { argb: COL.greenDark } }; });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];
    if (!t.count) emptyNote(ws, 4, 2, 'No vendor bills recorded yet.');
    else {
      const agg = {};
      vendorBills.forEach(b => { const k = b.vendorName; agg[k] = agg[k] || { billed: 0, paid: 0, pending: 0 }; agg[k].billed += b.amount; agg[k].paid += b.paid; agg[k].pending += b.pending; });
      const vend = Object.entries(agg).sort((a, b) => b[1].billed - a[1].billed);
      sectionHeader(ws, 3, 10, 13, 'By vendor');
      const vt = writeTable(ws, { row: 4, col: 10, headers: ['Vendor', 'Billed', 'Paid', 'Pending'], rows: vend.map(([k, v]) => [k, r2(v.billed), r2(v.paid), r2(v.pending)]), formats: { 1: FMT.money, 2: FMT.money, 3: FMT.money }, totals: [1, 2, 3] });
      charts.push({ sheet: S, type: 'column', stacked: true, title: 'Paid vs pending by vendor', numFmt: FMT.axis, anchor: { col: 9, row: vt.last + 3, cols: 5, rows: 16 }, categories: { ref: ref(S, 10, vt.first, 10, vt.last), values: vend.map(v => v[0]) }, series: [{ name: 'Paid', ref: ref(S, 12, vt.first, 12, vt.last), values: vend.map(v => r2(v[1].paid)), color: '2ECC71' }, { name: 'Pending', ref: ref(S, 13, vt.first, 13, vt.last), values: vend.map(v => r2(v[1].pending)), color: 'EF4444' }] });
    }
  }

  // -------------------------------------------------------------------- 8. INVENTORY
  {
    const S = 'Inventory';
    const ws = wb.addWorksheet(S);
    setup(ws, { tab: COL.green, widths: [2, 30, 18, 9, 11, 12, 12, 15, 12, 11, 3, 14, 10] });
    band(ws, 1, 2, 10, 'Inventory & Stock Value', { size: 18, height: 36 });
    if (junkProducts.length) band(ws, 2, 2, 10, `${junkProducts.length} auto-created "fake" products from the old Excel import are hidden from this sheet (see Data Checks).`, { size: 9.5, fill: COL.warnBg, color: 'FF92400E', height: 20, bold: false });
    const sorted = [...realProducts].sort((a, b) => (b.quantity * (b.price || 0)) - (a.quantity * (a.price || 0)));
    const status = (p) => (p.quantity <= 0 ? 'Out of stock' : p.quantity <= (p.reorderLevel ?? 10) ? 'Low' : 'OK');
    const rows = sorted.map((p, i) => { const rr = 4 + i; return [p.name, p.category ? p.category.name : '-', p.unit || 'pcs', p.quantity, p.price || 0, p.costPrice || 0, { formula: `E${rr}*F${rr}`, result: r2(p.quantity * (p.price || 0)) }, p.reorderLevel ?? 10, status(p)]; });
    const t = writeTable(ws, { row: 3, col: 2, headers: ['Product', 'Category', 'Unit', 'In stock', 'Sell price', 'Cost price', 'Stock value', 'Reorder at', 'Status'], rows, formats: { 3: FMT.num, 4: FMT.money2, 5: FMT.money2, 6: FMT.money, 7: FMT.int }, totals: [6], filter: true });
    sorted.forEach((p, i) => { const rr = t.first + i; ws.getCell(rr, 8).value = { formula: `E${rr}*F${rr}`, result: r2(p.quantity * (p.price || 0)) }; const st = status(p); const c = ws.getCell(rr, 10); c.font = { bold: true, color: { argb: st === 'OK' ? COL.greenDark : st === 'Low' ? 'FFB45309' : COL.red } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st === 'OK' ? COL.okBg : st === 'Low' ? COL.warnBg : COL.badBg } }; });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];
    if (!t.count) emptyNote(ws, 4, 2, 'No products yet.');
    else {
      const top = sorted.filter(p => p.quantity * (p.price || 0) > 0).slice(0, 10);
      if (top.length) charts.push({ sheet: S, type: 'bar', horizontal: true, labels: true, title: 'Top 10 products by stock value', numFmt: FMT.axis, anchor: { col: 11, row: 2, cols: 8, rows: 16 }, categories: { ref: ref(S, 2, t.first, 2, t.first + top.length - 1), values: top.map(p => p.name) }, series: [{ name: 'Stock value', ref: ref(S, 8, t.first, 8, t.first + top.length - 1), values: top.map(p => r2(p.quantity * (p.price || 0))), color: '2ECC71' }] });
      const counts = { OK: 0, Low: 0, 'Out of stock': 0 }; sorted.forEach(p => counts[status(p)]++);
      const st = Object.entries(counts).filter(x => x[1] > 0);
      sectionHeader(ws, 20, 12, 13, 'Stock health');
      const stT = writeTable(ws, { row: 21, col: 12, headers: ['Status', 'Products'], rows: st, formats: { 1: FMT.int } });
      charts.push({ sheet: S, type: 'pie', title: 'Stock health', anchor: { col: 11, row: 26, cols: 8, rows: 14 }, categories: { ref: ref(S, 12, stT.first, 12, stT.last), values: st.map(x => x[0]) }, series: [{ name: 'Products', ref: ref(S, 13, stT.first, 13, stT.last), values: st.map(x => x[1]) }] });
    }
  }

  // -------------------------------------------------------------------- 9. ORDERS
  {
    const S = 'Orders';
    const ws = wb.addWorksheet(S);
    setup(ws, { tab: COL.green, widths: [2, 12, 10, 12, 30, 11, 15, 3, 14, 14, 14] });
    band(ws, 1, 2, 7, 'Stock Orders (Stock In / Stock Out)', { size: 18, height: 36 });
    if (junkTx.length) band(ws, 2, 2, 7, `${junkTx.length} auto-created orders from the old Excel import are hidden (see Data Checks).`, { size: 9.5, fill: COL.warnBg, color: 'FF92400E', height: 20, bold: false });
    const sorted = [...realTx].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const rows = sorted.map(tx => [asDate(tx.createdAt), `TRX-${tx.id}`, tx.type === 'SALE' ? 'Stock Out' : 'Stock In', tx.product ? tx.product.name : `#${tx.productId}`, tx.quantity, r2(tx.total)]);
    const t = writeTable(ws, { row: 3, col: 2, headers: ['Date', 'TRX ID', 'Type', 'Product', 'Quantity', 'Amount'], rows, formats: { 0: FMT.date, 4: FMT.num, 5: FMT.money }, totals: [5], filter: true, align: { 0: 'left' } });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];
    if (!t.count) emptyNote(ws, 4, 2, 'No stock orders recorded yet. (Orders are optional - Profit & Loss uses expenses, payroll and daily sales.)');
    else {
      const byM = {}; realTx.forEach(tx => { const k = A.monthKey(tx.createdAt); byM[k] = byM[k] || { in: 0, out: 0 }; if (tx.type === 'SALE') byM[k].out += tx.total; else byM[k].in += tx.total; });
      const ms = Object.keys(byM).sort();
      sectionHeader(ws, 3, 9, 11, 'By month');
      const mt = writeTable(ws, { row: 4, col: 9, headers: ['Month', 'Stock In', 'Stock Out'], rows: ms.map(k => [A.monthLabel(k), r2(byM[k].in), r2(byM[k].out)]), formats: { 1: FMT.money, 2: FMT.money } });
      charts.push({ sheet: S, type: 'column', title: 'Stock In vs Stock Out (value)', numFmt: FMT.axis, anchor: { col: 8, row: mt.last + 2, cols: 5, rows: 15 }, categories: { ref: ref(S, 9, mt.first, 9, mt.last), values: ms.map(A.monthLabel) }, series: [{ name: 'Stock In', ref: ref(S, 10, mt.first, 10, mt.last), values: ms.map(k => r2(byM[k].in)), color: '6C63FF' }, { name: 'Stock Out', ref: ref(S, 11, mt.first, 11, mt.last), values: ms.map(k => r2(byM[k].out)), color: '2ECC71' }] });
    }
  }

  // -------------------------------------------------------------------- 10. DATA CHECKS
  {
    const ws = wb.addWorksheet('Data Checks');
    setup(ws, { tab: COL.red, widths: [2, 9, 42, 100] });
    band(ws, 1, 2, 4, 'Data Checks & Notes', { size: 18, height: 36 });
    const icon = { ok: 'OK', warn: 'FIX', info: 'NOTE' };
    const fills = { ok: COL.okBg, warn: COL.warnBg, info: COL.infoBg };
    const rows = checks.map(c => [icon[c.level], c.title, c.detail]);
    const t = writeTable(ws, { row: 3, col: 2, headers: ['Status', 'Check', 'Details'], rows, formats: {} });
    checks.forEach((c, i) => {
      const rr = t.first + i;
      ws.getCell(rr, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[c.level] } };
      ws.getCell(rr, 2).font = { bold: true, size: 10 };
      ws.getCell(rr, 3).font = { bold: true, size: 10.5 };
      ws.getCell(rr, 4).alignment = { wrapText: true, vertical: 'top' };
      ws.getCell(rr, 3).alignment = { wrapText: true, vertical: 'top', indent: 0 };
      ws.getRow(rr).height = Math.max(20, Math.ceil((c.detail || '').length / 105) * 15 + 6);
    });
    let r = t.last + 3;
    sectionHeader(ws, r, 2, 4, 'How the numbers are calculated');
    [
      ['Sales', 'Daily sales register (cash + card + UPI + Zomato), net of tax.'],
      ['Cost of goods', 'Expenses in the Food and Packaging groups (bank + cash payments).'],
      ['Operating expenses', 'All other expense groups (gas, rent, staff, commission, marketing, utilities, repairs, transport, general) + payroll salary cost.'],
      ['Not counted as cost', 'GST payments (sales are already net of tax) and cash withdrawn from the bank (a transfer, the cash is spent through cash expenses).'],
      ['Stock orders', 'Stock In / Out orders are for inventory tracking only and are NOT added to expenses, so nothing is counted twice.'],
      ['Vendor bills', 'Tracked for dues only; money actually paid is already in the expense register.'],
    ].forEach(([a, b], i) => {
      ws.getCell(r + 1 + i, 3).value = a; ws.getCell(r + 1 + i, 3).font = { bold: true };
      ws.getCell(r + 1 + i, 4).value = b; ws.getCell(r + 1 + i, 4).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r + 1 + i).height = Math.max(18, Math.ceil(b.length / 105) * 15 + 4);
    });
  }

  const raw = await wb.xlsx.writeBuffer();
  return injectCharts(Buffer.from(raw), charts);
}

module.exports = { buildWorkbookBuffer };
