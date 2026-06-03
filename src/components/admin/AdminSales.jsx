import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import {
  TrendingUp,
  Receipt,
  Banknote,
  UtensilsCrossed,
  Trophy,
} from "lucide-react";

function AdminSales() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // ─── Real-time Data Fetching ─────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      where("restaurantId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedOrders = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setOrders(fetchedOrders);
        setLoading(false);
      },
      (err) => {
        console.error("Sales data listener error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // ─── Metrics Calculation ─────────────────────────────────────────────
  const completedOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return orders.filter((o) => {
      const isCompleted = o.active === false || (o.status || "").toLowerCase() === "completed/paid";
      if (!isCompleted) return false;

      // Extract timestamp to determine if order is from today
      let orderTime = 0;
      if (o.updatedAt && typeof o.updatedAt.toDate === "function") {
        orderTime = o.updatedAt.toDate().getTime();
      } else if (o.createdAt && typeof o.createdAt.toDate === "function") {
        orderTime = o.createdAt.toDate().getTime();
      } else if (o.updatedAt) {
        orderTime = new Date(o.updatedAt).getTime();
      }

      // Filter: only keep if the order time is strictly >= midnight today
      if (orderTime > 0) {
        return orderTime >= startOfToday;
      }

      // Fallback if no timestamp exists
      return false;
    });
  }, [orders]);

  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalOrders = completedOrders.length;

    completedOrders.forEach((order) => {
      totalRevenue += Number(order.totalAmount || 0);
    });

    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return { totalRevenue, totalOrders, averageOrderValue };
  }, [completedOrders]);

  // ─── Top-Selling Items Engine ────────────────────────────────────────
  const topItems = useMemo(() => {
    const itemMap = new Map(); // name -> { count, revenue, price }

    completedOrders.forEach((order) => {
      const batches = order.orderBatches || [];
      batches.forEach((batch) => {
        const items = batch.items || [];
        items.forEach((item) => {
          const qty = Number(item.quantity) || 1;
          const price = Number(item.price) || 0;
          const rev = qty * price;

          if (itemMap.has(item.name)) {
            const existing = itemMap.get(item.name);
            existing.count += qty;
            existing.revenue += rev;
          } else {
            itemMap.set(item.name, { count: qty, revenue: rev, price });
          }
        });
      });
    });

    // Convert map to array and sort by count descending
    return Array.from(itemMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 items
  }, [completedOrders]);

  // ─── UI Rendering ──────────────────────────────────────────────────
  const glassCard = {
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(16px)",
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "#0B0F19" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
          style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
        >
          <TrendingUp size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Sales Performance</h1>
          <p className="text-white/40 text-sm">Real-time revenue & insights from completed orders</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : completedOrders.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center p-12 rounded-2xl text-center max-w-2xl mx-auto mt-12"
          style={glassCard}
        >
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
            <TrendingUp size={36} className="text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No sales data available yet</h3>
          <p className="text-sm text-slate-400">
            Completed and paid orders will automatically generate your revenue metrics here in real time.
          </p>
        </div>
      ) : (
        <div className="max-w-6xl">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="rounded-2xl p-5" style={glassCard}>
              <div className="flex items-start justify-between mb-4">
                <p className="text-white/50 text-sm font-medium uppercase tracking-wider">Total Revenue</p>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Banknote size={20} />
                </div>
              </div>
              <h2 className="text-white text-3xl font-bold">₹{metrics.totalRevenue.toFixed(0)}</h2>
            </div>

            <div className="rounded-2xl p-5" style={glassCard}>
              <div className="flex items-start justify-between mb-4">
                <p className="text-white/50 text-sm font-medium uppercase tracking-wider">Total Orders</p>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Receipt size={20} />
                </div>
              </div>
              <h2 className="text-white text-3xl font-bold">{metrics.totalOrders}</h2>
            </div>

            <div className="rounded-2xl p-5" style={glassCard}>
              <div className="flex items-start justify-between mb-4">
                <p className="text-white/50 text-sm font-medium uppercase tracking-wider">Average Order Value</p>
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <TrendingUp size={20} />
                </div>
              </div>
              <h2 className="text-white text-3xl font-bold">₹{metrics.averageOrderValue.toFixed(0)}</h2>
            </div>
          </div>

          {/* Top-Selling Items */}
          <div className="rounded-2xl overflow-hidden" style={glassCard}>
            <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center gap-3">
              <Trophy size={18} className="text-amber-400" />
              <h3 className="text-white font-semibold">Top-Selling Items</h3>
            </div>
            
            {topItems.length === 0 ? (
              <div className="p-8 text-center text-white/30">
                <UtensilsCrossed size={32} className="mx-auto mb-3 opacity-20" />
                No items have been ordered yet.
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-left min-w-[600px]">
                  <thead>
                    <tr className="text-white/40 text-xs uppercase tracking-wider bg-white/5">
                      <th className="py-3 px-5 font-medium">Rank</th>
                      <th className="py-3 px-5 font-medium">Item Name</th>
                      <th className="py-3 px-5 font-medium text-right">Units Sold</th>
                      <th className="py-3 px-5 font-medium text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {topItems.map((item, idx) => (
                      <tr key={item.name} className="hover:bg-white/5 transition-colors group">
                        <td className="py-4 px-5">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            idx === 0 ? "bg-amber-400/20 text-amber-400" :
                            idx === 1 ? "bg-slate-300/20 text-slate-300" :
                            idx === 2 ? "bg-orange-400/20 text-orange-400" :
                            "bg-white/5 text-white/40"
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-4 px-5 font-bold text-white">
                          {item.name}
                        </td>
                        <td className="py-4 px-5 text-right font-mono text-white/60">
                          {item.count}
                        </td>
                        <td className="py-4 px-5 text-right font-mono text-white font-bold">
                          ₹{item.revenue.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSales;
