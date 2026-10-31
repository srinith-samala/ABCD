import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../config';
import Header from '../components/Header';
import Portal from '../components/Portal';
import MonthPicker from '../components/MonthPicker';
import ImportPayrollModal from '../components/ImportPayrollModal';

const money = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthKeyOf = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '';
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};

const MISC_PRESETS = [
  { label: '🏢 Rent', title: 'Shop / Property Rent', group: 'Rent', category: 'Rent' },
  { label: '⚡ Electricity / Light', title: 'Electricity / Light Bill', group: 'Utilities', category: 'Light Bill' },
  { label: '💧 Water Bill', title: 'Water / Municipal Bill', group: 'Utilities', category: 'Water Bill' },
  { label: '🌐 Internet & Phone', title: 'Internet / Phone Bill', group: 'Utilities', category: 'Phone & Internet' },
  { label: '🔧 Maintenance / Repairs', title: 'Maintenance & Repairs', group: 'Maintenance', category: 'Repairs' },
  { label: '🧹 Cleaning & Laundry', title: 'Cleaning & Laundry', group: 'Utilities', category: 'Laundry' },
  { label: '✨ General Misc', title: 'Miscellaneous Store Expense', group: 'General', category: 'Miscellaneous' },
];

const OVERHEAD_GROUPS = ['Rent', 'Utilities', 'Maintenance', 'Staff', 'Marketing', 'Transport', 'General'];
const PAYMENT_MODES = ['Cash', 'Bank', 'ICICI', 'SVC', 'UPI', 'Other'];

export default function Payroll() {
  const [tab, setTab] = useState('payroll'); // 'payroll' | 'misc'
  const [payroll, setPayroll] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [availableMonths, setAvailableMonths] = useState([]);
  const [search, setSearch] = useState('');
  
  // Modals
  const [payrollForm, setPayrollForm] = useState(null);
  const [expenseForm, setExpenseForm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
  }), []);

  const loadData = useCallback(async (selectedMonth) => {
    try {
      const q = selectedMonth && selectedMonth !== 'all' ? `?month=${selectedMonth}` : '';
      const [resPay, resExp, resPnl] = await Promise.all([
        fetch(`${API}/api/payroll${q}`, { headers: authHeaders() }),
        fetch(`${API}/api/expenses`, { headers: authHeaders() }),
        fetch(`${API}/api/accounts/pnl`, { headers: authHeaders() }).catch(() => null),
      ]);

      if (resPay.ok) {
        const payData = await resPay.json();
        setPayroll(Array.isArray(payData) ? payData : []);
      }
      if (resExp.ok) {
        const expData = await resExp.json();
        setExpenses(Array.isArray(expData) ? expData : []);
      }
      if (resPnl && resPnl.ok) {
        const pnlData = await resPnl.json();
        if (pnlData.months?.length) {
          setAvailableMonths(pnlData.months);
        }
      }
    } catch (err) {
      console.error('Failed to load payroll or expenses:', err);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadData(month);
  }, [month, loadData]);

  const handleMonthChange = (m) => {
    setMonth(m);
  };

  // Filtered Payroll list
  const filteredPayroll = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payroll.filter(p => {
      if (month && month !== 'all' && monthKeyOf(p.month) !== month) return false;
      if (q && !p.employeeName?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [payroll, month, search]);

  // Filtered Misc & Rent Expenses list (non-COGS overhead expenses)
  const filteredMiscExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(e => {
      const isOverhead = OVERHEAD_GROUPS.includes(e.group) || OVERHEAD_GROUPS.includes(e.category);
      if (!isOverhead) return false;
      if (month && month !== 'all' && monthKeyOf(e.expenseDate || e.createdAt) !== month) return false;
      if (q && !`${e.title} ${e.category || ''} ${e.group || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, month, search]);

  // Statistics
  const totalStaff = filteredPayroll.length;
  const totalBaseSalary = filteredPayroll.reduce((s, p) => s + (p.salary || 0), 0);
  const totalAdvances = filteredPayroll.reduce((s, p) => s + (p.advance || 0), 0);
  const totalNetPay = filteredPayroll.reduce((s, p) => s + (p.netPay || 0), 0);

  const totalRent = filteredMiscExpenses.filter(e => e.group === 'Rent' || /rent/i.test(e.title)).reduce((s, e) => s + e.amount, 0);
  const totalUtilities = filteredMiscExpenses.filter(e => e.group === 'Utilities' || /light|water|electric|bill|internet/i.test(e.title)).reduce((s, e) => s + e.amount, 0);
  const totalOtherMisc = filteredMiscExpenses.filter(e => e.group !== 'Rent' && !/light|water|electric|bill|internet/i.test(e.title)).reduce((s, e) => s + e.amount, 0);
  const totalMiscSum = filteredMiscExpenses.reduce((s, e) => s + e.amount, 0);
  const grandTotalMonthlyOutflow = totalNetPay + totalMiscSum;

  // --- Payroll CRUD ---
  const openAddPayroll = () => {
    setPayrollForm({
      employeeName: '',
      presentDays: 30,
      salary: '',
      advance: 0,
      netPay: 0,
      month: month && month !== 'all' ? month : new Date().toISOString().slice(0, 7),
    });
  };

  const openEditPayroll = (p) => {
    setPayrollForm({
      id: p.id,
      employeeName: p.employeeName,
      presentDays: p.presentDays,
      salary: String(p.salary),
      advance: String(p.advance),
      netPay: p.netPay,
      month: monthKeyOf(p.month) || new Date().toISOString().slice(0, 7),
    });
  };

  const handleSavePayroll = async () => {
    if (!payrollForm.employeeName.trim()) return alert('Employee name is required');
    setSaving(true);
    try {
      const url = payrollForm.id ? `${API}/api/payroll/${payrollForm.id}` : `${API}/api/payroll`;
      const method = payrollForm.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({
          ...payrollForm,
          month: payrollForm.month ? new Date(payrollForm.month + '-01T12:00:00Z') : new Date(),
        }),
      });
      if (res.ok) {
        setPayrollForm(null);
        loadData(month);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to save payroll entry');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayroll = async (p) => {
    if (!window.confirm(`Delete payroll entry for "${p.employeeName}"?`)) return;
    try {
      const res = await fetch(`${API}/api/payroll/${p.id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) {
        loadData(month);
      } else {
        alert('Failed to delete payroll entry');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Misc & Rent Expense CRUD ---
  const openAddMisc = (preset) => {
    setExpenseForm({
      title: preset?.title || '',
      amount: '',
      group: preset?.group || 'Rent',
      category: preset?.category || 'Rent',
      paymentMode: 'Bank',
      date: today(),
    });
  };

  const openEditMisc = (e) => {
    setExpenseForm({
      id: e.id,
      title: e.title,
      amount: String(e.amount),
      group: e.group || 'Rent',
      category: e.category || 'Rent',
      paymentMode: e.paymentMode || 'Cash',
      date: new Date(e.expenseDate || e.createdAt).toISOString().slice(0, 10),
    });
  };

  const handleSaveMisc = async () => {
    if (!expenseForm.title.trim() || !(parseFloat(expenseForm.amount) > 0)) {
      alert('Please enter a title and a valid amount greater than 0');
      return;
    }
    setSaving(true);
    try {
      const url = expenseForm.id ? `${API}/api/expenses/${expenseForm.id}` : `${API}/api/expenses`;
      const method = expenseForm.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(expenseForm),
      });
      if (res.ok) {
        setExpenseForm(null);
        loadData(month);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to save expense');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMisc = async (e) => {
    if (!window.confirm(`Delete expense "${e.title}"?`)) return;
    try {
      const res = await fetch(`${API}/api/expenses/${e.id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) {
        loadData(month);
      } else {
        alert('Failed to delete expense');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Payroll & Overheads" subtitle="Manage employee salaries, attendance, rent, and miscellaneous operating expenses" />
      
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        
        {/* Top Controls Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <MonthPicker months={availableMonths} value={month} onChange={handleMonthChange} />
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, width: 160, padding: '7px 12px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setImportOpen(true)}
              style={{
                padding: '9px 16px', borderRadius: 10, background: '#0F1B2D',
                color: '#fff', border: 'none', fontWeight: 600, fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              📥 Import Excel / CSV
            </button>
            {tab === 'payroll' ? (
              <button
                onClick={openAddPayroll}
                style={{
                  padding: '9px 18px', borderRadius: 10, background: '#2ECC71',
                  color: '#fff', border: 'none', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                + Add Employee Payroll
              </button>
            ) : (
              <button
                onClick={() => openAddMisc(null)}
                style={{
                  padding: '9px 18px', borderRadius: 10, background: '#2ECC71',
                  color: '#fff', border: 'none', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                + Add Rent / Misc Expense
              </button>
            )}
          </div>
        </div>

        {/* Unified Monthly Outflow Banner */}
        <div className="card" style={{
          marginBottom: 20, padding: '16px 20px',
          background: 'linear-gradient(135deg, #0F1B2D 0%, #1A2942 100%)',
          color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Total Monthly Operating Outflow &bull; {month === 'all' ? 'All Months' : month}
            </p>
            <p style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 0', color: '#2ECC71' }}>
              {money(grandTotalMonthlyOutflow)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Staff Salaries</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: '#fff' }}>{money(totalNetPay)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Rent</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: '#FBBF24' }}>{money(totalRent)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Utilities & Bills</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: '#60A5FA' }}>{money(totalUtilities)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Other Misc</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', color: '#C084FC' }}>{money(totalOtherMisc)}</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#F4F5F7', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 20 }}>
          <button
            onClick={() => setTab('payroll')}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              background: tab === 'payroll' ? '#fff' : 'transparent',
              color: tab === 'payroll' ? '#0F1B2D' : '#8A94A6',
              boxShadow: tab === 'payroll' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            👨‍🍳 Employee Salaries ({filteredPayroll.length})
          </button>
          <button
            onClick={() => setTab('misc')}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              background: tab === 'misc' ? '#fff' : 'transparent',
              color: tab === 'misc' ? '#0F1B2D' : '#8A94A6',
              boxShadow: tab === 'misc' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            🏢 Rent & Misc Expenses ({filteredMiscExpenses.length})
          </button>
        </div>

        {/* TAB 1: PAYROLL */}
        {tab === 'payroll' && (
          <div>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Staff Count', value: totalStaff, sub: 'Employees paid this month', color: '#0F1B2D' },
                { label: 'Total Base Salary', value: money(totalBaseSalary), sub: 'Gross salary commitment', color: '#0F1B2D' },
                { label: 'Advances Deducted', value: money(totalAdvances), sub: 'Loan & advance deductions', color: '#EF4444' },
                { label: 'Net Salary Payout', value: money(totalNetPay), sub: 'Actual salary cash/bank outflow', color: '#16A34A' },
              ].map(k => (
                <div key={k.label} className="card" style={{ padding: '14px 18px' }}>
                  <p style={{ fontSize: 11, color: '#8A94A6', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>{k.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: k.color, margin: '6px 0 2px' }}>{k.value}</p>
                  <p style={{ fontSize: 11, color: '#8A94A6', margin: 0 }}>{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Payroll Table */}
            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#FAFBFC' }}>
                  <tr style={{ textAlign: 'left', color: '#8A94A6', textTransform: 'uppercase', fontSize: 11 }}>
                    <th style={{ padding: '12px 14px' }}>Month</th>
                    <th style={{ padding: '12px 14px' }}>Employee</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Present Days</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Base Salary</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Advance</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Net Pay</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayroll.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid #E8EAED' }}>
                      <td style={{ padding: '12px 14px', color: '#8A94A6' }}>
                        {new Date(p.month).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F1B2D' }}>{p.employeeName}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#5B6577' }}>{p.presentDays}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 500 }}>{money(p.salary)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#EF4444', fontWeight: 500 }}>{money(p.advance)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{money(p.netPay)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => openEditPayroll(p)}
                          style={{
                            border: 'none', background: '#F4F5F7', borderRadius: 6,
                            padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePayroll(p)}
                          style={{
                            border: 'none', background: '#FEE2E2', color: '#EF4444',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredPayroll.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '36px 16px', color: '#8A94A6' }}>
                        No payroll entries recorded for this period. Click "+ Add Employee Payroll" or "📥 Import Excel / CSV".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: MISCELLANEOUS & RENT EXPENSES */}
        {tab === 'misc' && (
          <div>
            {/* Quick 1-Click Preset Buttons */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 8 }}>
                Quick Add Presets:
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {MISC_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => openAddMisc(preset)}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: '1px solid #E8EAED',
                      background: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Shop Rent', value: money(totalRent), sub: 'Property & store lease', color: '#F59E0B' },
                { label: 'Utilities & Bills', value: money(totalUtilities), sub: 'Electricity, water & internet', color: '#0284C7' },
                { label: 'Other Overheads', value: money(totalOtherMisc), sub: 'Repairs, laundry, general', color: '#8B5CF6' },
                { label: 'Total Overheads', value: money(totalMiscSum), sub: 'All non-payroll expenses', color: '#0F1B2D' },
              ].map(k => (
                <div key={k.label} className="card" style={{ padding: '14px 18px' }}>
                  <p style={{ fontSize: 11, color: '#8A94A6', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>{k.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: k.color, margin: '6px 0 2px' }}>{k.value}</p>
                  <p style={{ fontSize: 11, color: '#8A94A6', margin: 0 }}>{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#FAFBFC' }}>
                  <tr style={{ textAlign: 'left', color: '#8A94A6', textTransform: 'uppercase', fontSize: 11 }}>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Expense Title</th>
                    <th style={{ padding: '12px 14px' }}>Head / Category</th>
                    <th style={{ padding: '12px 14px' }}>Payment Mode</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMiscExpenses.map(e => (
                    <tr key={e.id} style={{ borderTop: '1px solid #E8EAED' }}>
                      <td style={{ padding: '12px 14px', color: '#8A94A6' }}>
                        {new Date(e.expenseDate || e.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F1B2D' }}>
                        {e.title}
                        {e.vendor && <div style={{ fontSize: 11, color: '#8A94A6', fontWeight: 400 }}>Vendor: {e.vendor}</div>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 6,
                          background: e.group === 'Rent' ? '#FEF3C7' : '#E0F2FE',
                          color: e.group === 'Rent' ? '#92400E' : '#0369A1',
                          fontWeight: 600,
                        }}>
                          {e.group || e.category}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#5B6577' }}>{e.paymentMode || 'Cash'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0F1B2D' }}>
                        {money(e.amount)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => openEditMisc(e)}
                          style={{
                            border: 'none', background: '#F4F5F7', borderRadius: 6,
                            padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteMisc(e)}
                          style={{
                            border: 'none', background: '#FEE2E2', color: '#EF4444',
                            borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredMiscExpenses.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '36px 16px', color: '#8A94A6' }}>
                        No rent or miscellaneous overheads recorded for this period. Click one of the quick presets above or "+ Add Rent / Misc Expense".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* --- ADD / EDIT PAYROLL MODAL --- */}
      {payrollForm && (
        <Portal>
          <div
            onClick={() => setPayrollForm(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000, padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 16, padding: 24,
                width: '100%', maxWidth: 460, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 18, color: '#0F1B2D' }}>
                {payrollForm.id ? 'Edit Employee Payroll' : 'Add Employee Payroll'}
              </h3>

              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Employee Name *</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. Ramesh Kumar"
                    value={payrollForm.employeeName}
                    onChange={(e) => setPayrollForm({ ...payrollForm, employeeName: e.target.value })}
                    autoFocus
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Month</label>
                  <input
                    type="month"
                    style={inputStyle}
                    value={payrollForm.month}
                    onChange={(e) => setPayrollForm({ ...payrollForm, month: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Present Days</label>
                  <input
                    type="number"
                    step="0.5"
                    style={inputStyle}
                    value={payrollForm.presentDays}
                    onChange={(e) => setPayrollForm({ ...payrollForm, presentDays: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Base Salary (₹)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={payrollForm.salary}
                    onChange={(e) => {
                      const s = parseFloat(e.target.value) || 0;
                      const a = parseFloat(payrollForm.advance) || 0;
                      setPayrollForm({ ...payrollForm, salary: e.target.value, netPay: Math.max(0, s - a) });
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Advance Deducted (₹)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={payrollForm.advance}
                    onChange={(e) => {
                      const a = parseFloat(e.target.value) || 0;
                      const s = parseFloat(payrollForm.salary) || 0;
                      setPayrollForm({ ...payrollForm, advance: e.target.value, netPay: Math.max(0, s - a) });
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Net Salary Payout (₹)</label>
                  <input
                    type="number"
                    readOnly
                    style={{ ...inputStyle, background: '#F4F5F7', fontWeight: 700, color: '#16A34A' }}
                    value={payrollForm.netPay}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setPayrollForm(null)}
                  style={{
                    padding: '9px 18px', borderRadius: 10, background: '#F4F5F7',
                    border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSavePayroll}
                  style={{
                    padding: '9px 22px', borderRadius: 10, background: '#2ECC71',
                    color: '#fff', border: 'none', fontWeight: 700, fontSize: 13,
                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Payroll'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* --- ADD / EDIT MISC & RENT EXPENSE MODAL --- */}
      {expenseForm && (
        <Portal>
          <div
            onClick={() => setExpenseForm(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000, padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 16, padding: 24,
                width: '100%', maxWidth: 460, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 18, color: '#0F1B2D' }}>
                {expenseForm.id ? 'Edit Overhead Expense' : 'Add Rent / Misc Expense'}
              </h3>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Expense Title *</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. Shop Rent, Electricity Bill, Water Bill"
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Category / Head</label>
                  <select
                    style={inputStyle}
                    value={expenseForm.group}
                    onChange={(e) => setExpenseForm({ ...expenseForm, group: e.target.value, category: e.target.value })}
                  >
                    {OVERHEAD_GROUPS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                    placeholder="0.00"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Paid Via</label>
                  <select
                    style={inputStyle}
                    value={expenseForm.paymentMode}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMode: e.target.value })}
                  >
                    {PAYMENT_MODES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setExpenseForm(null)}
                  style={{
                    padding: '9px 18px', borderRadius: 10, background: '#F4F5F7',
                    border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveMisc}
                  style={{
                    padding: '9px 22px', borderRadius: 10, background: '#2ECC71',
                    color: '#fff', border: 'none', fontWeight: 700, fontSize: 13,
                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* --- IMPORT MODAL --- */}
      {importOpen && (
        <ImportPayrollModal
          initialMonth={month && month !== 'all' ? month : undefined}
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            loadData(month);
          }}
        />
      )}

    </div>
  );
}
