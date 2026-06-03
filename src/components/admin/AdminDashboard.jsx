/**
 * AdminDashboard.jsx
 * ------------------
 * Live order management command center for kitchen and front-of-house staff.
 *
 * Features:
 *   - Real-time Firestore onSnapshot for all orders
 *   - Status glow borders: Red (Pending), Amber (Preparing), Emerald (Served)
 *   - Per-card elapsed stopwatch with 15-min neon orange urgency pulse
 *   - Status progression buttons (Pending → Preparing → Served)
 *   - Reset Table: marks Completed/Paid, clears active flag
 *   - Waiter calls sidebar with real-time dismiss
 *   - Web Audio API 3-tone beep on new Pending order arrival
 *   - Summary stats bar: Pending / Preparing / Served / Active Tables
 */

import React, { useEffect, useState, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { useElapsedTimer } from "../../hooks/useElapsedTimer";
import {
  Bell,
  CheckCircle,
  Clock,
  ChefHat,
  RotateCcw,
  Flame,
  AlertTriangle,
  X,
  Users,
} from "lucide-react";

// ─── Status configuration ─────────────────────────────────────────────────────
const STATUS_CONFIG = {
  Pending: {
    label: "Pending",
    color: "#ef4444",
    glowColor: "rgba(239,68,68,0.5)",
    icon: AlertTriangle,
    next: "Preparing",
    nextLabel: "Start Cooking",
  },
  Preparing: {
    label: "Preparing",
    color: "#f59e0b",
    glowColor: "rgba(245,158,11,0.5)",
    icon: Flame,
    next: "Served",
    nextLabel: "Mark as Served",
  },
  Served: {
    label: "Served",
    color: "#10b981",
    glowColor: "rgba(16,185,129,0.4)",
    icon: CheckCircle,
    next: null,
    nextLabel: null,
  },
  "Completed/Paid": {
    label: "Completed",
    color: "#6b7280",
    glowColor: "rgba(107,114,128,0.2)",
    icon: CheckCircle,
    next: null,
    nextLabel: null,
  },
};

// ─── Web Audio API Alert Beep ─────────────────────────────────────────────────
function playNewOrderBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tones = [
      { freq: 880, start: 0,    duration: 0.15 },
      { freq: 660, start: 0.2,  duration: 0.15 },
      { freq: 880, start: 0.4,  duration: 0.15 },
    ];
    tones.forEach(({ freq, start, duration }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    });
  } catch {
    // Audio API not supported — fail silently
  }
}

// ─── Waiter call icon map ─────────────────────────────────────────────────────
const WAITER_ICONS = {
  "Request Water":    "💧",
  "Need Clean Plate": "🍽️",
  "Call Staff":       "🙋",
  "Bring Bill":       "🧾",
};

// ─── Kitchen Timer Sub-Component ──────────────────────────────────────────────
function OrderTimer({ timestamp, status }) {
  const { elapsed, isUrgent } = useElapsedTimer(timestamp);
  const isActive = status === "Pending" || status === "Preparing";
  if (!isActive) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full ${
        isUrgent ? "animate-pulse-orange text-orange-300" : "text-white/40"
      }`}
      style={
        isUrgent
          ? { background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)" }
          : { background: "rgba(255,255,255,0.05)" }
      }
    >
      <Clock size={11} />
      {elapsed}
      {isUrgent && <span className="ml-0.5">⚠️</span>}
    </span>
  );
}

// ─── Single Order Ticket ──────────────────────────────────────────────────────
function OrderTicket({ order, onReset }) {
  const cfg        = STATUS_CONFIG[order.status] || STATUS_CONFIG["Pending"];
  const StatusIcon = cfg.icon;
  const [resetting, setResetting] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  async function advanceStatus() {
    if (!cfg.next || advancing) return;
    setAdvancing(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, order.id), { status: cfg.next });
    } finally {
      setAdvancing(false);
    }
  }

  async function handleReset() {
    if (resetting) return;
    setResetting(true);
    try {
      await onReset(order.id);
    } finally {
      setResetting(false);
    }
  }

  const latestTimestamp = order.orderBatches?.[order.orderBatches.length - 1]?.timestamp;

  return (
    <div
      className="rounded-2xl p-4 transition-all"
      style={{
        background: "rgba(15,23,42,0.7)",
        border: `1px solid ${cfg.color}40`,
        backdropFilter: "blur(16px)",
        boxShadow: `0 0 20px ${cfg.glowColor}, 0 4px 24px rgba(0,0,0,0.3)`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${cfg.color}20`, border: `1px solid ${cfg.color}40` }}
          >
            <StatusIcon size={16} style={{ color: cfg.color }} />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">
              Table {order.tableNumber}
            </p>
            <p className="text-white/35 text-xs mt-0.5">
              {order.orderBatches?.length || 0} batch
              {order.orderBatches?.length !== 1 ? "es" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ background: `${cfg.color}20`, color: cfg.color }}
          >
            {cfg.label}
          </span>
          <OrderTimer timestamp={latestTimestamp} status={order.status} />
        </div>
      </div>

      {/* Order Batches */}
      <div className="space-y-2 mb-3 max-h-48 overflow-y-auto pr-1">
        {order.orderBatches?.map((batch, bIdx) => (
          <div
            key={bIdx}
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-white/30 text-xs mb-1.5 flex items-center gap-1">
              <Clock size={10} />
              Batch {bIdx + 1}
              {batch.timestamp && (
                <span className="ml-1">
                  {new Date(batch.timestamp?.toDate?.() || batch.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </p>
            {batch.items?.map((item, i) => (
              <div key={i} className="flex justify-between items-baseline text-sm">
                <span className="text-white/70">{item.quantity}× {item.name}</span>
                <span className="text-white/50 text-xs">
                  ₹{(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
            {batch.notes && (
              <p className="text-amber-300/70 text-xs mt-1.5 italic">📝 {batch.notes}</p>
            )}
          </div>
        ))}
      </div>

      {/* Total */}
      <div
        className="flex justify-between items-center px-3 py-2 rounded-xl mb-3"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <span className="text-white/50 text-sm">Total Bill</span>
        <span className="text-white font-bold text-base">
          ₹{Number(order.totalAmount || 0).toFixed(2)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {cfg.next && (
          <button
            onClick={advanceStatus}
            disabled={advancing}
            className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${cfg.color}cc, ${cfg.color}88)` }}
          >
            {advancing ? "Updating…" : cfg.nextLabel}
          </button>
        )}
        {order.status !== "Completed/Paid" && (
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Customer paid — reset table"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <RotateCcw size={13} />
            {resetting ? "…" : "Reset"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Waiter Call Card ─────────────────────────────────────────────────────────
function WaiterCallCard({ call, onDismiss }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl animate-alert-shake"
      style={{
        background: "rgba(249,115,22,0.12)",
        border: "1px solid rgba(249,115,22,0.3)",
      }}
    >
      <span className="text-xl shrink-0">
        {WAITER_ICONS[call.requestType] || "🔔"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-orange-300 font-semibold text-sm leading-none">
          Table {call.tableNumber}
        </p>
        <p className="text-orange-200/70 text-xs mt-0.5">{call.requestType}</p>
        {call.timestamp && (
          <p className="text-orange-200/30 text-xs mt-0.5">
            {new Date(call.timestamp?.toDate?.() || call.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(call.id)}
        className="shrink-0 text-orange-300/50 hover:text-orange-300 transition-colors p-1"
        aria-label="Dismiss waiter call"
      >
        <X size={16} />
      </button>
    </div>
  );
}

// ─── Main AdminDashboard ──────────────────────────────────────────────────────
function AdminDashboard() {
  const [orders, setOrders]           = useState([]);
  const [waiterCalls, setWaiterCalls] = useState([]);
  const [statusFilter, setStatusFilter] = useState("Active");
  const [loading, setLoading]         = useState(true);
  const prevOrderIds                  = useRef(new Set());

  // ── Live orders listener ──────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const newOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Detect new Pending orders → play alert beep
      const currentPendingIds = new Set(
        newOrders.filter((o) => o.status === "Pending").map((o) => o.id)
      );
      let hasNewPending = false;
      currentPendingIds.forEach((id) => {
        if (!prevOrderIds.current.has(id)) hasNewPending = true;
      });
      if (hasNewPending && prevOrderIds.current.size > 0) {
        playNewOrderBeep();
      }
      prevOrderIds.current = currentPendingIds;

      setOrders(newOrders);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Live waiter calls listener ────────────────────────────────
  // NOTE: Intentionally omits orderBy("timestamp") — combining where() +
  // orderBy() on different fields requires a Firestore composite index.
  // We sort client-side instead; active call volume is always tiny.
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.WAITER_CALLS),
      where("dismissed", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const calls = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      calls.sort((a, b) => {
        const ta = a.timestamp?.toMillis?.() ?? 0;
        const tb = b.timestamp?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setWaiterCalls(calls);
    });
    return () => unsub();
  }, []);

  // ── Dismiss waiter call ───────────────────────────────────────
  async function dismissWaiterCall(callId) {
    try {
      await updateDoc(doc(db, COLLECTIONS.WAITER_CALLS, callId), { dismissed: true });
    } catch {
      // Fallback: delete the document if update fails
      await deleteDoc(doc(db, COLLECTIONS.WAITER_CALLS, callId));
    }
  }

  // ── Reset table (payment complete) ───────────────────────────
  async function handleResetTable(orderId) {
    await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), {
      status: "Completed/Paid",
      active: false,
    });
  }

  // ── Filter orders by tab ──────────────────────────────────────
  const filteredOrders = orders.filter((o) => {
    if (statusFilter === "Active")
      return o.active === true || ["Pending", "Preparing", "Served"].includes(o.status);
    if (statusFilter === "Completed")
      return o.status === "Completed/Paid";
    return true;
  });

  // ── Summary counts ────────────────────────────────────────────
  const stats = {
    pending:      orders.filter((o) => o.status === "Pending").length,
    preparing:    orders.filter((o) => o.status === "Preparing").length,
    served:       orders.filter((o) => o.status === "Served").length,
    activeTables: orders.filter((o) => o.active).length,
  };

  return (
    <div className="flex min-h-screen" style={{ background: "#0B0F19" }}>
      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 p-6 min-w-0">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white text-2xl font-bold">Live Dashboard</h1>
            <p className="text-white/40 text-sm">Real-time order feed — auto-refreshing</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400/70 text-xs font-medium">Live</span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Pending",       value: stats.pending,      color: "#ef4444" },
            { label: "Preparing",     value: stats.preparing,    color: "#f59e0b" },
            { label: "Served",        value: stats.served,       color: "#10b981" },
            { label: "Active Tables", value: stats.activeTables, color: "#6366f1", icon: Users },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-2xl p-4"
              style={{
                background: "rgba(15,23,42,0.6)",
                border: `1px solid ${color}30`,
                backdropFilter: "blur(16px)",
              }}
            >
              <p className="text-white/40 text-xs mb-1">{label}</p>
              <p className="text-white text-2xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {["Active", "Completed", "All"].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                statusFilter === f ? "text-white" : "text-white/40 hover:text-white/70"
              }`}
              style={
                statusFilter === f
                  ? { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.4)" }
                  : { border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Order tickets */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div
            className="rounded-2xl py-20 text-center"
            style={{ background: "rgba(15,23,42,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <ChefHat size={40} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/30">No orders in this view.</p>
            <p className="text-white/15 text-sm mt-1">Waiting for customers to place orders…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredOrders.map((order) => (
              <OrderTicket key={order.id} order={order} onReset={handleResetTable} />
            ))}
          </div>
        )}
      </div>

      {/* ── Waiter Calls Sidebar ─────────────────────────────────── */}
      <aside
        className="hidden xl:flex flex-col w-72 min-h-screen p-4 shrink-0"
        style={{ background: "rgba(255,255,255,0.02)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2 mb-4 pt-2">
          <Bell size={18} className="text-orange-400" />
          <h2 className="text-white font-semibold text-sm">Staff Alerts</h2>
          {waiterCalls.length > 0 && (
            <span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold animate-pulse">
              {waiterCalls.length}
            </span>
          )}
        </div>

        {waiterCalls.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <Bell size={32} className="text-white/10 mb-2" />
            <p className="text-white/20 text-sm">No active calls</p>
            <p className="text-white/12 text-xs mt-1">
              Waiter requests from customers appear here in real time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto">
            {waiterCalls.map((call) => (
              <WaiterCallCard key={call.id} call={call} onDismiss={dismissWaiterCall} />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

export default AdminDashboard;
