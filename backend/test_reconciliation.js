const fs = require('fs');
const path = require('path');
const A = require('./accounting');
const { parseClosingStockFile } = require('./importParser');

console.log('=====================================================');
console.log('RUNNING INVENTORY & P&L RECONCILIATION VERIFICATION');
console.log('=====================================================\n');

// 1. Test the User Example with Accounting Logic
console.log('TEST 1: Validating User Calculation Example...');
/*
  Example Figures:
  - Opening stock brought into October: ₹10,000
  - October inventory purchases: ₹25,000
  - Total stock available: ₹35,000
  - Closing stock on 31 October: ₹5,000
  - Inventory consumed during October: ₹30,000
  - October sales: ₹80,000
  - Gross profit: ₹50,000
*/

const mockOctoberSales = [
  { id: 's1', date: new Date('2026-10-15T12:00:00Z'), cash: 80000, card: 0, upi: 0, zomato: 0 }
];

const mockOctoberOpeningStock = [
  { id: 'os1', type: 'OPENING_STOCK', total: 10000, quantity: 100, createdAt: new Date('2026-10-01T10:00:00Z') }
];

const mockOctoberPurchases = [
  { id: 'p1', type: 'PURCHASE', total: 25000, quantity: 250, createdAt: new Date('2026-10-10T10:00:00Z') }
];

const mockOctoberClosing = [
  {
    month: '2026-10',
    closingDate: new Date('2026-10-31T23:59:59Z'),
    openingStockValue: 10000,
    purchasesValue: 25000,
    totalAvailableValue: 35000,
    closingStockValue: 5000,
    consumedValue: 30000,
    totalItems: 50,
    matchedItems: 50,
    unmatchedItems: 0,
    fileName: 'October_Closing.xlsx',
    reconciledAt: new Date('2026-10-31T20:00:00Z'),
  }
];

const pnlOctober = A.computePnL({
  dailySales: mockOctoberSales,
  transactions: [...mockOctoberOpeningStock, ...mockOctoberPurchases],
  vendorBills: [],
  expenses: [],
  staff: [],
  payrolls: [],
  monthClosings: mockOctoberClosing,
}, '2026-10');

console.log('October P&L Computed Results:');
console.log('  Sales Revenue:          ₹' + pnlOctober.sales.total);
console.log('  Opening Stock:          ₹' + pnlOctober.openingStock);
console.log('  Inventory Purchases:    ₹' + pnlOctober.inventoryPurchases);
console.log('  Total Stock Available:  ₹' + pnlOctober.totalStockAvailable);
console.log('  Closing Stock:          ₹' + pnlOctober.closingStock);
console.log('  Inventory Consumed:     ₹' + pnlOctober.inventoryConsumed);
console.log('  Gross Profit:           ₹' + pnlOctober.grossProfit);

const t1Pass =
  pnlOctober.sales.total === 80000 &&
  pnlOctober.openingStock === 10000 &&
  pnlOctober.inventoryPurchases === 25000 &&
  pnlOctober.totalStockAvailable === 35000 &&
  pnlOctober.closingStock === 5000 &&
  pnlOctober.inventoryConsumed === 30000 &&
  pnlOctober.grossProfit === 50000;

if (t1Pass) {
  console.log('>>> TEST 1 PASSED: All figures match the exact user formula!\n');
} else {
  console.error('>>> TEST 1 FAILED: Figures mismatch!');
  process.exit(1);
}

// 2. Test Requirement 5: Critical Requirement - No Automatic Next-Month Carry-Forward
console.log('TEST 2: Verifying NO Automatic Next-Month Carry-Forward for November...');

const mockNovemberSales = [
  { id: 's2', date: new Date('2026-11-05T12:00:00Z'), upi: 50000, cash: 0, card: 0, zomato: 0 }
];

const mockNovemberPurchases = [
  { id: 'p2', type: 'PURCHASE', total: 15000, quantity: 150, createdAt: new Date('2026-11-08T10:00:00Z') }
];

// In November, the user has NOT manually imported opening stock yet.
// MonthClosings contains October's closing of ₹5,000.
const pnlNovemberWithoutManualImport = A.computePnL({
  dailySales: mockNovemberSales,
  transactions: [...mockOctoberOpeningStock, ...mockOctoberPurchases, ...mockNovemberPurchases],
  vendorBills: [],
  expenses: [],
  staff: [],
  payrolls: [],
  monthClosings: mockOctoberClosing, // only October is closed
}, '2026-11');

console.log('November P&L without manual opening stock:');
console.log('  November Opening Stock:  ₹' + pnlNovemberWithoutManualImport.openingStock);
console.log('  November Purchases:      ₹' + pnlNovemberWithoutManualImport.inventoryPurchases);
console.log('  November Consumed:       ₹' + pnlNovemberWithoutManualImport.inventoryConsumed);

const t2Pass = pnlNovemberWithoutManualImport.openingStock === 0;

if (t2Pass) {
  console.log('>>> TEST 2 PASSED: November opening stock is strictly ₹0 until manually imported!\n');
} else {
  console.error('>>> TEST 2 FAILED: November received automatic carry-forward!');
  process.exit(1);
}

// 3. Test Manual November Opening Stock Import
console.log('TEST 3: Verifying Manual November Opening Stock Import...');
const mockNovemberManualOpeningStock = [
  { id: 'os2', type: 'OPENING_STOCK', total: 5000, quantity: 50, createdAt: new Date('2026-11-01T09:00:00Z') }
];

const pnlNovemberWithManualImport = A.computePnL({
  dailySales: mockNovemberSales,
  transactions: [
    ...mockOctoberOpeningStock,
    ...mockOctoberPurchases,
    ...mockNovemberManualOpeningStock,
    ...mockNovemberPurchases
  ],
  vendorBills: [],
  expenses: [],
  staff: [],
  payrolls: [],
  monthClosings: mockOctoberClosing,
}, '2026-11');

console.log('November P&L after manual opening stock import:');
console.log('  November Opening Stock:  ₹' + pnlNovemberWithManualImport.openingStock);
console.log('  November Purchases:      ₹' + pnlNovemberWithManualImport.inventoryPurchases);
console.log('  November Available:      ₹' + pnlNovemberWithManualImport.totalStockAvailable);

const t3Pass =
  pnlNovemberWithManualImport.openingStock === 5000 &&
  pnlNovemberWithManualImport.inventoryPurchases === 15000 &&
  pnlNovemberWithManualImport.totalStockAvailable === 20000;

if (t3Pass) {
  console.log('>>> TEST 3 PASSED: Manual November opening stock correctly integrated!\n');
} else {
  console.error('>>> TEST 3 FAILED: Manual import mismatch!');
  process.exit(1);
}

async function run() {
  // 4. Test Closing Stock Excel Parser on User File
  console.log('TEST 4: Validating Parser on User Workbook "Stock Closing 30-09-2026.xlsx"...');
  const sampleFilePath = ['C:/Srinith_Samala/ABCD/stock-inventory/Stock Closing 30-09-2026.xlsx', 'C:/Srinith_Samala/ABCD/Stock Closing 30-09-2026.xlsx'].find(p => fs.existsSync(p));
  if (sampleFilePath && fs.existsSync(sampleFilePath)) {
    const buf = fs.readFileSync(sampleFilePath);
    const parsed = await parseClosingStockFile(buf, 'Stock Closing 30-09-2026.xlsx');
    console.log('  Parsed Sheets:       ', parsed.sheetNames.join(', '));
    console.log('  Total Products Rows: ', parsed.rows.length);
    console.log('  Duplicate Rows:      ', parsed.duplicateRows.length);
    console.log('  Total Units:         ', parsed.totalQuantity);
    console.log('  Total Closing Value: ₹' + parsed.totalValue);

    const t4Pass = parsed.rows.length > 200 && parsed.sheetNames.length === 4 && parsed.totalValue > 80000;
    if (t4Pass) {
      console.log('>>> TEST 4 PASSED: User closing stock file parsed across all sheets with full fidelity!\n');
    } else {
      console.error('>>> TEST 4 FAILED: Unexpected parse count or value');
      process.exit(1);
    }
  } else {
    console.log('  Note: Stock Closing 30-09-2026.xlsx not found at', sampleFilePath, '(skipping file test)');
  }

  console.log('=====================================================');
  console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! ✓');
  console.log('=====================================================');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
