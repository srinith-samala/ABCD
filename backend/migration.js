const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Convert Excel serial date to JS Date
function excelDateToJSDate(serial) {
  if (!serial) return new Date();
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

async function migrate() {
  console.log('Starting migration...');

  // 1. BANK EXPENSES
  try {
    console.log('Processing BANK EXPENCES SEP26.xlsx...');
    const bankWb = xlsx.readFile('../BANK EXPENCES SEP26.xlsx');
    const bankSheet = bankWb.Sheets[bankWb.SheetNames[0]];
    const bankData = xlsx.utils.sheet_to_json(bankSheet, { header: 1 });
    
    // Skip rows until we find 'DATE', 'PARTY', 'AMOUNT'
    let startRow = 0;
    for (let i = 0; i < bankData.length; i++) {
      if (bankData[i][0] === 'DATE' && bankData[i][1] === 'PARTY') {
        startRow = i + 1;
        break;
      }
    }

    let expensesCount = 0;
    for (let i = startRow; i < bankData.length; i++) {
      const row = bankData[i];
      if (!row || row.length === 0) continue;
      
      const dateSerial = row[0];
      const party = row[1];
      const amount = row[2];
      const paymentMode = row[3] || 'Bank';

      if (!party || !amount) continue;

      await prisma.expense.create({
        data: {
          title: party.toString(),
          amount: Number(amount),
          paymentMode: paymentMode.toString(),
          category: 'Bank',
          expenseDate: typeof dateSerial === 'number' ? excelDateToJSDate(dateSerial) : new Date(),
        }
      });
      expensesCount++;
    }
    console.log(`✅ Imported ${expensesCount} expenses.`);
  } catch (err) {
    console.log('Error parsing Bank Expenses:', err.message);
  }

  // 2. SALARY SHEET
  try {
    console.log('Processing SALARY SHEET TAKTAK SEP26.xlsx...');
    const salaryWb = xlsx.readFile('../SALARY SHEET TAKTAK SEP26.xlsx');
    const salarySheet = salaryWb.Sheets[salaryWb.SheetNames[0]];
    const salaryData = xlsx.utils.sheet_to_json(salarySheet, { header: 1 });

    let headers = [];
    let startRow = 0;
    for (let i = 0; i < salaryData.length; i++) {
      if (salaryData[i].includes('EMPLOYE NAME') && salaryData[i].includes('SALARY')) {
        headers = salaryData[i];
        startRow = i + 1;
        break;
      }
    }

    const nameIdx = headers.indexOf('EMPLOYE NAME');
    const presentIdx = headers.indexOf('PRESENT');
    const salaryIdx = headers.indexOf('SALARY');
    const advanceIdx = headers.indexOf('ADVANCE');
    const payIdx = headers.indexOf('PAY');

    let payrollCount = 0;
    for (let i = startRow; i < salaryData.length; i++) {
      const row = salaryData[i];
      if (!row || row.length === 0) continue;

      const name = row[nameIdx];
      const present = row[presentIdx];
      const salary = row[salaryIdx];
      const advance = row[advanceIdx] || 0;
      const netPay = row[payIdx];

      if (!name || !salary || isNaN(salary)) continue;

      await prisma.payroll.create({
        data: {
          employeeName: name.toString(),
          month: new Date('2026-09-01'), // Sep 2026
          presentDays: Number(present) || 0,
          salary: Number(salary),
          advance: Number(advance),
          netPay: Number(netPay) || (Number(salary) - Number(advance)),
        }
      });
      payrollCount++;
    }
    console.log(`✅ Imported ${payrollCount} payroll records.`);
  } catch (err) {
    console.log('Error parsing Salary Sheet:', err.message);
  }

  console.log('Migration completed!');
  await prisma.$disconnect();
}

migrate();
