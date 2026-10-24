import React, { useState, useEffect } from 'react';
import { API } from '../config';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Portal from '../components/Portal';
import { getRelevantEmoji } from '../emojiMap';

const COLORS = [
  { bg: '#EEF0FF', border: '#6C63FF' },
  { bg: '#D6F5E3', border: '#16A34A' },
  { bg: '#FEF3C7', border: '#D97706' },
  { bg: '#FEE2E2', border: '#EF4444' },
  { bg: '#E0F2FE', border: '#0284C7' },
  { bg: '#F3E8FF', border: '#9333EA' },
];

export default function Categories() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [catName, setCatName] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit category modal state
  const [editCat, setEditCat] = useState(null);
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);

  // Delete category confirmation state
  const [deletingCat, setDeletingCat] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API}/api/categories`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setCategories(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSaveCat = async () => {
    if (!catName.trim()) { alert('Category name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name: catName.trim() })
      });
      if (res.ok) { setShowAdd(false); setCatName(''); fetchCategories(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to create category'); }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCat = async () => {
    if (!editName.trim()) { alert('Category name is required'); return; }
    setEditing(true);
    try {
      const res = await fetch(`${API}/api/categories/${editCat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name: editName.trim() })
      });
      if (res.ok) { setEditCat(null); setEditName(''); fetchCategories(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to update category'); }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteCat = async () => {
    if (!deletingCat) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/api/categories/${deletingCat.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) { setDeletingCat(null); fetchCategories(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || 'Failed to delete category'); }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    } finally {
      setDeleting(false);
    }
  };

  const openCategoryInventory = (cName) => {
    navigate(`/inventory?category=${encodeURIComponent(cName)}`);
  };

  return (
    <div className="page-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header title="Categories" subtitle="Browse, manage, and inspect inventory grouped by product category" />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: '#64748B' }}>
            Click any category to instantly view and manage its specific inventory items.
          </p>
          <button onClick={() => setShowAdd(true)} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Category</button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
          {categories.map((cat, i) => {
            const style = COLORS[i % COLORS.length];
            const catEmoji = getRelevantEmoji('', cat.name, '');
            const itemCount = cat._count?.products ?? 0;
            return (
              <div key={cat.id} style={{
                background: style.bg,
                borderRadius: 16,
                padding: 24,
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                transition: 'transform 0.15s, box-shadow 0.15s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)'; }}>
                
                {/* Header with Emoji, Name, and Quick Edit / Delete */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 40, lineHeight: 1 }}>{catEmoji}</span>
                      <div>
                        <h3
                          onClick={() => openCategoryInventory(cat.name)}
                          style={{ fontSize: 18, fontWeight: 800, color: '#0F1B2D', marginBottom: 4, cursor: 'pointer' }}
                          title="Click to view this category's inventory"
                        >
                          {cat.name}
                        </h3>
                        <p style={{ fontSize: 12, color: '#64748B' }}>Created {new Date(cat.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {/* Category Action buttons: Edit and Delete */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditCat(cat); setEditName(cat.name); }}
                        title="Edit category name"
                        style={{
                          padding: '6px 10px', borderRadius: 8, background: '#fff', border: '1px solid #CBD5E1',
                          color: '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeletingCat(cat); }}
                        title="Delete category"
                        style={{
                          padding: '6px 10px', borderRadius: 8, background: '#fff', border: '1px solid #FECACA',
                          color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>

                  {/* Stat Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, background: 'rgba(255,255,255,0.7)', padding: '8px 14px', borderRadius: 10 }}>
                    <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>Stock Items</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: style.border }}>
                      {itemCount} item{itemCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                {/* Direct Action Link to Specific Inventory of that Category */}
                <div>
                  <button
                    onClick={() => openCategoryInventory(cat.name)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      width: '100%', justifyContent: 'center',
                      padding: '10px 18px', borderRadius: 10,
                      background: '#fff', color: style.border,
                      fontSize: 13, fontWeight: 700, border: 'none',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <span>View {cat.name} Inventory</span>
                    <span style={{ fontSize: 15 }}>→</span>
                  </button>
                </div>
              </div>
            );
          })}
          {categories.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#8A94A6' }}>No categories found. Click Add Category to create one.</div>
          )}
        </div>
      </div>

      {/* ADD CATEGORY MODAL */}
      {showAdd && (
        <Portal><div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>Add Category</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 }}>Category name *</label>
              <input
                value={catName}
                onChange={e => setCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveCat(); }}
                autoFocus
                placeholder="e.g. Dairy, Spices, Bakery..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveCat} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* EDIT CATEGORY MODAL */}
      {editCat && (
        <Portal><div onClick={() => setEditCat(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>Edit Category</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8A94A6', marginBottom: 6 }}>Category name *</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleUpdateCat(); }}
                autoFocus
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E8EAED', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditCat(null)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleUpdateCat} disabled={editing} style={{ padding: '9px 20px', borderRadius: 10, background: '#2ECC71', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: editing ? 0.7 : 1 }}>{editing ? 'Updating...' : 'Update'}</button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* DELETE CATEGORY CONFIRMATION MODAL */}
      {deletingCat && (
        <Portal><div onClick={() => setDeletingCat(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#DC2626', marginBottom: 12 }}>Delete Category</h3>
            <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, marginBottom: 16 }}>
              Are you sure you want to delete category <b>"{deletingCat.name}"</b>?
            </p>
            <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 20 }}>
              Note: Products currently in this category ({deletingCat._count?.products ?? 0} items) will NOT be deleted; their category will be reset to Uncategorized.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeletingCat(null)} style={{ padding: '9px 18px', borderRadius: 10, background: '#F4F5F7', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeleteCat} disabled={deleting} style={{ padding: '9px 20px', borderRadius: 10, background: '#DC2626', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.7 : 1 }}>{deleting ? 'Deleting...' : 'Delete Category'}</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}
