/**
 * CustomerMenu.jsx
 * ----------------
 * Public-facing customer menu view. No login required.
 *
 * Core Logic:
 *   1. Reads ?table=X from URL query string
 *   2. Loads menu items + categories via Firestore onSnapshot (real-time)
 *   3. Horizontal capsule category filter bar
 *   4. Cart state (local) — add/increase/decrease items before confirming
 *   5. "Kitchen Notes" text area (200 char limit)
 *   6. On "Confirm Order":
 *      a. Checks Firestore for an active order doc for this table
 *      b. If found: atomically appends batch via arrayUnion + increments total
 *      c. If not: creates a fresh order doc
 *      d. Sets localStorage lock → navigates to /receipt?table=X
 *   7. Floating "Call Waiter" glass button with request sheet
 *   8. Out-of-stock items: 30% opacity, "Sold Out" badge, disabled button
 *   9. Mid-meal "Add More Items" mode (unlocked from receipt screen)
 *
 * Theme: Light glassmorphic on vibrant ambient mesh gradient background
 */

import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  arrayUnion,
  increment,
  serverTimestamp,
  Timestamp,
  getDocs,
  limit,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import {
  ShoppingCart,
  Plus,
  Minus,
  Check,
  Bell,
  X,
  ChefHat,
  AlertCircle,
  Loader2,
} from "lucide-react";

// ─── localStorage helpers ────────────────────────────────────────────────────
const LS_KEY = (tableId) => `fw_session_table_${tableId}`;

function getStoredSession(tableId) {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY(tableId))) || null;
  } catch {
    return null;
  }
}

function setStoredSession(tableId, data) {
  localStorage.setItem(LS_KEY(tableId), JSON.stringify(data));
}

function clearStoredSession(tableId) {
  localStorage.removeItem(LS_KEY(tableId));
}

// ─── Floating Call Waiter Button & Sheet ─────────────────────────────────────
const WAITER_OPTIONS = ["Request Water", "Need Clean Plate", "Call Staff", "Bring Bill"];

function CallWaiterModule({ tableId, resId }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [sending, setSending]     = useState(false);
  const [sent, setSent]           = useState(false);

  async function handleSend() {
    if (!selected || !tableId || !resId || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, COLLECTIONS.WAITER_CALLS), {
        tableNumber: String(tableId),
        restaurantId: String(resId),
        requestType: selected,
        timestamp: serverTimestamp(),
        dismissed: false,
      });
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setSelected(null);
        setSheetOpen(false);
      }, 2000);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating Button */}
      <button
        id="btn-call-waiter"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl transition-transform hover:scale-110 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #f97316, #ef4444)",
          boxShadow: "0 0 0 4px rgba(249,115,22,0.2), 0 8px 24px rgba(249,115,22,0.4)",
          backdropFilter: "blur(8px)",
        }}
        aria-label="Call waiter"
        title="Call Waiter"
      >
        <Bell size={22} />
      </button>

      {/* Bottom Sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="rounded-t-3xl p-6 pb-10"
            style={{
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.6)",
              boxShadow: "0 -20px 40px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-4" />
            <h3 className="text-[#1A1A1A] text-lg font-bold mb-1 text-center">
              Need Assistance?
            </h3>
            <p className="text-gray-500 text-sm text-center mb-5">
              Select what you need — staff will be notified instantly.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {WAITER_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSelected(opt)}
                  className={`py-3 px-3 rounded-2xl text-sm font-semibold transition-all text-left ${
                    selected === opt
                      ? "text-white"
                      : "text-[#1A1A1A] bg-white/60 hover:bg-white/80"
                  }`}
                  style={
                    selected === opt
                      ? {
                          background: "linear-gradient(135deg, #f97316, #ef4444)",
                          boxShadow: "0 4px 16px rgba(249,115,22,0.3)",
                        }
                      : { border: "1px solid rgba(0,0,0,0.08)" }
                  }
                >
                  {opt}
                </button>
              ))}
            </div>

            {sent ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-100 text-emerald-700 font-semibold">
                <Check size={18} />
                Staff notified! They'll be right over.
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={!selected || sending}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #f97316, #ef4444)" }}
              >
                {sending ? "Sending…" : "Alert Staff"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Menu Item Card ────────────────────────────────────────────────────────────
function MenuItemCard({ item, cartQty, onAdd, onRemove }) {
  const soldOut = !item.available;

  return (
    <div
      className={`relative rounded-2xl overflow-hidden transition-all ${soldOut ? "opacity-30" : ""}`}
      style={{
        background: "rgba(255,255,255,0.30)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.40)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
      }}
    >
      {/* Sold Out Overlay Badge */}
      {soldOut && (
        <div className="absolute top-3 right-3 z-10">
          <span className="px-3 py-1 rounded-full text-xs font-bold text-white"
            style={{ background: "#6b7280" }}>
            Sold Out
          </span>
        </div>
      )}

      {/* Image */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full h-36 object-cover"
          onError={(e) => { e.target.parentElement.querySelector(".img-fallback")?.classList.remove("hidden"); e.target.style.display="none"; }}
        />
      ) : null}
      <div className={`img-fallback w-full h-36 items-center justify-center bg-white/20 ${item.imageUrl ? "hidden" : "flex"}`}>
        <ChefHat size={28} className="text-gray-400" />
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-[#1A1A1A] font-bold text-sm leading-tight">
            {item.name} <span className="ml-1 text-[10px]" title={item.foodType || "Veg"}>{item.foodType === "Non-Veg" ? "🔴" : "🟢"}</span>
          </h3>
          <span className="text-[#1A1A1A] font-black text-base shrink-0">
            ₹{Number(item.price).toFixed(0)}
          </span>
        </div>
        {item.description && (
          <p className="text-gray-600 text-xs line-clamp-2 mb-3">{item.description}</p>
        )}

        {/* Cart controls */}
        {soldOut ? (
          <div
            className="w-full py-2 rounded-xl text-center text-sm text-gray-400 font-medium"
            style={{ background: "rgba(0,0,0,0.06)" }}
          >
            Currently unavailable
          </div>
        ) : cartQty === 0 ? (
          <button
            onClick={() => onAdd(item)}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 transition-all hover:opacity-90 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
            }}
          >
            <Plus size={15} />
            Add
          </button>
        ) : (
          <div className="flex items-center justify-between">
            <button
              onClick={() => onRemove(item.id)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[#1A1A1A] font-bold transition-all hover:bg-red-50 active:scale-90"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <Minus size={15} />
            </button>
            <span className="text-[#1A1A1A] font-black text-lg w-10 text-center">
              {cartQty}
            </span>
            <button
              onClick={() => onAdd(item)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold transition-all hover:opacity-90 active:scale-90"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cart Checkout Panel ──────────────────────────────────────────────────────
function CartPanel({ cart, tableId, onConfirm, onClose, confirming }) {
  const [notes, setNotes] = useState("");
  const MAX_NOTES = 200;

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl p-6 pb-10 max-h-[85vh] overflow-y-auto"
        style={{
          background: "rgba(255,255,255,0.90)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow: "0 -20px 40px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-4" />

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#1A1A1A] text-lg font-bold">Review Order</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* Table badge */}
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl mb-4 text-xs font-semibold"
          style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1" }}
        >
          🪑 Table {tableId}
        </div>

        {/* Cart Items */}
        <div className="space-y-2 mb-4">
          {cart.map((item) => (
            <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100">
              <div>
                <p className="text-[#1A1A1A] font-semibold text-sm">{item.name}</p>
                <p className="text-gray-400 text-xs">₹{item.price} × {item.quantity}</p>
              </div>
              <span className="text-[#1A1A1A] font-bold">
                ₹{(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center py-3 mb-4 px-4 rounded-xl"
          style={{ background: "rgba(99,102,241,0.08)" }}>
          <span className="text-[#1A1A1A] font-bold">Total</span>
          <span className="text-[#1A1A1A] font-black text-xl">₹{total.toFixed(2)}</span>
        </div>

        {/* Kitchen Notes */}
        <div className="mb-5">
          <label className="text-[#1A1A1A] text-sm font-semibold mb-1.5 block">
            Kitchen Notes / Customizations
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
            placeholder="e.g. No onions, extra spicy, allergy to nuts…"
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-[#1A1A1A] text-sm placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(0,0,0,0.10)",
            }}
          />
          <p className="text-gray-400 text-xs text-right mt-1">
            {notes.length}/{MAX_NOTES}
          </p>
        </div>

        {/* Kitchen guardrail notice */}
        <div
          className="flex items-start gap-2 p-3 rounded-xl mb-4 text-sm"
          style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 text-xs">
            Once confirmed, orders go directly to the kitchen and{" "}
            <strong>cannot be edited or deleted</strong>. To cancel or modify an
            item already sent to the kitchen, please speak directly to a waiter.
          </p>
        </div>

        {/* Confirm Button */}
        <button
          onClick={() => onConfirm(notes)}
          disabled={confirming || cart.length === 0}
          className="w-full py-4 rounded-2xl text-white font-black text-base transition-all hover:opacity-90 active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
          }}
        >
          {confirming ? (
            <><Loader2 size={20} className="animate-spin" /> Sending to Kitchen…</>
          ) : (
            <><ChefHat size={20} /> Confirm Order</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main CustomerMenu Component ─────────────────────────────────────────────
function CustomerMenu() {
  const [searchParams]    = useSearchParams();
  const navigate          = useNavigate();
  const tableId           = searchParams.get("table") || "";
  const resId             = searchParams.get("resId") || "";

  const [menuItems, setMenuItems]       = useState([]);
  const [categories, setCategories]     = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [dietaryFilter, setDietaryFilter]   = useState("All"); // All, Veg, Non-Veg
  const [cart, setCart]                 = useState([]);
  const [cartOpen, setCartOpen]         = useState(false);
  const [confirming, setConfirming]     = useState(false);
  const [loadingMenu, setLoadingMenu]   = useState(true);
  const [error, setError]               = useState("");
  
  const [showWelcomeModal, setShowWelcomeModal] = useState(() => !sessionStorage.getItem("welcome_seen"));
  const restaurantName = localStorage.getItem("restaurant_name") || "Food World";

  // ── On mount: check localStorage for existing locked session ─
  useEffect(() => {
    if (!tableId || !resId) return;
    const session = getStoredSession(tableId);
    if (session?.locked && session?.orderId) {
      // Session is locked — redirect to receipt
      navigate(`/receipt?resId=${resId}&table=${tableId}`, { replace: true });
    }
  }, [tableId, resId, navigate]);

  // ── Live menu items ───────────────────────────────────────────
  useEffect(() => {
    if (!resId) return;
    const q = query(
      collection(db, COLLECTIONS.MENU_ITEMS),
      where("restaurantId", "==", resId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const fetchedItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedItems.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setMenuItems(fetchedItems);
      setLoadingMenu(false);
    }, (error) => console.error("CustomerMenu items listener error:", error));
    return () => unsub();
  }, [resId]);

  // ── Live categories ───────────────────────────────────────────
  useEffect(() => {
    if (!resId) return;
    const q = query(
      collection(db, COLLECTIONS.CATEGORIES),
      where("restaurantId", "==", resId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const fetchedCats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedCats.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      setCategories(fetchedCats);
    }, (error) => console.error("CustomerMenu categories error:", error));
    return () => unsub();
  }, [resId]);

  // ── Filtered menu ─────────────────────────────────────────────
  const filteredItems = menuItems.filter((i) => {
    // 1. Category Filter
    if (activeCategory !== "All" && i.category !== activeCategory) return false;
    // 2. Dietary Filter
    if (dietaryFilter !== "All") {
      const type = i.foodType || "Veg"; // fallback to Veg if unset
      if (type !== dietaryFilter) return false;
    }
    return true;
  });

  // ── Cart management ───────────────────────────────────────────
  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }

  function removeFromCart(itemId) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === itemId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter((i) => i.id !== itemId);
      return prev.map((i) =>
        i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i
      );
    });
  }

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Confirm Order ─────────────────────────────────────────────
  const handleConfirmOrder = useCallback(
    async (notes) => {
      if (cart.length === 0 || !tableId || !resId) return;
      setConfirming(true);
      setError("");

      try {
        const batchPayload = {
          id:        Date.now().toString(),
          status:    "Pending",
          items: cart.map((i) => ({
            id:       i.id,
            name:     i.name,
            price:    i.price,
            quantity: i.quantity,
            category: i.category || "",
          })),
          notes:     notes || "",
          timestamp: Timestamp.now(),
          subtotal:  cartTotal,
        };

        // Look for an existing ACTIVE order doc for this table and restaurant
        const existingQuery = query(
          collection(db, COLLECTIONS.ORDERS),
          where("tableNumber", "==", String(tableId)),
          where("restaurantId", "==", String(resId)),
          where("active", "==", true),
          limit(1)
        );
        const existingSnap = await getDocs(existingQuery);

        let orderId;

        if (!existingSnap.empty) {
          // ── Append to existing session (mid-meal) ─────────────
          const existingDoc = existingSnap.docs[0];
          orderId = existingDoc.id;
          await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), {
            orderBatches: arrayUnion(batchPayload),
            totalAmount:  increment(cartTotal),
            updatedAt:    serverTimestamp(),
          });
        } else {
          // ── Create new order session ──────────────────────────
          const newOrderRef = await addDoc(collection(db, COLLECTIONS.ORDERS), {
            tableNumber:  String(tableId),
            restaurantId:  String(resId),
            status:       "Pending",
            active:       true,
            totalAmount:  cartTotal,
            orderBatches: [batchPayload],
            createdAt:    serverTimestamp(),
            updatedAt:    serverTimestamp(),
          });
          orderId = newOrderRef.id;
        }

        // ── Lock session in localStorage ──────────────────────
        setStoredSession(tableId, {
          locked:   true,
          orderId,
          tableId,
          lockedAt: Date.now(),
        });

        // ── Navigate to receipt ───────────────────────────────
        setCartOpen(false);
        navigate(`/receipt?resId=${resId}&table=${tableId}`);
      } catch (err) {
        console.error("[Order] Failed to confirm:", err);
        setError("Failed to send order. Please check your connection and try again.");
      } finally {
        setConfirming(false);
      }
    },
    [cart, tableId, resId, cartTotal, navigate]
  );

  // ── No resId param guard ──────────────────────────────────────
  if (!resId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-900">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Invalid QR Code</h1>
          <p>Please scan the official QR code located on your table to view the menu.</p>
        </div>
      </div>
    );
  }

  // ── No table param guard ──────────────────────────────────────
  if (!tableId) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background:
            "radial-gradient(ellipse at 0% 0%, #ffd6e7 0%, #c3f0ca 25%, #c9e4ff 50%, #ffe8b5 75%, #f3d6ff 100%)",
        }}
      >
        <div
          className="text-center p-8 rounded-3xl"
          style={{
            background: "rgba(255,255,255,0.40)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.50)",
          }}
        >
          <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
          <h2 className="text-[#1A1A1A] text-xl font-bold mb-2">No Table Found</h2>
          <p className="text-gray-600 text-sm">
            Please scan the QR code on your table to access the menu.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative"
      style={{
        background:
          "radial-gradient(ellipse at 0% 0%, #ffd6e7 0%, #c3f0ca 25%, #c9e4ff 50%, #ffe8b5 75%, #f3d6ff 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      {/* ── First-time Welcome Modal ─────────────────────────────── */}
      {showWelcomeModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onClick={() => {
            setShowWelcomeModal(false);
            sessionStorage.setItem("welcome_seen", "true");
          }}
        >
          <div 
            className="p-8 rounded-3xl flex flex-col items-center justify-center shadow-2xl relative overflow-hidden max-w-sm w-full text-center"
            style={{
              background: "linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* Subtle glow effect inside */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl" />
            
            <h2 className="text-white text-2xl font-black mb-2 relative z-10 tracking-tight">
              Welcome to {restaurantName}!
            </h2>
            <p className="text-white/70 text-sm font-medium relative z-10 mb-6">
              Table {tableId} <span className="text-white/30 mx-1">•</span> Self-Ordering Menu
            </p>
            <p className="text-white/40 text-xs font-semibold relative z-10 animate-pulse">
              [ Tap anywhere to continue ]
            </p>
          </div>
        </div>
      )}

      {/* ── Sticky Header ──────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 px-4 pt-5 pb-2"
        style={{
          background: "rgba(255,255,255,0.20)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.35)",
        }}
      >
        {/* Restaurant name + table badge */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[#1A1A1A] font-black text-xl leading-none">
              🍽️ {restaurantName}
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">Fresh from the kitchen</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: "rgba(99,102,241,0.15)",
                color: "#6366f1",
                border: "1px solid rgba(99,102,241,0.3)",
              }}
            >
              🪑 Table {tableId}
            </span>
            {/* Cart button */}
            {cartCount > 0 && (
              <button
                id="btn-open-cart"
                onClick={() => setCartOpen(true)}
                className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
                }}
              >
                <ShoppingCart size={17} />
                <span>{cartCount}</span>
                <span className="text-white/75 text-xs font-normal">
                  ₹{cartTotal.toFixed(0)}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ── Category Filter Capsules ─────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
          {["All", ...categories.map((c) => c.label)].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                activeCategory === cat ? "text-white" : "text-[#1A1A1A]/70 hover:text-[#1A1A1A]"
              }`}
              style={
                activeCategory === cat
                  ? {
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
                    }
                  : {
                      background: "rgba(255,255,255,0.45)",
                      border: "1px solid rgba(255,255,255,0.60)",
                      backdropFilter: "blur(8px)",
                    }
              }
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Dietary Filter Buttons ─────────────────────────── */}
        <div className="flex items-center gap-2 mt-3 pb-1">
          <button
            onClick={() => setDietaryFilter("Veg")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              dietaryFilter === "Veg"
                ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                : "bg-white/40 text-emerald-700 border border-emerald-200/50"
            }`}
          >
            Veg Only 🟢
          </button>
          <button
            onClick={() => setDietaryFilter("Non-Veg")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              dietaryFilter === "Non-Veg"
                ? "bg-red-500 text-white shadow-md shadow-red-500/20"
                : "bg-white/40 text-red-700 border border-red-200/50"
            }`}
          >
            Non-Veg Only 🔴
          </button>
          <button
            onClick={() => setDietaryFilter("All")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              dietaryFilter === "All"
                ? "bg-slate-700 text-white shadow-md shadow-slate-500/20"
                : "bg-white/40 text-slate-700 border border-slate-200/50"
            }`}
          >
            Show All
          </button>
        </div>
      </header>

      {/* ── Error Banner ──────────────────────────────────────── */}
      {error && (
        <div
          className="mx-4 mt-3 flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          <AlertCircle size={15} className="text-red-500 shrink-0" />
          <span className="text-red-700">{error}</span>
          <button onClick={() => setError("")} className="ml-auto text-red-400">
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Menu Items Grid ────────────────────────────────────── */}
      <main className="p-4 pb-28">
        {loadingMenu ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={32} className="text-indigo-500 animate-spin" />
            <p className="text-gray-500 text-sm">Loading menu…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500">No items in this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                cartQty={cart.find((c) => c.id === item.id)?.quantity || 0}
                onAdd={addToCart}
                onRemove={removeFromCart}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Floating Sticky Cart Footer ──────────────────────── */}
      {cartCount > 0 && (
        <div className="fixed bottom-24 left-0 right-0 px-4 z-20">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl text-white font-bold text-sm transition-all hover:opacity-95 active:scale-98"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 8px 32px rgba(99,102,241,0.45)",
            }}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} />
              <span>{cartCount} item{cartCount !== 1 ? "s" : ""}</span>
            </div>
            <span>₹{cartTotal.toFixed(2)} →</span>
          </button>
        </div>
      )}

      {/* ── Call Waiter Module ────────────────────────────────── */}
      <CallWaiterModule tableId={tableId} resId={resId} />

      {/* ── Cart Checkout Panel ───────────────────────────────── */}
      {cartOpen && (
        <CartPanel
          cart={cart}
          tableId={tableId}
          confirming={confirming}
          onConfirm={handleConfirmOrder}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}

export default CustomerMenu;
