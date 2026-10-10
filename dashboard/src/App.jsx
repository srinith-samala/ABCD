import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Orders from './pages/Orders';
import Suppliers from './pages/Suppliers';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Expenses from './pages/Expenses';
import Login from './pages/Login';

const ProtectedRoute = ({ adminOnly = false }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && role !== 'ADMIN') {
    return <Navigate to="/" replace />; // Redirect workers away from admin routes
  }

  return <Outlet />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login — no sidebar */}
        <Route path="/login" element={<Login />} />

        {/* All other pages — use Layout (sidebar + header) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/products" element={<Products />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            
            {/* Admin only routes */}
            <Route element={<ProtectedRoute adminOnly={true} />}>
              <Route path="/users" element={<Users />} />
              <Route path="/expenses" element={<Expenses />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
