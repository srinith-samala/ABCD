import React, { useState, useEffect, useMemo } from 'react';
import { API } from '../config';
import Header from '../components/Header';

const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: 'year', label: 'This year' },
];
const UNITS = ['g', 'ml', 'pcs'];
const EMOJIS = ['🍛', '🍗', '🧀', '🥬', '🍲', '🍚', '🥘', '🍞', '🥗', '🍳'];

const money = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function inPeriod(dateStr, period) {
  if (period === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === 'last') {
    const l = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === l.getFullYear() && d.getMonth() === l.getMonth();
  }
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  return true;
}

// g / ml are priced per kg / litre; pcs are priced per piece
const lineCost = (i) => {
  const q = parseFloat(i.quantity) || 0;
  const p = parseFloat(i.pricePerKg) || 0;
  return i.unit === 'pcs' ? q * p : (q / 1000) * p;
};
const ingredientTotal = (r) => (r.ingredients || []).reduce((s, i) => s + lineCost(i), 0);
const priceLabel = (unit) => (unit === 'pcs' ? '₹ / piece' : unit === 'ml' ? '₹ / litre' : '₹ / kg');

const blankRecipe = () => ({
  name: '', emoji: '🍛', sellingPrice: '', portionNote: '',
  ingredients: [{ name: '', quantity: '', unit: 'g', pricePerKg: '' }],
});

export default function RecipeCosting() {
  const [recipes, setRecipes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [excluded, setExcluded] = useState([]); // expense categories left out of overhead
  const [platesOverride, setPlatesOverride] = useState(() => localStorage.getItem('recipePlates') || '');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
  });

  const load = async () => {
    try {
      const [r, e, t] = await Promise.all([
        fetch(`${API}/api/recipes`, { headers: authHeaders() }),
        fetch(`${API}/api/expenses`, { headers: authHeaders() }),
        fetch(`${API}/api/transactions`, { headers: authHeaders() }),
      ]);
      if (r.ok) setRecipes(await r.json());
      if (e.ok) setExpenses(await e.json());
      if (t.ok) setTransactions(await t.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (platesOverride) localStorage.setItem('recipePlates', platesOverride);
    else localStorage.removeItem('recipePlates');
  }, [platesOverride]);

  // Overhead = expenses in the chosen period / number of plates
  const overhead = useMemo(() => {
    const ex = expenses.filter(e => inPeriod(e.expenseDate || e.createdAt, period));
    const categories = [...new Set(ex.map(e => e.category))];
    const counted = ex.filter(e => !excluded.includes(e.category));
    const totalExpenses = counted.reduce((s, e) => s + e.amount, 0);
    const salesPlates = transactions
      .filter(t => t.type === 'SALE' && inPeriod(t.createdAt, period))
      .reduce((s, t) => s + t.quantity, 0);
    const override = parseFloat(platesOverride);
    const plates = override > 0 ? override : salesPlates;
    const perPlate = plates > 0 ? totalExpenses / plates : 0;
    return { categories, totalExpenses, salesPlates, plates, perPlate };
  }, [expenses, transactions, period, excluded, platesOverride]);

  const rows = useMemo(() => recipes.map(r => {
    const ingredientCost = ingredientTotal(r);
    const totalCost = ingredientCost + overhead.perPlate;
    const profit = r.sellingPrice ? r.sellingPrice - totalCost : null;
    const margin = r.sellingPrice ? (profit / r.sellingPrice) * 100 : null;
    return { ...r, ingredientCost, totalCost, profit, margin };
  }), [recipes, overhead.perPlate]);

  // ----- form helpers -----
  const openAdd = () => setForm(blankRecipe());
  const openEdit = (r) => setForm({
    id: r.id, name: r.name, emoji: r.emoji || '🍛', sellingPrice: r.sellingPrice ?? '', portionNote: r.portionNote || '',
    ingredients: r.ingredients.length
      ? r.ingredients.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit, pricePerKg: i.pricePerKg }))
      : blankRecipe().ingredients,
  });
  const setIng = (idx, patch) => setForm(f => ({
    ...f, ingredients: f.ingredients.map((i, n) => (n === idx ? { ...i, ...patch } : i)),
  }));
  const addIng = () => setForm(f => ({ ...f, ingredients: [...f.ingredients, { name: '', quantity: '', unit: 'g', pricePerKg: '' }] }));
  const removeIng = (idx) => setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, n) => n !== idx) }));

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Please enter a product name'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/recipes${form.id ? `/${form.id}` : ''}`, {
        method: form.id ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (res.ok) { setForm(null); load(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to save'); }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete "${r.name}" and its ingredients?`)) return;
    try {
      const res = await fetch(`${API}/api/recipes/${r.id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) load(); else alert('Failed to delete');
    } catch (err) { console.error(err); }
  };

  const loadSamples = async () => {
    try {
      const res = await fetch(`${API}/api/recipes/samples`, { method: 'POST', headers: authHeaders() });
      if (res.ok) load(); else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to load samples'); }
    } catch (err) { console.error(err); }
  };

  const toggleCategory = (c) => setExcluded(ex => (ex.includes(c) ? ex.filter(x => x !== c) : [...ex, c]));

  const inputStyle = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #E8EAED', fontSize: 13, fontFamily: 'inherit', outline: 'none' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 };
  const th = { padding: '8px 6px', textAlign: 'left' };

  const formIngredientCost = form ? ingredientTotal(form) : 0;
  const formTotal = formIngredientCost + overhead.perPlate;

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Recipe Costing" subtitle="Ingredient cost + expenses = total cost of each product" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>

        {/* Period + add */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6, background: '#fff', padding: 4, borderRadius: 12, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                padding: '7px 14px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: period === p.key ? '#0F1B2D' : 'transparent',
                color: period === p.key ? '#fff' : '#8A94A6',
              }}>{p.label}</button>
            ))}
          </div>
          <button onClick={openAdd} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Product</button>
        </div>

        {/* Overhead (from Expenses) */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Expenses added to every plate</h3>
          <p style={{ fontSize: 12, color: '#8A94A6', marginBottom: 16 }}>
            Taken from your Expenses page for the selected period, divided by the number of plates.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 14 }}>
            <div>
              <p style={labelStyle}>Expenses in period</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#F59E0B' }}>{money(overhead.totalExpenses)}</p>
            </div>
            <div>
              <label style={labelStyle}>Plates in period {overhead.salesPlates > 0 && `(sales: ${overhead.salesPlates})`}</label>
              <input
                style={inputStyle} type="number" min="0" placeholder={overhead.salesPlates ? `Auto: ${overhead.salesPlates}` : 'Enter plates sold'}
                value={platesOverride} onChange={e => setPlatesOverride(e.target.value)}
              />
            </div>
            <div>
              <p style={labelStyle}>Expense per plate</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#0F1B2D' }}>{money(overhead.perPlate)}</p>
            </div>
          </div>
          {overhead.plates === 0 && (
            <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', padding: '8px 12px', borderRadius: 8, marginBottom: 12 }}>
              No sales found for this period, so expenses can't be divided yet. Enter the number of plates above.
            </p>
          )}
          {overhead.categories.length > 0 && (
            <div>
              <p style={labelStyle}>Include these expense categories (tap to leave one out)</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {overhead.categories.map(c => {
                  const off = excluded.includes(c);
                  return (
                    <button key={c} onClick={() => toggleCategory(c)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid ' + (off ? '#E8EAED' : '#F59E0B'),
                      background: off ? '#fff' : '#FEF3C7', color: off ? '#8A94A6' : '#92400E',
                      textDecoration: off ? 'line-through' : 'none',
                    }}>{c}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Empty state */}
        {!loading && recipes.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 36, marginBottom: 8 }}>🧮</p>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>No products added yet</p>
            <p style={{ fontSize: 13, color: '#8A94A6', marginBottom: 18 }}>
              Add a product and its ingredients, or load Butter Chicken, Paneer Tikka, Chole and Palak Paneer to start.
            </p>
            <button onClick={loadSamples} style={{ padding: '9px 20px', borderRadius: 10, background: '#0F1B2D', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 10 }}>Load sample products</button>
            <button onClick={openAdd} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Product</button>
          </div>
        )}

        {/* Summary table */}
        {rows.length > 0 && (
          <div className="card" style={{ marginBottom: 20, overflowX: 'auto' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Cost per product (1 portion)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#8A94A6', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={th}>Product</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ingredients</th>
                  <th style={{ ...th, textAlign: 'right' }}>Expenses</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total cost</th>
                  <th style={{ ...th, textAlign: 'right' }}>Selling price</th>
                  <th style={{ ...th, textAlign: 'right' }}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid #E8EAED' }}>
                    <td style={{ padding: '10px 6px', fontWeight: 600 }}>{r.emoji} {r.name}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right' }}>{money(r.ingredientCost)}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right' }}>{money(overhead.perPlate)}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700 }}>{money(r.totalCost)}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', color: r.sellingPrice ? 'inherit' : '#8A94A6' }}>{r.sellingPrice ? money(r.sellingPrice) : '—'}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 600, color: r.profit == null ? '#8A94A6' : r.profit >= 0 ? '#16A34A' : '#EF4444' }}>
                      {r.profit == null ? '—' : `${r.profit >= 0 ? '+' : '-'}${money(Math.abs(r.profit))} (${r.margin.toFixed(0)}%)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Product cards with ingredient breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 18 }}>
          {rows.map(r => {
            const open = openId === r.id;
            return (
              <div key={r.id} className="card" style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>{r.emoji} {r.name}</h3>
                    {r.portionNote && <p style={{ fontSize: 12, color: '#8A94A6', marginTop: 2 }}>{r.portionNote}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 11, color: '#8A94A6', textTransform: 'uppercase' }}>Total cost</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#0F1B2D' }}>{money(r.totalCost)}</p>
                  </div>
                </div>

                <button onClick={() => setOpenId(open ? null : r.id)} style={{ margin: '12px 0', border: 'none', background: '#F4F5F7', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {open ? 'Hide ingredients' : `Show ${r.ingredients.length} ingredients`}
                </button>

                {open && (
                  <div style={{ overflowX: 'auto', marginBottom: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: '#8A94A6', fontSize: 10, textTransform: 'uppercase' }}>
                          <th style={th}>Ingredient</th>
                          <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                          <th style={{ ...th, textAlign: 'right' }}>Rate</th>
                          <th style={{ ...th, textAlign: 'right' }}>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.ingredients.map(i => (
                          <tr key={i.id} style={{ borderTop: '1px solid #E8EAED' }}>
                            <td style={{ padding: '7px 6px' }}>{i.name}</td>
                            <td style={{ padding: '7px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>{i.quantity} {i.unit}</td>
                            <td style={{ padding: '7px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>₹{i.pricePerKg}/{i.unit === 'pcs' ? 'pc' : i.unit === 'ml' ? 'L' : 'kg'}</td>
                            <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 600 }}>{money(lineCost(i))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ borderTop: '1px dashed #E8EAED', paddingTop: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#8A94A6' }}>Ingredients</span><span style={{ fontWeight: 600 }}>{money(r.ingredientCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8A94A6' }}>Expenses share</span><span style={{ fontWeight: 600 }}>{money(overhead.perPlate)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button onClick={() => openEdit(r)} style={{ border: 'none', background: '#F4F5F7', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => handleDelete(r)} style={{ border: 'none', background: '#FEE2E2', color: '#EF4444', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / edit modal */}
      {form && (
        <div onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{form.id ? 'Edit Product' : 'Add Product'}</h3>

            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 90 }}>
                <label style={labelStyle}>Icon</label>
                <select style={inputStyle} value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })}>
                  {EMOJIS.map(em => <option key={em}>{em}</option>)}
                </select>
              </div>
              <div style={{ flex: '2 1 200px' }}>
                <label style={labelStyle}>Product name *</label>
                <input style={inputStyle} placeholder="e.g. Butter Chicken" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div style={{ flex: '1 1 130px' }}>
                <label style={labelStyle}>Selling price (₹)</label>
                <input style={inputStyle} type="number" min="0" step="0.01" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Portion note</label>
              <input style={inputStyle} placeholder="e.g. 1 portion ~250 g chicken curry" value={form.portionNote} onChange={e => setForm({ ...form, portionNote: e.target.value })} />
            </div>

            <label style={labelStyle}>Ingredients (per 1 portion)</label>
            {form.ingredients.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input style={{ ...inputStyle, flex: '2 1 140px', width: 'auto' }} placeholder="Ingredient" value={i.name} onChange={e => setIng(idx, { name: e.target.value })} />
                <input style={{ ...inputStyle, flex: '1 1 70px', width: 'auto' }} type="number" min="0" step="any" placeholder="Qty" value={i.quantity} onChange={e => setIng(idx, { quantity: e.target.value })} />
                <select style={{ ...inputStyle, flex: '0 0 64px', width: 'auto' }} value={i.unit} onChange={e => setIng(idx, { unit: e.target.value })}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <input style={{ ...inputStyle, flex: '1 1 90px', width: 'auto' }} type="number" min="0" step="any" placeholder={priceLabel(i.unit)} value={i.pricePerKg} onChange={e => setIng(idx, { pricePerKg: e.target.value })} />
                <span style={{ flex: '0 0 70px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{money(lineCost(i))}</span>
                <button onClick={() => removeIng(idx)} title="Remove" style={{ border: 'none', background: '#FEE2E2', color: '#EF4444', borderRadius: 6, padding: '6px 9px', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <button onClick={addIng} style={{ border: '1px dashed #C9CED6', background: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}>+ Add ingredient</button>

            <div style={{ background: '#F4F5F7', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Ingredients</span><b>{money(formIngredientCost)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Expenses share</span><b>{money(overhead.perPlate)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}><span>Total cost</span><b>{money(formTotal)}</b></div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
