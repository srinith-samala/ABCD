const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function excelDateToJSDate(serial) {
  if (!serial || isNaN(serial)) return new Date();
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

async function migrate2() {
  console.log('Starting migration phase 2...');

  // 1. ONLINE PAYMENT -> DailySales
  try {
    console.log('Processing ONLINE PAYMENT SEP26.xlsx...');
    const opWb = xlsx.readFile('../ONLINE PAYMENT SEP26.xlsx');
    const opSheet = opWb.Sheets[opWb.SheetNames[0]];
    const opData = xlsx.utils.sheet_to_json(opSheet, { header: 1 });

    let startRow = 0;
    for (let i = 0; i < opData.length; i++) {
      if (opData[i][0] === 'DATE' && opData[i][1] === 'CARD') {
        startRow = i + 1;
        break;
      }
    }

    let salesCount = 0;
    for (let i = startRow; i < opData.length; i++) {
      const row = opData[i];
      if (!row || !row[0]) continue;
      
      const dateSerial = row[0];
      const card = Number(row[1]) || 0;
      const upi = Number(row[2]) || 0;

      if (!card && !upi) continue;
      const date = excelDateToJSDate(dateSerial);

      await prisma.dailySales.upsert({
        where: { date },
        update: { card, upi },
        create: { date, card, upi, cash: 0, zomato: 0, discount: 0 }
      });
      salesCount++;
    }
    console.log(`✅ Imported ${salesCount} Daily Sales records.`);
  } catch (err) {
    console.log('Error parsing Online Payment:', err.message);
  }

  // 2. CASH EXPENCE -> Categories & Products
  try {
    console.log('Processing CASH EXPENCE SEP26.xlsx...');
    const ceWb = xlsx.readFile('../CASH EXPENCE SEP26.xlsx');
    const ceSheet = ceWb.Sheets[ceWb.SheetNames[0]];
    const ceData = xlsx.utils.sheet_to_json(ceSheet, { header: 1 });

    let currentCategory = null;
    let productsCount = 0;

    for (let i = 1; i < ceData.length; i++) { // Skip header
      const row = ceData[i];
      if (!row || row.length === 0) continue;

      if (row.length === 1 || (row[0] && !row[1] && isNaN(row[0]))) {
        // Looks like a category header
        const catName = String(row[0]).trim();
        currentCategory = await prisma.category.upsert({
          where: { name: catName },
          update: {},
          create: { name: catName }
        });
      } else if (row[0] && row[1]) {
        // Product
        const productName = String(row[0]).trim();
        const amount = Number(row[1]) || 0;

        if (isNaN(productName)) { // Ensure it's text
          let categoryId = currentCategory ? currentCategory.id : null;
          
          await prisma.product.create({
            data: {
              name: productName,
              price: 0, // Since it's an expense item
              costPrice: amount,
              categoryId: categoryId
            }
          });
          productsCount++;
        }
      }
    }
    console.log(`✅ Imported ${productsCount} Products & Categories.`);
  } catch (err) {
    console.log('Error parsing Cash Expense:', err.message);
  }

  // 3. FOOD PURCHASE -> Vendor Bills
  try {
    console.log('Processing FOOD PURCHASE SEP26.xlsx...');
    const fpWb = xlsx.readFile('../FOOD PURCHASE SEP26.xlsx');
    const fpSheet = fpWb.Sheets[fpWb.SheetNames[0]];
    const fpData = xlsx.utils.sheet_to_json(fpSheet, { header: 1 });

    let startRow = 5; // From inspection
    let billsCount = 0;

    for (let i = startRow; i < fpData.length; i++) {
      const row = fpData[i];
      if (!row || !row[0]) continue;

      const date = excelDateToJSDate(row[0]);

      // CHICKEN
      if (row[3]) {
        await prisma.vendorBill.create({
          data: { vendorName: 'CHICKEN', invoiceNo: String(row[2] || ''), amount: Number(row[3]), pending: Number(row[3]), date }
        });
        billsCount++;
      }
      // PAYAL
      if (row[7]) {
        await prisma.vendorBill.create({
          data: { vendorName: 'PAYAL', invoiceNo: String(row[6] || ''), amount: Number(row[7]), pending: Number(row[7]), date }
        });
        billsCount++;
      }
      // JIVDANI VEGETABLE
      if (row[9]) {
        await prisma.vendorBill.create({
          data: { vendorName: 'JIVDANI VEGETABLE', invoiceNo: String(row[8] || ''), amount: Number(row[9]), pending: Number(row[9]), date }
        });
        billsCount++;
      }
      // AMBIKA ENTERPRIES
      if (row[11]) {
        await prisma.vendorBill.create({
          data: { vendorName: 'AMBIKA ENTERPRIES', invoiceNo: String(row[10] || ''), amount: Number(row[11]), pending: Number(row[11]), date }
        });
        billsCount++;
      }
      // PENDING BILL
      if (row[12] && row[13]) {
        await prisma.vendorBill.create({
          data: { vendorName: String(row[12]), amount: Number(row[13]), pending: Number(row[13]), date }
        });
        billsCount++;
      }
    }
    console.log(`✅ Imported ${billsCount} Vendor Bills.`);
  } catch (err) {
    console.log('Error parsing Food Purchase:', err.message);
  }

  console.log('Migration phase 2 completed!');
  await prisma.$disconnect();
}

migrate2();
