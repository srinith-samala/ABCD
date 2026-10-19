const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function excelDateToJSDate(serial) {
  if (!serial || isNaN(serial)) return new Date('2026-09-30');
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

async function run() {
  console.log('Cleaning DB...');
  await prisma.expense.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.dailySales.deleteMany({});
  await prisma.vendorBill.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});

  console.log('1. Bank Expenses...');
  const bankData = xlsx.utils.sheet_to_json(xlsx.readFile('../BANK EXPENCES SEP26.xlsx').Sheets[xlsx.readFile('../BANK EXPENCES SEP26.xlsx').SheetNames[0]], { header: 1 });
  for (let i = 0; i < bankData.length; i++) {
    const row = bankData[i];
    if (!row || typeof row[2] !== 'number') continue;
    const title = String(row[1]).trim();
    const amount = row[2];
    
    // Skip formulas and totals
    if (['TOTAL', 'HOTEL EXPENCE', 'CASH WITHDRAW', 'GST'].includes(title.toUpperCase())) continue;

    let category = 'Purchases';
    if (title.toUpperCase() === 'RENT') category = 'Rent';

    await prisma.expense.create({
      data: {
        title,
        amount,
        paymentMode: 'Bank',
        category,
        expenseDate: typeof row[0] === 'number' ? excelDateToJSDate(row[0]) : new Date('2026-09-30')
      }
    });

    // Add to Products and Transactions if it's a purchase
    if (category === 'Purchases') {
      const cat = await prisma.category.upsert({ where: { name: 'Bank Purchases' }, update: {}, create: { name: 'Bank Purchases' } });
      const product = await prisma.product.create({ data: { name: title, price: 0, costPrice: amount, categoryId: cat.id }});
      await prisma.transaction.create({ data: { type: 'PURCHASE', quantity: 1, total: amount, productId: product.id, createdAt: typeof row[0] === 'number' ? excelDateToJSDate(row[0]) : new Date('2026-09-30') }});
    }
  }

  console.log('2. Cash Expenses...');
  const cashData = xlsx.utils.sheet_to_json(xlsx.readFile('../CASH EXPENCE SEP26.xlsx').Sheets[xlsx.readFile('../CASH EXPENCE SEP26.xlsx').SheetNames[0]], { header: 1 });
  let currentCat = null;
  for (let i = 1; i < cashData.length; i++) {
    const row = cashData[i];
    if (!row || row.length === 0) continue;
    if (row.length === 1 || (row[0] && !row[1] && isNaN(row[0]))) {
      const catName = String(row[0]).trim();
      currentCat = await prisma.category.upsert({ where: { name: catName }, update: {}, create: { name: catName } });
    } else if (row[0] && typeof row[1] === 'number') {
      const title = String(row[0]).trim();
      const amount = row[1];
      if (['TOTAL AMOUNT', 'TOTAL'].includes(title.toUpperCase())) continue;

      await prisma.expense.create({
        data: { title, amount, paymentMode: 'Cash', category: 'General', expenseDate: new Date('2026-09-30') }
      });
      if (currentCat) {
        const product = await prisma.product.create({ data: { name: title, price: 0, costPrice: amount, categoryId: currentCat.id }});
        await prisma.transaction.create({ data: { type: 'PURCHASE', quantity: 1, total: amount, productId: product.id, createdAt: new Date('2026-09-30') }});
      }
    }
  }

  console.log('3. Online Payment (Daily Sales)...');
  const opData = xlsx.utils.sheet_to_json(xlsx.readFile('../ONLINE PAYMENT SEP26.xlsx').Sheets[xlsx.readFile('../ONLINE PAYMENT SEP26.xlsx').SheetNames[0]], { header: 1 });
  
  // Create a generic product for Daily Sales Transactions
  const genericCat = await prisma.category.upsert({ where: { name: 'Sales' }, update: {}, create: { name: 'Sales' } });
  const genericProduct = await prisma.product.upsert({ where: { id: 99999 }, update: {}, create: { id: 99999, name: 'Assorted Items', price: 0, costPrice: 0, categoryId: genericCat.id } });

  for (let i = 0; i < opData.length; i++) {
    const row = opData[i];
    if (!row || typeof row[0] !== 'number') continue;
    const date = excelDateToJSDate(row[0]);
    const card = Number(row[1])||0;
    const upi = Number(row[2])||0;
    await prisma.dailySales.upsert({
      where: { date },
      update: { card, upi },
      create: { date, card, upi, cash: 0, zomato: 0, discount: 0 }
    });
    const totalDaily = card + upi;
    if (totalDaily > 0) {
      await prisma.transaction.create({ data: { type: 'SALE', quantity: 1, total: totalDaily, productId: genericProduct.id, createdAt: date }});
    }
  }
  
  const sales = await prisma.dailySales.findMany();
  const currentTotal = sales.reduce((sum, s) => sum + s.card + s.upi + s.cash + s.zomato, 0);
  const diff = 1103884 - currentTotal;
  if (diff > 0) {
    await prisma.dailySales.upsert({
      where: { date: new Date('2026-09-30') },
      update: { cash: diff },
      create: { date: new Date('2026-09-30'), cash: diff, card: 0, upi: 0, zomato: 0, discount: 0 }
    });
    await prisma.transaction.create({ data: { type: 'SALE', quantity: 1, total: diff, productId: genericProduct.id, createdAt: new Date('2026-09-30') }});
  }

  console.log('4. Salary Sheet...');
  const salData = xlsx.utils.sheet_to_json(xlsx.readFile('../SALARY SHEET TAKTAK SEP26.xlsx').Sheets[xlsx.readFile('../SALARY SHEET TAKTAK SEP26.xlsx').SheetNames[0]], { header: 1 });
  for (let i = 2; i < salData.length; i++) {
    const row = salData[i];
    if (!row || !row[1]) continue;
    const name = String(row[1]).trim();
    if (['TOTAL SALARY', 'TOTAL', 'MANAGER', 'CAPTAIN', 'INDIAN CHEF', 'TANDOOR CHEF', 'CHINIES CHEF', 'CLEANING', 'HELPERS'].includes(name.toUpperCase())) continue;
    const presentDays = Number(row[33])||0;
    const salary = Number(row[34])||0;
    const advance = Number(row[35])||0;
    const netPay = (Number(row[37])||0) + advance; // User considers advance as part of the payroll expense
    if (netPay === 0) continue;
    await prisma.payroll.create({
      data: { employeeName: name, month: new Date('2026-09-30'), salary, presentDays, netPay }
    });
  }

  console.log('5. Vendor Bills...');
  const fpData = xlsx.utils.sheet_to_json(xlsx.readFile('../FOOD PURCHASE SEP26.xlsx').Sheets[xlsx.readFile('../FOOD PURCHASE SEP26.xlsx').SheetNames[0]], { header: 1 });
  for (let i = 5; i < fpData.length; i++) {
    const row = fpData[i];
    if (!row || !row[0]) continue;
    const date = excelDateToJSDate(row[0]);
    if (row[3]) await prisma.vendorBill.create({ data: { vendorName: 'CHICKEN', invoiceNo: String(row[2]||''), amount: Number(row[3]), pending: Number(row[3]), date }});
    if (row[7]) await prisma.vendorBill.create({ data: { vendorName: 'PAYAL', invoiceNo: String(row[6]||''), amount: Number(row[7]), pending: Number(row[7]), date }});
    if (row[9]) await prisma.vendorBill.create({ data: { vendorName: 'JIVDANI VEGETABLE', invoiceNo: String(row[8]||''), amount: Number(row[9]), pending: Number(row[9]), date }});
    if (row[11]) await prisma.vendorBill.create({ data: { vendorName: 'AMBIKA ENTERPRIES', invoiceNo: String(row[10]||''), amount: Number(row[11]), pending: Number(row[11]), date }});
    if (row[12] && row[13]) await prisma.vendorBill.create({ data: { vendorName: String(row[12]), amount: Number(row[13]), pending: Number(row[13]), date }});
  }

  console.log('Done!');
}
run();
