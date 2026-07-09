import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { Receipt, Calendar, Banknote, Wallet, CreditCard, Utensils, ShoppingBag } from "lucide-react";
import { PageHeader, StatCard, GlassCard, TextInput } from "./AdminUI";

function AdminBilling() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [timeFilter, setTimeFilter] = useState('today'); // 'today', 'overall', 'custom'
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
    let startOfDay, endOfDay;

    if (timeFilter === 'today') {
      const today = new Date();
      startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime();
      endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime();
    } else if (timeFilter === 'custom' && selectedDate) {
      const [year, month, day] = selectedDate.split("-").map(Number);
      startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
      endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
    }

    return orders
      .filter((o) => {
        const isCompleted = o.active === false || (o.status || "").toLowerCase() === "completed/paid";
        if (!isCompleted) return false;

        if (timeFilter === 'overall') return true;

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
  }, [orders, timeFilter, selectedDate]);

  // ── Summary Metrics ────────────────────────────────────────
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCash = 0;
    let totalUpi = 0;
    let totalDineIn = 0;
    let totalParcel = 0;

    filteredOrders.forEach((o) => {
      const orderTotal = Number(o.totalAmount || 0);
      totalRevenue += orderTotal;
      
      if (o.paymentSplit) {
        totalCash += Number(o.paymentSplit.cash || 0);
        totalUpi += Number(o.paymentSplit.upi || 0);
      } else {
        totalCash += orderTotal;
      }
      
      if (o.orderBatches && o.orderBatches.length > 0) {
        o.orderBatches.forEach(batch => {
          const batchTotal = batch.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
          const type = batch.fulfillmentType || o.fulfillmentType || 'dine-in';
          if (type === 'parcel') {
            totalParcel += batchTotal;
          } else {
            totalDineIn += batchTotal;
          }
        });
      } else {
        const type = o.fulfillmentType || 'dine-in';
        if (type === 'parcel') {
          totalParcel += orderTotal;
        } else {
          totalDineIn += orderTotal;
        }
      }
    });

    return {
      totalRevenue,
      totalOrders: filteredOrders.length,
      totalCash,
      totalUpi,
      totalDineIn,
      totalParcel,
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
      {/* Header & Filters */}
      <div className="flex flex-col gap-6 mb-8">
        <PageHeader
          title="Billing History"
          subtitle="Review settled bills and detailed payment ledgers"
          rightContent={
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/20 border border-indigo-500/30">
              <Receipt size={20} className="text-indigo-400" />
            </div>
          }
        />

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto">
            <button
              onClick={() => setTimeFilter('today')}
              className={`whitespace-nowrap font-bold text-sm transition-all ${
                timeFilter === 'today'
                  ? 'bg-white text-black rounded-full px-4 py-1.5 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                  : 'bg-gray-900/40 border border-gray-800 text-gray-400 rounded-full px-4 py-1.5 hover:bg-gray-800/60'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeFilter('overall')}
              className={`whitespace-nowrap font-bold text-sm transition-all ${
                timeFilter === 'overall'
                  ? 'bg-white text-black rounded-full px-4 py-1.5 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                  : 'bg-gray-900/40 border border-gray-800 text-gray-400 rounded-full px-4 py-1.5 hover:bg-gray-800/60'
              }`}
            >
              Overall
            </button>
            <button
              onClick={() => setTimeFilter('custom')}
              className={`whitespace-nowrap font-bold text-sm transition-all ${
                timeFilter === 'custom'
                  ? 'bg-white text-black rounded-full px-4 py-1.5 shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                  : 'bg-gray-900/40 border border-gray-800 text-gray-400 rounded-full px-4 py-1.5 hover:bg-gray-800/60'
              }`}
            >
              Specific Date
            </button>
          </div>

          {timeFilter === 'custom' && (
            <div className="w-full sm:w-48 animate-in fade-in slide-in-from-top-2 duration-300">
              <TextInput
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Summary Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-6 md:mb-8">
        <StatCard label="Total Settlement" value={`₹${metrics.totalRevenue.toFixed(2)}`} color="#10b981" icon={Banknote} />
        <StatCard label="Dine-In Revenue" value={`₹${metrics.totalDineIn.toFixed(2)}`} color="#3b82f6" icon={Utensils} />
        <StatCard label="Takeaway Revenue" value={`₹${metrics.totalParcel.toFixed(2)}`} color="#f97316" icon={ShoppingBag} />
        <StatCard label="Cash Collection" value={`₹${metrics.totalCash.toFixed(2)}`} color="#10b981" icon={Wallet} />
        <StatCard label="UPI Collection" value={`₹${metrics.totalUpi.toFixed(2)}`} color="#6366f1" icon={CreditCard} />
        <StatCard label="Orders Finalized" value={metrics.totalOrders} color="#e2e8f0" icon={Receipt} />
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto mt-12">
          <span className="text-6xl mb-6 opacity-80">📋</span>
          <h3 className="text-2xl font-bold text-white mb-2">No Settlements Found</h3>
          <p className="text-slate-400 mb-6">There are no completed orders for the selected date.</p>
        </GlassCard>
      ) : (
        <>
          {/* Desktop Table View */}
          <GlassCard noPadding className="hidden md:block w-full max-w-full overflow-x-auto">
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
          </GlassCard>

        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col gap-3">
          {filteredOrders.map((order) => {
            const splits = getCashUpi(order);
            return (
              <div key={order.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden">
                {/* Top: Table Name + Time */}
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="font-bold text-white text-base">Table {order.tableNumber}</span>
                  <span className="text-xs text-white/50">{formatTime(order)}</span>
                </div>
                
                {/* Middle: Cash, UPI, Total Bill */}
                <div className="grid grid-cols-3 gap-1.5 text-center bg-black/20 rounded-lg p-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-white/40 tracking-wider mb-0.5">Cash</span>
                    <span className="font-mono text-emerald-400 font-medium text-xs">
                      {splits.cash > 0 ? `₹${splits.cash.toFixed(2)}` : "-"}
                    </span>
                  </div>
                  <div className="flex flex-col border-x border-white/5">
                    <span className="text-[10px] uppercase text-white/40 tracking-wider mb-0.5">UPI</span>
                    <span className="font-mono text-indigo-400 font-medium text-xs">
                      {splits.upi > 0 ? `₹${splits.upi.toFixed(2)}` : "-"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-white/40 tracking-wider mb-0.5">Total</span>
                    <span className="font-mono text-white font-bold text-xs">
                      ₹{Number(order.totalAmount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Bottom Right: Settled Badge */}
                <div className="flex justify-end mt-1">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Settled ✓
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </>
      )}
    </div>
  );
}

export default AdminBilling;
