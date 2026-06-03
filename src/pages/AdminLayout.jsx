/**
 * AdminLayout.jsx
 * ---------------
 * Persistent sidebar navigation wrapper for all admin pages.
 *
 * Renders:
 *   - Dark glassmorphic sidebar with nav links
 *   - Waiter call notification badge (live count from Firestore)
 *   - Admin user info + logout button
 *   - <Outlet /> for nested route content
 */

import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Tag,
  QrCode,
  LogOut,
  Bell,
  ChefHat,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { db, COLLECTIONS } from "../firebase/firebaseConfig";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";

const NAV_ITEMS = [
  { to: "/admin",          label: "Dashboard",    icon: LayoutDashboard, end: true },
  { to: "/admin/menu",     label: "Menu Manager", icon: UtensilsCrossed },
  { to: "/admin/categories", label: "Category Studio", icon: Tag },
  { to: "/admin/qr",       label: "QR Studio",    icon: QrCode },
];

function AdminLayout() {
  const { user, currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [waiterCallCount, setWaiterCallCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Live waiter call badge count ────────────────────────────
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const q = query(
      collection(db, COLLECTIONS.WAITER_CALLS),
      where("resId", "==", currentUser.uid),
      where("dismissed", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setWaiterCallCount(snap.size);
    });
    return () => unsub();
  }, [currentUser, currentUser?.uid]);

  async function handleLogout() {
    await logout();
    navigate("/admin/login");
  }

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 flex-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? "text-white"
                : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`
          }
          style={({ isActive }) =>
            isActive
              ? {
                  background: "rgba(99,102,241,0.2)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  boxShadow: "0 0 16px rgba(99,102,241,0.15)",
                }
              : {}
          }
          onClick={() => setMobileMenuOpen(false)}
        >
          <Icon size={18} />
          <span>{label}</span>
          {/* Waiter call badge on Dashboard link */}
          {to === "/admin" && waiterCallCount > 0 && (
            <span
              className="ml-auto flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-white animate-pulse"
              style={{ background: "#ef4444" }}
            >
              {waiterCallCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "#0B0F19" }}
    >
      {/* ── Desktop Sidebar ──────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-64 min-h-screen p-5 shrink-0"
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRight: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8 px-1">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <ChefHat size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Food World</p>
            <p className="text-white/30 text-xs mt-0.5">Admin Panel</p>
          </div>
        </div>

        <NavLinks />

        {/* Waiter Alert Indicator */}
        {waiterCallCount > 0 && (
          <div
            className="flex items-center gap-2 p-3 rounded-xl my-3 animate-pulse-orange"
            style={{
              background: "rgba(249,115,22,0.12)",
              border: "1px solid rgba(249,115,22,0.3)",
            }}
          >
            <Bell size={16} className="text-orange-400 shrink-0" />
            <span className="text-orange-300 text-xs font-medium">
              {waiterCallCount} waiter call{waiterCallCount > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* User Info + Logout */}
        <div
          className="mt-4 p-3 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <p className="text-white/70 text-xs truncate mb-0.5">
            {user?.displayName || "Admin"}
          </p>
          <p className="text-white/30 text-xs truncate">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 mt-3 text-white/40 hover:text-red-400 text-xs transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ───────────────────────────────────── */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14"
        style={{
          background: "rgba(11,15,25,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div className="flex items-center gap-2">
          <ChefHat size={20} className="text-indigo-400" />
          <span className="text-white font-bold text-sm">Food World Admin</span>
        </div>
        <div className="flex items-center gap-3">
          {waiterCallCount > 0 && (
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse">
              {waiterCallCount}
            </span>
          )}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="text-white/60 hover:text-white p-1"
          >
            <LayoutDashboard size={20} />
          </button>
        </div>
      </div>

      {/* Mobile Slide-out Menu */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30"
          onClick={() => setMobileMenuOpen(false)}
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="absolute top-14 left-0 right-0 p-4 flex flex-col gap-1"
            style={{
              background: "#0B0F19",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <NavLinks />
          </div>
        </div>
      )}

      {/* ── Main Content Area ────────────────────────────────── */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
