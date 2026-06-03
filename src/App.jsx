/**
 * App.jsx
 * -------
 * Root router for the Food World Restaurant Ordering App.
 *
 * Route Map:
 *   /menu              → CustomerMenu     (public, extracts ?table=X)
 *   /receipt           → LiveReceipt      (public, extracts ?table=X)
 *   /admin/login       → AdminLogin       (public, redirects if authed)
 *   /admin             → AdminLayout + ProtectedRoute
 *     /admin           → AdminDashboard   (index)
 *     /admin/menu      → MenuManager
 *     /admin/categories → CategoryStudio
 *     /admin/qr        → QRStudio
 *   /                  → Redirect to /admin/login
 *   *                  → 404 catch-all
 */

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";

// ── Shared ────────────────────────────────────────────────────────────────────
import ProtectedRoute from "./components/shared/ProtectedRoute";

// ── Pages ─────────────────────────────────────────────────────────────────────
import AdminLogin  from "./pages/AdminLogin";
import AdminLayout from "./pages/AdminLayout";

// ── Admin Components ──────────────────────────────────────────────────────────
import AdminDashboard  from "./components/admin/AdminDashboard";
import MenuManager     from "./components/admin/MenuManager";
import CategoryStudio  from "./components/admin/CategoryStudio";
import QRStudio        from "./components/admin/QRStudio";
import AdminSales      from "./components/admin/AdminSales";
import AdminBilling    from "./components/admin/AdminBilling";
import AdminSettings   from "./components/admin/AdminSettings";

// ── Customer Components ────────────────────────────────────────────────────────
import CustomerMenu from "./components/customer/CustomerMenu";
import LiveReceipt  from "./components/customer/LiveReceipt";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Customer Routes (public) ───────────────────────── */}
          <Route path="/menu"    element={<CustomerMenu />} />
          <Route path="/receipt" element={<LiveReceipt />} />

          {/* ── Admin Login (public) ───────────────────────────── */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* ── Admin Routes (protected) ──────────────────────── */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin"             element={<AdminDashboard />} />
              <Route path="/admin/menu"        element={<MenuManager />} />
              <Route path="/admin/categories"  element={<CategoryStudio />} />
              <Route path="/admin/qr"          element={<QRStudio />} />
              <Route path="/admin/sales"       element={<AdminSales />} />
              <Route path="/admin/billing"     element={<AdminBilling />} />
              <Route path="/admin/settings"    element={<AdminSettings />} />
            </Route>
          </Route>

          {/* ── Root redirect ──────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/admin/login" replace />} />

          {/* ── 404 catch-all ─────────────────────────────────── */}
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center bg-[#0B0F19]">
                <div className="text-center">
                  <p className="text-white/20 text-8xl font-black mb-4">404</p>
                  <p className="text-white/50">Page not found.</p>
                  <a href="/" className="text-indigo-400 text-sm mt-4 block hover:underline">
                    Go back home
                  </a>
                </div>
              </div>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
