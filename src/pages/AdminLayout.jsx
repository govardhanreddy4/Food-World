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

import React, { useEffect, useState, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Tag,
  QrCode,
  LogOut,
  Bell,
  ChefHat,
  LineChart,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { db, COLLECTIONS } from "../firebase/firebaseConfig";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
} from "firebase/firestore";

const NAV_ITEMS = [
  { to: "/admin",          label: "Dashboard",    icon: LayoutDashboard, end: true },
  { to: "/admin/menu",     label: "Menu Manager", icon: UtensilsCrossed },
  { to: "/admin/categories", label: "Category Studio", icon: Tag },
  { to: "/admin/qr",       label: "QR Studio",    icon: QrCode },
  { to: "/admin/sales",    label: "Sales & Analytics", icon: LineChart },
];

function AdminLayout() {
  const { user, currentUser, logout } = useAuth();
  const navigate = useNavigate();
  // ── Waiter Call Notifications ─────────────────────────────────
  const [waiterCalls, setWaiterCalls] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NotificationButton = () => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close on click outside
    useEffect(() => {
      function handleClickOutside(event) {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      }
      if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`relative p-2.5 rounded-xl transition-colors flex items-center justify-center shrink-0 border border-white/5 ${
            isOpen ? "bg-white/10" : "bg-white/5 hover:bg-white/10"
          }`}
          title="Notifications / Waiter Calls"
        >
          <Bell size={18} className="text-white/80" />
          {waiterCalls.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse shadow-md shadow-red-500/50">
              {waiterCalls.length}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-72 rounded-2xl overflow-hidden shadow-2xl z-50"
               style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center bg-white/5">
              <h3 className="text-white font-bold text-sm">Waiter Calls</h3>
              <span className="text-white/40 text-xs">{waiterCalls.length} active</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {waiterCalls.length === 0 ? (
                <div className="p-4 text-center text-white/40 text-sm">No new notifications</div>
              ) : (
                waiterCalls.map(call => (
                  <div key={call.id} className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors flex justify-between items-start">
                    <div>
                      <p className="text-orange-400 font-semibold text-sm">Table {call.tableNumber}</p>
                      <p className="text-white/70 text-xs mt-0.5">{call.requestType}</p>
                      {call.timestamp && (
                        <p className="text-white/30 text-[10px] mt-1">
                          {new Date(call.timestamp?.toDate?.() || call.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, COLLECTIONS.WAITER_CALLS, call.id), { dismissed: true });
                        } catch(e) { console.error(e); }
                      }}
                      className="text-white/30 hover:text-white p-1 rounded-lg hover:bg-white/10"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            {waiterCalls.length > 0 && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate("/admin");
                  if (mobileMenuOpen) setMobileMenuOpen(false);
                }}
                className="w-full p-3 text-center text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-white/5 transition-colors"
              >
                Go to Dashboard
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Live waiter call listener ────────────────────────────
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const q = query(
      collection(db, COLLECTIONS.WAITER_CALLS),
      where("restaurantId", "==", currentUser.uid),
      where("dismissed", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const calls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      calls.sort((a, b) => {
        const ta = a.timestamp?.toMillis?.() ?? 0;
        const tb = b.timestamp?.toMillis?.() ?? 0;
        return tb - ta; // newest first
      });
      setWaiterCalls(calls);
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
          {to === "/admin" && waiterCalls.length > 0 && (
            <span
              className="ml-auto flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-white animate-pulse"
              style={{ background: "#ef4444" }}
            >
              {waiterCalls.length}
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
        {/* Brand & Notifications */}
        <div className="flex items-center justify-between mb-8 px-1">
          <div className="flex items-center gap-3">
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
          <NotificationButton />
        </div>

        <NavLinks />

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
          <NotificationButton />
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
            
            {/* Mobile User Info + Logout */}
            <div
              className="mt-2 p-3 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="overflow-hidden pr-2">
                  <p className="text-white/70 text-sm font-medium truncate mb-0.5">
                    {user?.displayName || "Admin"}
                  </p>
                  <p className="text-white/30 text-xs truncate">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors shrink-0"
                >
                  <LogOut size={16} />
                  <span className="text-xs font-semibold">Sign out</span>
                </button>
              </div>
            </div>
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
