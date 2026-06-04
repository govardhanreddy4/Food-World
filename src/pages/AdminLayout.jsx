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
  Receipt,
  Settings as SettingsIcon,
  Volume2,
  VolumeX,
  X,
  Menu,
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
  { to: "/admin/billing",  label: "Billing History",   icon: Receipt },
  { to: "/admin/settings", label: "Settings",          icon: SettingsIcon },
];

// Default fallback chime
function playDefaultChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

function AdminLayout() {
  const { user, currentUser, logout } = useAuth();
  const navigate = useNavigate();
  // ── Waiter Call Notifications ─────────────────────────────────
  const [waiterCalls, setWaiterCalls] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("fw_admin_muted") === "true");
  const prevCallIds = useRef(new Set());
  const [settings, setSettings] = useState(null);
  const audioRef = useRef(null);

  // ── Fetch Settings ────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, COLLECTIONS.SETTINGS, currentUser.uid), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      }
    });
    return () => unsub();
  }, [currentUser?.uid]);

  const playChime = async () => {
    const config = settings?.customerAlert;
    const localAudioBase64 = localStorage.getItem("custom_assistance_sound");
    
    if (config?.audioUrl === "local" && localAudioBase64) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      const audio = new Audio(localAudioBase64);
      audioRef.current = audio;
      audio.loop = true;
      audio.play().catch(console.error);
      
      const duration = config.duration || 15;
      setTimeout(() => {
        if (audioRef.current === audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      }, duration * 1000);
    } else {
      playDefaultChime();
    }
  };

  useEffect(() => {
    localStorage.setItem("fw_admin_muted", isMuted);
  }, [isMuted]);

  const MuteButton = () => (
    <button
      onClick={() => setIsMuted(!isMuted)}
      className="relative p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all outline-none"
      title={isMuted ? "Unmute Notifications" : "Mute Notifications"}
    >
      {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );

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
                onClick={async () => {
                  setIsOpen(false);
                  try {
                    await Promise.all(
                      waiterCalls.map(call =>
                        updateDoc(doc(db, COLLECTIONS.WAITER_CALLS, call.id), { dismissed: true })
                      )
                    );
                  } catch(e) { console.error("Error clearing all notifications:", e); }
                }}
                className="w-full p-3 text-center text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
              >
                Clear All
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
      
      // Detect new incoming calls
      const currentCallIds = new Set(calls.map((c) => c.id));
      let hasNewCall = false;
      currentCallIds.forEach((id) => {
        if (!prevCallIds.current.has(id)) hasNewCall = true;
      });
      
      // If there's a new call and we had a previous state, and it's not muted, play chime
      if (hasNewCall && prevCallIds.current.size > 0 && !isMuted) {
        playChime();
      }
      prevCallIds.current = currentCallIds;

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
    <nav className="flex flex-col gap-1 flex-1 relative">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 overflow-hidden ${
              isActive
                ? "text-white"
                : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`
          }
          style={({ isActive }) =>
            isActive
              ? {
                  background: "linear-gradient(90deg, rgba(99,102,241,0.15) 0%, transparent 100%)",
                  border: "1px solid rgba(99,102,241,0.1)",
                }
              : { border: "1px solid transparent" }
          }
          onClick={() => setMobileMenuOpen(false)}
        >
          {({ isActive }) => (
            <>
              <div
                className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-indigo-500 transition-all duration-300 ease-out origin-center ${
                  isActive ? "scale-y-100 opacity-100 shadow-[0_0_12px_rgba(99,102,241,0.8)]" : "scale-y-0 opacity-0"
                }`}
              />
              <Icon size={18} className={`transition-colors duration-300 ${isActive ? "text-indigo-400" : ""}`} />
              <span className="relative z-10">{label}</span>
              {to === "/admin" && waiterCalls.length > 0 && (
                <span
                  className="ml-auto flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-white animate-pulse"
                  style={{ background: "#ef4444" }}
                >
                  {waiterCalls.length}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div
      className="min-h-screen flex w-full overflow-x-hidden relative"
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
          <div className="flex items-center gap-1">
            <MuteButton />
            <NotificationButton />
          </div>
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
          <div className="flex items-center gap-1">
            <MuteButton />
            <NotificationButton />
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="text-white/60 hover:text-white p-2 -mr-2"
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      {/* Mobile Slide-out Drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={() => setMobileMenuOpen(false)}
      >
        <div
          className={`fixed top-0 left-0 bottom-0 w-[280px] p-5 flex flex-col transition-transform duration-300 ease-out transform ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{
            background: "#0B0F19",
            borderRight: "1px solid rgba(255,255,255,0.07)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile Drawer Header */}
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
            <button onClick={() => setMobileMenuOpen(false)} className="text-white/40 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 scrollbar-hide -mx-2 px-2">
            <NavLinks />
          </div>
          
          {/* Mobile User Info + Logout */}
          <div
            className="mt-4 p-3 rounded-xl shrink-0"
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
                className="flex items-center gap-1.5 p-2.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors shrink-0"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content Area ────────────────────────────────── */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
