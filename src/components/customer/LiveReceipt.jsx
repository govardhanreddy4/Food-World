/**
 * LiveReceipt.jsx
 * ---------------
 * The locked post-order session screen customers see after confirming their order.
 *
 * Features:
 *   - Real-time Firestore onSnapshot on the active order doc for this table
 *   - Displays all order batches grouped with timestamps
 *   - Bold running subtotal
 *   - "Please mention Table X at the counter" settlement banner
 *   - "Add More Items" button → clears localStorage lock → back to menu
 *   - Auto-navigates to fresh menu when admin resets the table (active=false)
 *   - Kitchen guardrail notice (no editing allowed)
 *   - Light glassmorphic theme with vibrant gradient background
 */

import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import {
  Clock,
  ChefHat,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Receipt,
} from "lucide-react";

// ─── localStorage helpers (duplicated inline for isolation) ──────────────────
const LS_KEY = (tableId) => `fw_session_table_${tableId}`;
function clearStoredSession(tableId) {
  localStorage.removeItem(LS_KEY(tableId));
}

// ─── Status badge styles ──────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const norm = (status || "").toLowerCase();
  const styles = {
    pending:          { bg: "rgba(239,68,68,0.12)",   color: "#ef4444", label: "Sent to Kitchen" },
    preparing:        { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b", label: "Being Prepared 🔥" },
    ready:            { bg: "rgba(59,130,246,0.12)",  color: "#3b82f6", label: "Ready to Serve 🍽️" },
    served:           { bg: "rgba(16,185,129,0.12)",  color: "#10b981", label: "Served ✓" },
    active:           { bg: "rgba(99,102,241,0.12)",  color: "#6366f1", label: "Session Active" },
    "completed/paid": { bg: "rgba(107,114,128,0.12)", color: "#6b7280", label: "Completed & Paid" },
  };
  const s = styles[norm] || styles["pending"];
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ─── Main LiveReceipt Component ───────────────────────────────────────────────
function LiveReceipt() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const tableId        = searchParams.get("table") || "";
  const resId          = searchParams.get("resId") || "";

  const [order, setOrder]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ── Listen for active order for this table ──────────────────
  useEffect(() => {
    if (!tableId || !resId) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      where("tableNumber", "==", String(tableId)),
      where("restaurantId", "==", String(resId)),
      where("active", "==", true),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        // Admin has reset this table — the session is cleared
        // Clear local storage and redirect to fresh menu
        clearStoredSession(tableId);
        setOrder(null);
        setNotFound(true);
        setLoading(false);

        // Brief delay so customer can see transition
        setTimeout(() => {
          navigate(`/menu?resId=${resId}&table=${tableId}`, { replace: true });
        }, 2500);
        return;
      }

      const orderDoc = snap.docs[0];
      setOrder({ id: orderDoc.id, ...orderDoc.data() });
      setLoading(false);
      setNotFound(false);
    });

    return () => unsub();
  }, [tableId, resId, navigate]);

  // ── Add More Items → unlock session ─────────────────────────
  function handleAddMore() {
    clearStoredSession(tableId);
    navigate(`/menu?resId=${resId}&table=${tableId}`);
  }

  // ── Loading State ─────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "radial-gradient(ellipse at 0% 0%, #ffd6e7 0%, #c3f0ca 25%, #c9e4ff 50%, #ffe8b5 75%, #f3d6ff 100%)",
          backgroundAttachment: "fixed",
        }}
      >
        <Loader2 size={36} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  // ── Table Reset State ─────────────────────────────────────────
  if (notFound) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background:
            "radial-gradient(ellipse at 0% 0%, #ffd6e7 0%, #c3f0ca 25%, #c9e4ff 50%, #ffe8b5 75%, #f3d6ff 100%)",
          backgroundAttachment: "fixed",
        }}
      >
        <div
          className="text-center p-8 rounded-3xl max-w-xs"
          style={{
            background: "rgba(255,255,255,0.40)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.50)",
          }}
        >
          <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
          <h2 className="text-[#1A1A1A] text-xl font-bold mb-2">
            Table Cleared!
          </h2>
          <p className="text-gray-600 text-sm mb-1">
            Thank you for dining with us.
          </p>
          <p className="text-gray-400 text-xs">
            Redirecting to menu…
          </p>
        </div>
      </div>
    );
  }

  const total = Number(order?.totalAmount || 0);

  return (
    <div
      className="min-h-screen pb-10"
      style={{
        background:
          "radial-gradient(ellipse at 0% 0%, #ffd6e7 0%, #c3f0ca 25%, #c9e4ff 50%, #ffe8b5 75%, #f3d6ff 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      {/* ── Settlement Banner ────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 px-5 py-3 text-center"
        style={{
          background: "linear-gradient(135deg, #6366f1ee, #8b5cf6ee)",
          backdropFilter: "blur(16px)",
        }}
      >
        <p className="text-white font-bold text-sm">
          Please mention <span className="text-yellow-200 font-black">Table {tableId}</span>{" "}
          at the counter to settle your bill.
        </p>
      </div>

      <div className="p-4 max-w-md mx-auto">
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4 mt-2">
          <div className="flex items-center gap-2">
            <Receipt size={20} className="text-indigo-600" />
            <h1 className="text-[#1A1A1A] text-lg font-black">Live Receipt</h1>
          </div>
          <StatusBadge status={order?.active ? "Active" : "Completed/Paid"} />
        </div>

        {/* ── Kitchen Guardrail Notice ─────────────────────────── */}
        <div
          className="flex items-start gap-2 p-3 rounded-2xl mb-4 text-xs"
          style={{
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.25)",
          }}
        >
          <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-800">
            <strong>Kitchen Guardrail:</strong> To cancel or modify an item already sent
            to the kitchen, please speak directly to a waiter.
          </p>
        </div>

        {/* ── Order Batches ────────────────────────────────────── */}
        <div className="space-y-3 mb-6">
          {order?.orderBatches?.map((batch, idx) => (
            <div
              key={idx}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.35)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.50)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              }}
            >
              {/* Batch header */}
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
              >
                <div className="flex items-center gap-1.5">
                  <ChefHat size={14} className="text-indigo-500" />
                  <span className="text-[#1A1A1A] font-bold text-xs mr-2">
                    Order {idx + 1}
                  </span>
                  <StatusBadge status={batch.status || "Pending"} />
                </div>
                <div className="flex items-center gap-1 text-gray-400 text-xs">
                  <Clock size={11} />
                  {batch.timestamp
                    ? new Date(
                        batch.timestamp?.toDate?.() || batch.timestamp
                      ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </div>
              </div>

              {/* Batch items */}
              <div className="px-4 py-3 space-y-2">
                {batch.items?.map((item, i) => (
                  <div key={i} className="flex justify-between items-baseline">
                    <span className="text-[#1A1A1A] text-sm">
                      {item.quantity}× {item.name}
                    </span>
                    <span className="text-gray-600 text-sm font-semibold">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}

                {/* Kitchen notes */}
                {batch.notes && (
                  <div
                    className="flex items-start gap-1.5 mt-2 p-2 rounded-xl text-xs"
                    style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}
                  >
                    <span>📝</span>
                    <span className="text-amber-700 italic">{batch.notes}</span>
                  </div>
                )}
              </div>

              {/* Batch subtotal */}
              <div
                className="flex justify-between px-4 py-2.5 text-xs font-semibold"
                style={{ borderTop: "1px solid rgba(0,0,0,0.06)", color: "#6366f1" }}
              >
                <span>Batch total</span>
                <span>₹{Number(batch.subtotal || 0).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Grand Total Card ─────────────────────────────────── */}
        <div
          className="p-5 rounded-2xl mb-6"
          style={{
            background: "rgba(255,255,255,0.45)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.55)",
            boxShadow: "0 8px 24px rgba(99,102,241,0.12)",
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Running Total</p>
              <p className="text-[#1A1A1A] font-black text-3xl">
                ₹{total.toFixed(2)}
              </p>
            </div>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <Receipt size={24} className="text-white" />
            </div>
          </div>
          <p className="text-gray-400 text-xs mt-3">
            {order?.orderBatches?.reduce((s, b) => s + (b.items?.length || 0), 0) || 0} items across{" "}
            {order?.orderBatches?.length || 0} order{order?.orderBatches?.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* ── Add More Items ────────────────────────────────────── */}
        {order?.status !== "Completed/Paid" && (
          <button
            id="btn-add-more-items"
            onClick={handleAddMore}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm transition-all hover:opacity-90 active:scale-97"
            style={{
              background: "rgba(255,255,255,0.40)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.55)",
              color: "#6366f1",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            }}
          >
            <PlusCircle size={20} />
            Add More Items
          </button>
        )}

        {/* Final settlement note */}
        <p className="text-center text-gray-400 text-xs mt-5">
          Taxes included. No service charge. Settle at counter.
        </p>
      </div>
    </div>
  );
}

export default LiveReceipt;
