import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { Receipt, Calendar, Banknote, Wallet, CreditCard } from "lucide-react";

function AdminBilling() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Default to today (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // ── Live listener for completed orders ──────────────────────
  useEffect(() => {
    if (!currentUser?.uid) return;

    // To keep real-time fast and avoid missing data that transitioned to completed 
    // recently, we fetch all orders or we can fetch only completed ones if we have an index.
    // For now, filtering locally to match AdminSales logic ensures robust offline handling.
    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      where("restaurantId", "==", currentUser.uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetchedOrders = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setOrders(fetchedOrders);
        setLoading(false);
      },
      (err) => {
        console.error("Billing history listener error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  // ── Filter orders by date ──────────────────────────────────
  const filteredOrders = useMemo(() => {
    if (!selectedDate) return [];

    // Parse the selected date string (YYYY-MM-DD) in local time
    const [year, month, day] = selectedDate.split("-").map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

    return orders
      .filter((o) => {
        const isCompleted = o.active === false || (o.status || "").toLowerCase() === "completed/paid";
        if (!isCompleted) return false;

        let orderTime = 0;
        if (o.updatedAt?.toMillis) {
          orderTime = o.updatedAt.toMillis();
        } else if (o.updatedAt?.toDate) {
          orderTime = o.updatedAt.toDate().getTime();
        } else if (o.createdAt?.toMillis) {
          orderTime = o.createdAt.toMillis();
        } else if (o.createdAt?.toDate) {
          orderTime = o.createdAt.toDate().getTime();
        } else if (o.updatedAt) {
          orderTime = new Date(o.updatedAt).getTime();
        }

        return orderTime >= startOfDay && orderTime <= endOfDay;
      })
      .sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const timeB = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return timeB - timeA; // Newest first
      });
  }, [orders, selectedDate]);

  // ── Summary Metrics ────────────────────────────────────────
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCash = 0;
    let totalUpi = 0;

    filteredOrders.forEach((o) => {
      totalRevenue += Number(o.totalAmount || 0);
      if (o.paymentSplit) {
        totalCash += Number(o.paymentSplit.cash || 0);
        totalUpi += Number(o.paymentSplit.upi || 0);
      } else {
        totalCash += Number(o.totalAmount || 0);
      }
    });

    return {
      totalRevenue,
      totalOrders: filteredOrders.length,
      totalCash,
      totalUpi,
    };
  }, [filteredOrders]);

  // ── Formatters ─────────────────────────────────────────────
  const formatTime = (order) => {
    const timestamp = order.updatedAt || order.createdAt;
    if (!timestamp) return "N/A";
    const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getCashUpi = (order) => {
    if (order.paymentSplit) {
      return {
        cash: Number(order.paymentSplit.cash || 0),
        upi: Number(order.paymentSplit.upi || 0)
      };
    }
    // Fallback if older data doesn't have split
    return { cash: Number(order.totalAmount || 0), upi: 0 };
  };

  const glassCard = {
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(16px)",
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "#0B0F19" }}>
      {/* Header & Date Picker */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
          >
            <Receipt size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">Billing History</h1>
            <p className="text-white/40 text-sm">Review settled bills and detailed payment ledgers</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={glassCard}>
          <Calendar size={18} className="text-white/50" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent border-none outline-none text-white font-medium text-sm w-36 focus:ring-0"
            style={{ colorScheme: "dark" }}
          />
        </div>
      </div>

      {/* Summary Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Card 1: Total Revenue */}
        <div className="rounded-2xl p-6" style={glassCard}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Banknote size={20} />
            </div>
            <p className="text-white/50 text-sm font-medium">Selected Day Settlement</p>
          </div>
          <p className="text-3xl font-black text-white ml-1">₹{metrics.totalRevenue.toFixed(2)}</p>
        </div>

        {/* Card 2: Cash Collection */}
        <div className="rounded-2xl p-6" style={glassCard}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-300">
              <Wallet size={20} />
            </div>
            <p className="text-white/50 text-sm font-medium">Today's Cash Collection</p>
          </div>
          <p className="text-3xl font-black text-white ml-1">₹{metrics.totalCash.toFixed(2)}</p>
        </div>

        {/* Card 3: UPI Collection */}
        <div className="rounded-2xl p-6" style={glassCard}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <CreditCard size={20} />
            </div>
            <p className="text-white/50 text-sm font-medium">Today's UPI Collection</p>
          </div>
          <p className="text-3xl font-black text-white ml-1">₹{metrics.totalUpi.toFixed(2)}</p>
        </div>

        {/* Card 4: Total Orders */}
        <div className="rounded-2xl p-6" style={glassCard}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-white/10 text-white/80">
              <Receipt size={20} />
            </div>
            <p className="text-white/50 text-sm font-medium">Orders Finalized</p>
          </div>
          <p className="text-3xl font-black text-white ml-1">{metrics.totalOrders}</p>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 rounded-2xl text-center max-w-2xl mx-auto mt-12" style={glassCard}>
          <span className="text-6xl mb-6 opacity-80">📋</span>
          <h3 className="text-2xl font-bold text-white mb-2">No Settlements Found</h3>
          <p className="text-slate-400 mb-6">There are no completed orders for the selected date.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-2xl border border-white/10 scrollbar-hide shadow-2xl" style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(16px)" }}>
          <table className="w-full min-w-[800px] text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider bg-white/5">
                <th className="py-4 px-6 font-semibold">Table</th>
                <th className="py-4 px-6 font-semibold">Time</th>
                <th className="py-4 px-6 font-semibold">Cash (₹)</th>
                <th className="py-4 px-6 font-semibold">UPI (₹)</th>
                <th className="py-4 px-6 font-semibold">Total Bill</th>
                <th className="py-4 px-6 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {filteredOrders.map((order) => {
                const splits = getCashUpi(order);
                return (
                  <tr key={order.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 px-6 font-bold text-white">Table {order.tableNumber}</td>
                    <td className="py-4 px-6 text-sm text-white/70">{formatTime(order)}</td>
                    <td className="py-4 px-6 text-sm font-medium text-emerald-400">
                      {splits.cash > 0 ? `₹${splits.cash.toFixed(2)}` : "-"}
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-indigo-400">
                      {splits.upi > 0 ? `₹${splits.upi.toFixed(2)}` : "-"}
                    </td>
                    <td className="py-4 px-6 font-bold text-white">₹{Number(order.totalAmount || 0).toFixed(2)}</td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Settled ✓
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminBilling;
