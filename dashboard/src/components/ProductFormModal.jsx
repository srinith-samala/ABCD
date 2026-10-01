import React, { useState, useEffect } from 'react';
import { API } from '../config';

const UNITS = ['pcs', 'kg', 'g', 'L', 'ml', 'pack', 'box', 'dozen', 'bottle'];
const NEW_CAT = '__new__';

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 };

const Field = ({ label, children, full }) => (
  <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

export default function ProductFormModal({ product, onClose, onSaved }) {
  const editing = !!product;
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [f, setF] = useState({
    name: product?.name || '',
    category: product?.category?.name || '',
    supplierId: product?.supplierId ? String(product.supplierId) : '',
    costPrice: product?.costPrice ?? '',
    price: product?.price ?? '',
    quantity: editing ? product.quantity : '',
    unit: product?.unit || 'pcs',
    reorderLevel: product?.reorderLevel ?? 10,
    sku: product?.sku || '',
    emoji: product?.emoji || '📦',
    description: product?.description || '',
  });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
    fetch(`${API}/api/categories`, { headers }).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setCategories(d)).catch(console.error);
    fetch(`${API}/api/suppliers`, { headers }).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setSuppliers(d)).catch(console.error);
  }, []);

  const unitOptions = UNITS.includes(f.unit) ? UNITS : [...UNITS, f.unit];

  const save = async () => {
    const category = f.category === NEW_CAT ? newCat.trim() : f.category;
    if (!f.name.trim()) { alert('Product name is required'); return; }
    if (f.price === '' || Number(f.price) < 0) { alert('Please enter a valid sell price'); return; }
    if (f.category === NEW_CAT && !category) { alert('Please type the new category name'); return; }

    const body = {
      name: f.name,
      category,
      supplierId: f.supplierId,
      costPrice: f.costPrice,
      price: f.price,
      unit: f.unit,
      reorderLevel: f.reorderLevel,
      sku: f.sku,
      emoji: f.emoji,
      description: f.description,
    };
    if (editing) body.quantity = f.quantity === '' ? 0 : f.quantity;
    else body.openingStock = f.quantity === '' ? 0 : f.quantity;

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/stock${editing ? `/${product.id}` : ''}`, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body),
      });
      if (res.ok) { onSaved(); onClose(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to save product'); }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{editing ? 'Edit Product' : 'Add Product'}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Product name *</label>
              <input style={inputStyle} value={f.name} onChange={e => set('name', e.target.value)} autoFocus />
            </div>
            <div style={{ width: 84 }}>
              <label style={labelStyle}>Emoji</label>
              <input style={{ ...inputStyle, textAlign: 'center' }} value={f.emoji} maxLength={4} onChange={e => set('emoji', e.target.value)} />
            </div>
          </div>

          <Field label="Category">
            <select style={inputStyle} value={f.category} onChange={e => set('category', e.target.value)}>
              <option value="">— None —</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              {f.category && f.category !== NEW_CAT && !categories.some(c => c.name === f.category) && <option value={f.category}>{f.category}</option>}
              <option value={NEW_CAT}>+ New category…</option>
            </select>
            {f.category === NEW_CAT && (
              <input style={{ ...inputStyle, marginTop: 8 }} placeholder="New category name" value={newCat} onChange={e => setNewCat(e.target.value)} />
            )}
          </Field>
          <Field label="Supplier">
            <select style={inputStyle} value={f.supplierId} onChange={e => set('supplierId', e.target.value)}>
              <option value="">— None —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          <Field label="Buy price (₹)">
            <input style={inputStyle} type="number" min="0" step="0.01" value={f.costPrice} onChange={e => set('costPrice', e.target.value)} />
          </Field>
          <Field label="Sell price (₹) *">
            <input style={inputStyle} type="number" min="0" step="0.01" value={f.price} onChange={e => set('price', e.target.value)} />
          </Field>

          <Field label={editing ? 'Current stock' : 'Opening stock'}>
            <input style={inputStyle} type="number" min="0" value={f.quantity} onChange={e => set('quantity', e.target.value)} />
          </Field>
          <Field label="Unit">
            <select style={inputStyle} value={f.unit} onChange={e => set('unit', e.target.value)}>
              {unitOptions.map(u => <option key={u}>{u}</option>)}
            </select>
          </Field>

          <Field label="Reorder level">
            <input style={inputStyle} type="number" min="0" value={f.reorderLevel} onChange={e => set('reorderLevel', e.target.value)} />
          </Field>
          <Field label="SKU / code">
            <input style={inputStyle} value={f.sku} onChange={e => set('sku', e.target.value)} />
          </Field>

          <Field label="Description" full>
            <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={f.description} onChange={e => set('description', e.target.value)} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
