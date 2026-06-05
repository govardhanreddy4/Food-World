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
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { db, COLLECTIONS, messaging } from "../../firebase/firebaseConfig";
import { getToken, onMessage } from "firebase/messaging";
import { useElapsedTimer } from "../../hooks/useElapsedTimer";
import { useAuth } from "../../context/AuthContext";
import { audioController } from "../../utils/AudioController";
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
  Loader2,
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

// ─── Kitchen Timer Sub-Component ──────────────────────────────────────────────
// ─── Kitchen Timer Sub-Component ──────────────────────────────────────────────
function OrderTimer({ timestamp, status }) {
  const { elapsed, isUrgent } = useElapsedTimer(timestamp);
  const norm = (status || "").toLowerCase();
  const isActive = norm === "pending" || norm === "preparing";
  if (!isActive) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
        isUrgent ? "animate-pulse-orange text-orange-300" : "text-white/40"
      }`}
      style={
        isUrgent
          ? { background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)" }
          : { background: "rgba(255,255,255,0.05)" }
      }
    >
      <Clock size={9} />
      {elapsed}
    </span>
  );
}

// ─── Main AdminDashboard ──────────────────────────────────────────────────────
function AdminDashboard() {
  const { currentUser } = useAuth();
  const [orders, setOrders]           = useState([]);
  const [statusFilter, setStatusFilter] = useState("Active");
  const [timeFilter, setTimeFilter]   = useState("Today");
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading]         = useState(true);
  const prevPendingBatchIds           = useRef(new Set());
  const isInitialOrdersLoad           = useRef(true);
  const [activeAlarmOrder, setActiveAlarmOrder] = useState(null);
  const [updatingBatches, setUpdatingBatches] = useState(new Set());
  const updatingBatchesRef            = useRef(new Set());

  // ── Settlement State ──────────────────────────────────────────
  const [settleOrder, setSettleOrder] = useState(null);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");

  // ── Settings & Audio State ──────────────────────────────────────
  const [settings, setSettings] = useState(null);

  // ── Setup Service Worker & FCM ──────────────────────────────────
  useEffect(() => {
    if (!messaging || !currentUser) return;

    const setupPushNotifications = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const swUrl = `/firebase-messaging-sw.js?apiKey=${import.meta.env.VITE_FIREBASE_API_KEY}&projectId=${import.meta.env.VITE_FIREBASE_PROJECT_ID}&messagingSenderId=${import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID}&appId=${import.meta.env.VITE_FIREBASE_APP_ID}`;
          const registration = await navigator.serviceWorker.register(swUrl);
          
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
          if (vapidKey) {
            const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
            if (token) {
              await updateDoc(doc(db, COLLECTIONS.SETTINGS, currentUser.uid), {
                fcmToken: token,
                updatedAt: serverTimestamp()
              });
            }
          }
        }
      } catch (err) {
        console.warn("Push notification setup failed:", err);
      }
    };
    setupPushNotifications();

    const unsubscribeMessage = onMessage(messaging, (payload) => {
      // AudioController will handle concurrency
      audioController.playNotification('orderAlert', settings?.orderAlert?.duration || 15);
    });

    const handleSWMessage = (event) => {
      if (event.data && event.data.type === 'FCM_BACKGROUND_MESSAGE') {
        audioController.playNotification('orderAlert', settings?.orderAlert?.duration || 15);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    return () => {
      if (unsubscribeMessage) unsubscribeMessage();
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [currentUser, messaging, settings]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, COLLECTIONS.SETTINGS, currentUser.uid), (snap) => {
      if (snap.exists()) setSettings(snap.data());
    });
    return () => unsub();
  }, [currentUser?.uid]);

  const playOrderAlert = async (newOrder) => {
    setActiveAlarmOrder(newOrder);
    audioController.playNotification('orderAlert', settings?.orderAlert?.duration || 15);
  };

  const stopAlarm = () => {
    audioController.stopAll();
    setActiveAlarmOrder(null);
  };

  // ── Live orders listener ──────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      where("restaurantId", "==", currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const fetchedOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Detect new Pending batches → play alert beep
      const currentPendingBatchIds = new Set();
      fetchedOrders.forEach((o) => {
        if (Array.isArray(o.orderBatches)) {
          o.orderBatches.forEach((batch) => {
            if ((batch.status || "pending").toLowerCase() === "pending") {
              currentPendingBatchIds.add(`${o.id}_${batch.id}`);
            }
          });
        }
      });

      let hasNewPending = false;
      let newPendingOrder = null;
      let newBatchIndex = null;
      
      currentPendingBatchIds.forEach((uniqueBatchId) => {
        if (!prevPendingBatchIds.current.has(uniqueBatchId)) {
          hasNewPending = true;
          const [orderId, batchId] = uniqueBatchId.split("_");
          newPendingOrder = fetchedOrders.find((o) => o.id === orderId);
          if (newPendingOrder && newPendingOrder.orderBatches) {
            newBatchIndex = newPendingOrder.orderBatches.findIndex((b) => String(b.id) === String(batchId));
          }
        }
      });
      
      if (isInitialOrdersLoad.current) {
        isInitialOrdersLoad.current = false;
      } else if (hasNewPending && newPendingOrder) {
        newPendingOrder.newBatchIndex = newBatchIndex;
        playOrderAlert(newPendingOrder);
      }
      
      prevPendingBatchIds.current = currentPendingBatchIds;

      const STATUS_WEIGHTS = {
        pending: 1,
        preparing: 2,
        ready: 3,
        served: 4,
      };

      // Immutable shallow copy sorting
      const sortedOrders = [...fetchedOrders].sort((a, b) => {
        const statusA = (a.status || "").toLowerCase();
        const statusB = (b.status || "").toLowerCase();
        const weightA = STATUS_WEIGHTS[statusA] || 99;
        const weightB = STATUS_WEIGHTS[statusB] || 99;

        if (weightA !== weightB) {
          return weightA - weightB;
        }

        // Secondary sort: oldest first by timestamp
        const timeA = a.createdAt?.toMillis?.() || a.createdAt || 0;
        const timeB = b.createdAt?.toMillis?.() || b.createdAt || 0;
        return timeA - timeB;
      });

      setOrders(prevOrders => {
        return sortedOrders.map(newOrder => {
          const prevOrder = prevOrders.find(p => p.id === newOrder.id);
          if (!prevOrder) return newOrder;
          
          const mergedBatches = newOrder.orderBatches?.map(newBatch => {
            if (updatingBatchesRef.current.has(newBatch.id)) {
              const prevBatch = prevOrder.orderBatches?.find(b => b.id === newBatch.id);
              if (prevBatch) {
                return { ...newBatch, status: prevBatch.status };
              }
            }
            return newBatch;
          });
          return { ...newOrder, orderBatches: mergedBatches };
        });
      });
      setLoading(false);
    }, (error) => console.error("Orders listener error:", error));
    return () => unsub();
  }, [currentUser, currentUser?.uid]);

  // ── Update Batch Status (Race-Condition-Proof Transaction) ───
  async function updateBatchStatus(orderId, batchId, newStatus) {
    // 1. Lock the UI optimistically
    updatingBatchesRef.current.add(batchId);
    setUpdatingBatches(new Set(updatingBatchesRef.current));
    
    // Optimistic local state update
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const newBatches = [...(order.orderBatches || [])];
        const bIdx = newBatches.findIndex((b) => b.id === batchId);
        if (bIdx !== -1) {
          newBatches[bIdx] = { ...newBatches[bIdx], status: newStatus };
        }
        return { ...order, orderBatches: newBatches };
      })
    );

    let retries = 3;
    let success = false;
    
    while (retries > 0 && !success) {
      try {
        await runTransaction(db, async (transaction) => {
          const orderRef = doc(db, COLLECTIONS.ORDERS, orderId);
          const orderSnap = await transaction.get(orderRef);
          if (!orderSnap.exists()) throw new Error("Order does not exist!");
          
          const data = orderSnap.data();
          const batches = data.orderBatches || [];
          const bIdx = batches.findIndex((b) => b.id === batchId);
          
          if (bIdx === -1) {
            console.warn("Batch not found in Firestore!");
            return; 
          }
          
          batches[bIdx].status = newStatus;
          
          transaction.update(orderRef, {
            orderBatches: batches,
            updatedAt: serverTimestamp(),
          });
        });
        success = true;
      } catch (err) {
        retries -= 1;
        if (retries === 0) {
          console.error("Failed to update batch status after retries:", err);
        } else {
          // Silent background retry
          await new Promise((res) => setTimeout(res, 500));
        }
      }
    }
    
    // 2. Unlock the UI
    updatingBatchesRef.current.delete(batchId);
    setUpdatingBatches(new Set(updatingBatchesRef.current));
  }

  // ── Toggle Fulfillment Type ─────────────────────────────────────
  async function toggleFulfillment(orderId, currentType) {
    const newType = currentType === 'parcel' ? 'dine-in' : 'parcel';
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), {
        fulfillmentType: newType,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to toggle fulfillment type:", err);
    }
  }

  // ── Toggle Batch Fulfillment Type ─────────────────────────────────────
  async function toggleBatchFulfillment(orderId, batchId, currentType) {
    const newType = currentType === 'parcel' ? 'dine-in' : 'parcel';
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, COLLECTIONS.ORDERS, orderId);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order does not exist!");
        
        const data = orderSnap.data();
        const batches = data.orderBatches || [];
        const bIdx = batches.findIndex((b) => b.id === batchId);
        
        if (bIdx === -1) {
          console.warn("Batch not found in Firestore!");
          return;
        }
        
        batches[bIdx].fulfillmentType = newType;
        
        transaction.update(orderRef, {
          orderBatches: batches,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (err) {
      console.error("Failed to toggle batch fulfillment type:", err);
    }
  }

  // ── Archive Table (Settle Order) ──────────────────────────────
  async function archiveOrder(orderId, paymentSplit = null) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, active: false, status: "Completed/Paid", paymentSplit }
          : order
      )
    );

    try {
      const updateData = {
        active: false,
        status: "Completed/Paid",
        updatedAt: serverTimestamp(),
      };
      if (paymentSplit) {
        updateData.paymentSplit = paymentSplit;
      }
      await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), updateData);
    } catch (err) {
      console.error("Failed to archive table:", err);
      alert("Failed to archive table. Please try again.");
    }
  }

  // ── Time Filter orders ──────────────────────────────────────
  const timeFilteredOrders = orders.filter((o) => {
    if (timeFilter === "Overall") return true;
    
    let orderDate = null;
    if (o.createdAt) {
      const d = o.createdAt?.toDate?.() || new Date(o.createdAt);
      if (d instanceof Date && !isNaN(d)) {
        // use local date format that matches input[type="date"] (YYYY-MM-DD)
        const offset = d.getTimezoneOffset() * 60000;
        orderDate = new Date(d.getTime() - offset).toISOString().split('T')[0];
      }
    }
    
    if (timeFilter === "Today") {
      const d = new Date();
      const offset = d.getTimezoneOffset() * 60000;
      const today = new Date(d.getTime() - offset).toISOString().split('T')[0];
      return orderDate === today;
    }
    
    if (timeFilter === "Specific Date" && selectedDate) {
      return orderDate === selectedDate;
    }
    
    return true; // Fallback if no date parsing
  });

  // ── Filter orders by tab ──────────────────────────────────────
  const filteredOrders = timeFilteredOrders.filter((o) => {
    if (statusFilter === "Active") return o.active === true;
    if (statusFilter === "Completed") return o.active === false;
    return true;
  });

  // ── Summary counts ────────────────────────────────────────────
  const stats = {
    pending:      timeFilteredOrders.reduce((acc, o) => acc + (o.orderBatches?.filter(b => (b.status || "pending").toLowerCase() === "pending").length || 0), 0),
    preparing:    timeFilteredOrders.reduce((acc, o) => acc + (o.orderBatches?.filter(b => (b.status || "pending").toLowerCase() === "preparing").length || 0), 0),
    served:       timeFilteredOrders.reduce((acc, o) => acc + (o.orderBatches?.filter(b => (b.status || "pending").toLowerCase() === "served").length || 0), 0),
    activeTables: timeFilteredOrders.filter((o) => o.active).length,
  };

  // ── Helper: get status pill styling ───────────────────────────
  const getBatchStatusBadge = (status, isParcel = false) => {
    const norm = (status || "pending").toLowerCase();
    const styles = {
      pending: "bg-red-500/10 text-red-400 border border-red-500/20",
      preparing: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
      ready: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
      served: "bg-green-500/10 text-green-400 border border-green-500/20",
    };
    const names = {
      pending: "Pending",
      preparing: "Preparing",
      ready: "Ready",
      served: isParcel ? "Handed Over" : "Served",
    };
    const cls = styles[norm] || "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    const lbl = names[norm] || status || "Pending";
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
        {lbl}
      </span>
    );
  };

  // ── Helper: render KDS actions ────────────────────────────────
  const renderBatchActions = (order, batch) => {
    const orderId = order.id;
    const isParcel = (batch.fulfillmentType || order.fulfillmentType || 'dine-in') === 'parcel';
    const isUpdating = updatingBatches.has(batch.id);
    const norm = (batch.status || "pending").toLowerCase();
    
    if (norm === "pending") {
      return (
        <button
          disabled={isUpdating}
          onClick={() => updateBatchStatus(orderId, batch.id, "Preparing")}
          className="px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 rounded-lg hover:opacity-90 transition-all shadow-sm disabled:opacity-70 flex justify-center items-center gap-1.5"
        >
          {isUpdating ? <><Loader2 size={14} className="animate-spin"/> Updating...</> : "Start Cooking"}
        </button>
      );
    }
    if (norm === "preparing") {
      return (
        <button
          disabled={isUpdating}
          onClick={() => updateBatchStatus(orderId, batch.id, "Ready")}
          className="px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg hover:opacity-90 transition-all shadow-sm disabled:opacity-70 flex justify-center items-center gap-1.5"
        >
          {isUpdating ? <><Loader2 size={14} className="animate-spin"/> Updating...</> : "Mark Prepared"}
        </button>
      );
    }
    if (norm === "ready") {
      return (
        <button
          disabled={isUpdating}
          onClick={() => updateBatchStatus(orderId, batch.id, "Served")}
          className="px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg hover:opacity-90 transition-all shadow-sm disabled:opacity-70 flex justify-center items-center gap-1.5"
        >
          {isUpdating ? <><Loader2 size={14} className="animate-spin"/> Updating...</> : (isParcel ? "Hand Over to Customer" : "Serve to Table")}
        </button>
      );
    }
    return null;
  };


  return (
    <>
    {/* New Order Alarm Pop-Up Modal */}
    {activeAlarmOrder && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-[#1e293b] border border-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.2)] rounded-3xl p-6 md:p-8 max-w-sm w-full text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-5 animate-pulse">
            <Bell size={36} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2 tracking-tight">⚠️ New Incoming Order!</h2>
          <p className="text-white/60 mb-8 text-sm md:text-base">
            Table <strong className="text-white text-lg">{activeAlarmOrder.tableNumber}</strong> has just placed a new order
            {activeAlarmOrder.newBatchIndex !== undefined && activeAlarmOrder.newBatchIndex !== null 
              ? ` (Batch ${activeAlarmOrder.newBatchIndex + 1})` 
              : ''}.
          </p>
          <button
            onClick={stopAlarm}
            className="w-full py-3.5 md:py-4 px-6 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all"
          >
            Stop Alarm / Dismiss
          </button>
        </div>
      </div>
    )}

    <div className="flex flex-col xl:flex-row min-h-screen w-full overflow-hidden" style={{ background: "#0B0F19" }}>
      {/* ── Main KDS Content ─────────────────────────────────────── */}
      <div className="flex-1 p-3 md:p-6 min-w-0 w-full overflow-hidden">
        {/* Page header */}
        <div className="flex items-center justify-between mb-5 md:mb-6">
          <div>
            <h1 className="text-white text-xl md:text-2xl font-bold">Kitchen Display System (KDS)</h1>
            <p className="text-white/40 text-xs md:text-sm">Real-time KDS workflow table</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400/70 text-xs font-medium">Live Feed</span>
          </div>
        </div>

        {/* Time Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4 mb-5 md:mb-6">
          <div className="flex flex-wrap gap-2">
            {["Today", "Overall", "Specific Date"].map((f) => (
              <button
                key={f}
                onClick={() => setTimeFilter(f)}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-[11px] md:text-xs font-bold transition-all ${
                  timeFilter === f ? "text-white shadow-lg" : "text-white/40 hover:text-white/70"
                }`}
                style={
                  timeFilter === f
                    ? { background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(79,70,229,0.2))", border: "1px solid rgba(99,102,241,0.4)" }
                    : { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
                }
              >
                {f}
              </button>
            ))}
          </div>
          
          {timeFilter === "Specific Date" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[#0B0F19] border border-white/10 rounded-xl px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm text-white outline-none focus:border-indigo-500/50 shadow-inner"
              style={{ colorScheme: 'dark' }}
            />
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5 md:mb-6">
          {[
            { label: "Pending",       value: stats.pending,      color: "#ef4444" },
            { label: "Preparing",     value: stats.preparing,    color: "#f59e0b" },
            { label: "Served",        value: stats.served,       color: "#10b981" },
            { label: "Active Tables", value: stats.activeTables, color: "#6366f1", icon: Users },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-2xl p-3 md:p-4"
              style={{
                background: "rgba(15,23,42,0.6)",
                border: `1px solid ${color}30`,
                backdropFilter: "blur(16px)",
              }}
            >
              <p className="text-white/40 text-[10px] md:text-xs mb-1">{label}</p>
              <p className="text-white text-xl md:text-2xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 md:mb-5">
          {["Active", "Completed", "All"].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[11px] md:text-xs font-medium transition-all ${
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

        {/* KDS Table View */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
            <span className="text-5xl mb-4">🍳</span>
            <h3 className="text-xl font-semibold text-white">No active orders right now</h3>
            <p className="text-sm text-slate-400 mt-2 max-w-sm">New customer orders from table QR codes will appear here instantly.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block w-full max-w-full overflow-x-auto rounded-2xl border border-white/10 scrollbar-hide" style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(16px)" }}>
              <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider bg-white/5">
                  <th className="py-3.5 px-4 font-semibold">Table No.</th>
                  <th className="py-3.5 px-4 font-semibold">Order Details</th>
                  <th className="py-3.5 px-4 font-semibold">Total</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {filteredOrders.map((order) => {
                  const latestTimestamp = order.orderBatches?.[order.orderBatches.length - 1]?.timestamp;
                  const allServed = order.orderBatches?.every(b => (b.status || "").toLowerCase() === "served");
                  
                  return (
                    <tr key={order.id} className="hover:bg-white/5 transition-colors">
                      {/* Table No. */}
                      <td className="py-4 px-4 align-top font-bold text-sm">
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className="text-white text-base">
                            {String(order.tableNumber).toUpperCase() === 'PARCEL' ? 'Parcel' : `Table ${order.tableNumber}`}
                          </span>
                          {order.fulfillmentType === 'parcel' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">🛍️ TAKEAWAY</span>
                          )}
                          <OrderTimer timestamp={latestTimestamp} status={order.status} />
                        </div>
                      </td>
                      {/* Order Details */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-3 max-w-lg">
                          {order.orderBatches?.map((batch, bIdx) => (
                            <div 
                              key={bIdx} 
                              className={`text-xs rounded-xl p-3 border shadow-sm transition-all ${
                                (batch.fulfillmentType || order.fulfillmentType || 'dine-in') === 'parcel'
                                  ? 'bg-orange-500/10 border-orange-500/30'
                                  : 'bg-white/5 border-white/5'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-white/50 font-mono text-[10px] uppercase tracking-wider">Batch {bIdx + 1}</span>
                                  {getBatchStatusBadge(batch.status, (batch.fulfillmentType || order.fulfillmentType || 'dine-in') === 'parcel')}
                                  
                                  {/* Batch-level fulfillment badge */}
                                  {(batch.fulfillmentType || order.fulfillmentType || 'dine-in') === 'parcel' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                      🛍️ Takeaway / Parcel
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                      🍽️ Dine-In
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {renderBatchActions(order, batch)}
                                  
                                  {batch.timestamp && (
                                    <span className="text-[10px] text-white/30 font-mono">
                                      {new Date(batch.timestamp?.toDate?.() || batch.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1">
                                {batch.items?.map((item, i) => (
                                  <div key={i} className="flex justify-between text-sm">
                                    <span className="text-white/85 font-medium">{item.quantity}× {item.name}</span>
                                    <span className="text-white/40 text-xs">₹{(item.price * item.quantity).toFixed(0)}</span>
                                  </div>
                                ))}
                              </div>
                              {batch.notes && (
                                <div className="text-amber-300/80 italic text-xs mt-2 border-t border-white/5 pt-2 flex items-start gap-1">
                                  <span>📝</span>
                                  <span>{batch.notes}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      {/* Total */}
                      <td className="py-4 px-4 align-top font-bold text-sm text-white">
                        ₹{Number(order.totalAmount || 0).toFixed(2)}
                      </td>
                      {/* Status */}
                      <td className="py-4 px-4 align-top">
                         <span className={`px-2 py-1 rounded-full text-xs font-semibold ${order.active ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-slate-500/10 text-slate-400 border border-slate-500/20"}`}>
                           {order.active ? "Active" : "Completed"}
                         </span>
                      </td>
                      {/* Actions */}
                      <td className="py-4 px-4 align-top">
                        {order.active && allServed && (
                          <button
                            onClick={() => {
                              setSettleOrder(order);
                              setCashAmount("");
                              setUpiAmount("");
                            }}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-md hover:opacity-90 transition-all shadow-md"
                          >
                            Settle Bill
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden flex flex-col gap-5">
              {filteredOrders.map((order) => {
                const latestTimestamp = order.orderBatches?.[order.orderBatches.length - 1]?.timestamp;
                const allServed = order.orderBatches?.every(b => (b.status || "").toLowerCase() === "served");
                
                return (
                  <div key={order.id} className="bg-white/5 border border-white/10 rounded-xl flex flex-col overflow-hidden shadow-lg">
                    {/* Header: Table No & Timer */}
                    <div className={`flex justify-between items-start p-3 md:p-4 border-b border-white/5 ${order.fulfillmentType === 'parcel' ? 'bg-orange-500/10' : 'bg-black/20'}`}>
                      <div className="flex flex-col gap-1 items-start">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-base md:text-lg">
                            {String(order.tableNumber).toUpperCase() === 'PARCEL' ? 'Parcel' : `Table ${order.tableNumber}`}
                          </span>
                          {order.fulfillmentType === 'parcel' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">🛍️ TAKEAWAY</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-semibold w-fit ${order.active ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-slate-500/10 text-slate-400 border border-slate-500/20"}`}>
                            {order.active ? "Active" : "Completed"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-white font-bold text-base md:text-lg">₹{Number(order.totalAmount || 0).toFixed(2)}</span>
                        <OrderTimer timestamp={latestTimestamp} status={order.status} />
                      </div>
                    </div>

                    {/* Middle: Order Details */}
                    <div className="p-3 md:p-4 space-y-3 md:space-y-4">
                      {order.orderBatches?.map((batch, bIdx) => {
                        const bStatus = (batch.status || "").toLowerCase();
                        const batchFulfillment = batch.fulfillmentType || order.fulfillmentType || 'dine-in';
                        const isParcelBatch = batchFulfillment === 'parcel';
                        return (
                          <div 
                            key={bIdx} 
                            className={`text-xs rounded-xl p-3 md:p-4 border shadow-sm transition-all ${
                              isParcelBatch
                                ? 'bg-orange-500/10 border-orange-500/30'
                                : 'bg-white/5 border-white/5'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-2 md:mb-3 flex-wrap gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white/50 font-mono text-[10px] uppercase tracking-wider">Batch {bIdx + 1}</span>
                                {getBatchStatusBadge(batch.status, isParcelBatch)}
                                
                                {/* Batch-level fulfillment badge */}
                                {isParcelBatch ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                    🛍️ Takeaway / Parcel
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                    🍽️ Dine-In
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {batch.timestamp && (
                                  <span className="text-[10px] text-white/30 font-mono">
                                    {new Date(batch.timestamp?.toDate?.() || batch.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="space-y-1 md:space-y-2">
                              {batch.items?.map((item, i) => (
                                <div key={i} className="flex justify-between text-sm">
                                  <span className="text-white/85 font-medium text-xs md:text-sm">{item.quantity}× {item.name}</span>
                                  <span className="text-white/40 text-[11px] md:text-xs mt-0.5">₹{(item.price * item.quantity).toFixed(0)}</span>
                                </div>
                              ))}
                            </div>
                            {batch.notes && (
                              <div className="text-amber-300/80 italic text-[11px] md:text-xs mt-2 md:mt-3 border-t border-white/5 pt-2 flex items-start gap-1.5">
                                <span>📝</span>
                                <span>{batch.notes}</span>
                              </div>
                            )}
                            
                            {/* Mobile Action Buttons (Full width) */}
                            <div className="mt-3 md:mt-4">
                              {(() => {
                                const isUpdating = updatingBatches.has(batch.id);
                                if (bStatus === "pending") {
                                  return (
                                    <button
                                      disabled={isUpdating}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        updateBatchStatus(order.id, batch.id, "Preparing");
                                      }}
                                      className="w-full px-3 py-2 md:px-4 md:py-3 text-xs md:text-sm font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 rounded-lg md:rounded-xl hover:opacity-90 transition-all shadow-md disabled:opacity-70 flex justify-center items-center gap-2"
                                    >
                                      {isUpdating ? <><Loader2 size={16} className="animate-spin"/> Updating...</> : "Start Cooking"}
                                    </button>
                                  );
                                }
                                if (bStatus === "preparing") {
                                  return (
                                    <button
                                      disabled={isUpdating}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        updateBatchStatus(order.id, batch.id, "Ready");
                                      }}
                                      className="w-full px-3 py-2 md:px-4 md:py-3 text-xs md:text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg md:rounded-xl hover:opacity-90 transition-all shadow-md disabled:opacity-70 flex justify-center items-center gap-2"
                                    >
                                      {isUpdating ? <><Loader2 size={16} className="animate-spin"/> Updating...</> : "Mark Prepared"}
                                    </button>
                                  );
                                }
                                if (bStatus === "ready") {
                                  return (
                                    <button
                                      disabled={isUpdating}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        updateBatchStatus(order.id, batch.id, "Served");
                                      }}
                                      className="w-full px-3 py-2 md:px-4 md:py-3 text-xs md:text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg md:rounded-xl hover:opacity-90 transition-all shadow-md disabled:opacity-70 flex justify-center items-center gap-2"
                                    >
                                      {isUpdating ? <><Loader2 size={16} className="animate-spin"/> Updating...</> : (isParcelBatch ? "Hand Over to Customer" : "Serve to Table")}
                                    </button>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Mobile Settle Action */}
                    {order.active && allServed && (
                      <div className="p-3 md:p-4 border-t border-white/5 bg-black/10">
                        <button
                          onClick={() => {
                            setSettleOrder(order);
                            setCashAmount("");
                            setUpiAmount("");
                          }}
                          className="w-full px-3 py-2 md:px-4 md:py-3 text-xs md:text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-lg md:rounded-xl hover:opacity-90 transition-all shadow-md"
                        >
                          Settle Bill
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>


    </div>

      {/* ── Settlement Modal ─────────────────────────────────────── */}
      {settleOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl shadow-2xl relative" style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <button
              onClick={() => setSettleOrder(null)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-white mb-2">Settle Bill - Table {settleOrder.tableNumber}</h2>
            <p className="text-sm text-white/50 mb-6">Enter payment breakdown to complete the settlement.</p>
            
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 mb-6 text-center shadow-inner">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Total Bill Amount</p>
              <p className="text-3xl font-black text-white">₹{Number(settleOrder.totalAmount || 0).toFixed(2)}</p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">Cash Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">UPI / Digital Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={upiAmount}
                  onChange={(e) => setUpiAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            {(() => {
              const total = Number(settleOrder.totalAmount || 0);
              const entered = Number(cashAmount || 0) + Number(upiAmount || 0);
              const remaining = total - entered;
              const isComplete = entered >= total && total > 0;
              
              return (
                <>
                  <div className="flex justify-between items-center mb-6 px-1">
                    <div>
                      <p className="text-xs text-white/40">Amount Entered</p>
                      <p className="text-sm font-semibold text-indigo-400">₹{entered.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/40">Remaining</p>
                      <p className={`text-sm font-semibold ${remaining > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        ₹{remaining > 0 ? remaining.toFixed(2) : "0.00"}
                      </p>
                    </div>
                  </div>

                  <button
                    disabled={!isComplete}
                    onClick={async () => {
                      await archiveOrder(settleOrder.id, {
                        cash: Number(cashAmount || 0),
                        upi: Number(upiAmount || 0)
                      });
                      setSettleOrder(null);
                    }}
                    className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                      isComplete 
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:opacity-90 shadow-emerald-500/25" 
                        : "bg-white/5 text-white/30 cursor-not-allowed"
                    }`}
                  >
                    {isComplete ? "Complete Settlement" : "Enter Full Amount"}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}

export default AdminDashboard;
