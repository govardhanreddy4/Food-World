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
import { PageHeader, FilterTabs, StatCard, GlassCard, TextInput } from "./AdminUI";

function AdminSales() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState("Overall"); // "Overall", "Today", "Specific Date"
  const [specificDate, setSpecificDate] = useState("");

  // ─── Real-time Data Fetching ─────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid) return;

    const qOrders = query(
      collection(db, COLLECTIONS.ORDERS),
      where("restaurantId", "==", currentUser.uid)
    );

    const qSnapshots = query(
      collection(db, COLLECTIONS.DAILY_SNAPSHOTS),
      where("restaurantId", "==", currentUser.uid)
    );

    const unsubOrders = onSnapshot(
      qOrders,
      (snapshot) => {
        const fetchedOrders = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setOrders(fetchedOrders);
        setLoading(false);
      },
      (err) => {
        console.error("Orders listener error:", err);
        setLoading(false);
      }
    );

    const unsubSnapshots = onSnapshot(
      qSnapshots,
      (snapshot) => {
        const fetchedSnapshots = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setSnapshots(fetchedSnapshots);
      },
      (err) => console.error("Snapshots listener error:", err)
    );

    return () => {
      unsubOrders();
      unsubSnapshots();
    };
  }, [currentUser?.uid]);

  // ─── Metrics Calculation ─────────────────────────────────────────────
  const matchedSnapshots = useMemo(() => {
    if (timeFilter === "Overall") return snapshots;

    if (timeFilter === "Today") {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      return snapshots.filter((s) => s.date === todayStr);
    }

    if (timeFilter === "Specific Date" && specificDate) {
      return snapshots.filter((s) => s.date === specificDate);
    }

    return [];
  }, [snapshots, timeFilter, specificDate]);

  const completedOrders = useMemo(() => {
    const snapshotDates = new Set(matchedSnapshots.map(s => s.date));

    return orders.filter((o) => {
      const isCompleted = o.active === false || (o.status || "").toLowerCase() === "completed/paid";
      if (!isCompleted) return false;

      if (timeFilter === "Overall") return true;

      // Extract timestamp
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
      
      if (orderTime === 0) return false;

      if (timeFilter === "Today") {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return orderTime >= startOfToday;
      }

      if (timeFilter === "Specific Date" && specificDate) {
        const [year, month, day] = specificDate.split("-").map(Number);
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
        return orderTime >= startOfDay && orderTime <= endOfDay;
      }

      // Ignore orders that fall into a date already covered by matchedSnapshots
      // to avoid double counting
      const d = new Date(orderTime);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (snapshotDates.has(ds)) return false;

      return true; // Fallback if no date selected
    });
  }, [orders, timeFilter, specificDate, matchedSnapshots]);

  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalOrders = completedOrders.length;
    let totalUnitsSold = 0;

    completedOrders.forEach((order) => {
      totalRevenue += Number(order.totalAmount || 0);

      const batches = order.orderBatches || [];
      batches.forEach((batch) => {
        const items = batch.items || [];
        items.forEach((item) => {
          totalUnitsSold += Number(item.quantity) || 1;
        });
      });
    });

    matchedSnapshots.forEach((snap) => {
      totalRevenue += snap.totalRevenue || 0;
      totalOrders += snap.totalOrders || 0;
      totalUnitsSold += snap.totalUnitsSold || 0;
    });

    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return { totalRevenue, totalOrders, averageOrderValue, totalUnitsSold };
  }, [completedOrders, matchedSnapshots]);

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

    matchedSnapshots.forEach((snap) => {
      const items = snap.topItems || [];
      items.forEach((item) => {
        const qty = item.count || 0;
        const rev = item.revenue || 0;
        const price = item.price || 0;
        if (itemMap.has(item.name)) {
          const existing = itemMap.get(item.name);
          existing.count += qty;
          existing.revenue += rev;
        } else {
          itemMap.set(item.name, { count: qty, revenue: rev, price });
        }
      });
    });

    // Convert map to array and sort by count descending
    return Array.from(itemMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 items
  }, [completedOrders, matchedSnapshots]);

  // ─── UI Rendering ──────────────────────────────────────────────────
  const glassCard = {
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(16px)",
  };

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#0B0F19" }}>
      {/* Header */}
      <PageHeader
        title="Sales Performance"
        subtitle="Real-time revenue & insights from completed orders"
        rightContent={
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/20 border border-emerald-500/30">
            <TrendingUp size={20} className="text-emerald-400" />
          </div>
        }
      />

      {/* Time Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4 mb-5 md:mb-8">
        <FilterTabs 
          tabs={["Overall", "Today", "Specific Date"]} 
          activeTab={timeFilter} 
          onChange={setTimeFilter} 
        />
        {timeFilter === "Specific Date" && (
          <div className="w-48">
            <TextInput 
              type="date" 
              value={specificDate} 
              onChange={(e) => setSpecificDate(e.target.value)} 
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (completedOrders.length === 0 && matchedSnapshots.length === 0) ? (
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
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5 md:mb-8">
            <StatCard label="Total Revenue" value={`₹${metrics.totalRevenue.toFixed(0)}`} color="#10b981" icon={Banknote} />
            <StatCard label="Total Orders" value={metrics.totalOrders} color="#3b82f6" icon={Receipt} />
            <StatCard label="Total Units" value={metrics.totalUnitsSold} color="#f97316" icon={UtensilsCrossed} />
            <StatCard label="Average Value" value={`₹${metrics.averageOrderValue.toFixed(0)}`} color="#a855f7" icon={TrendingUp} />
          </div>

          {/* Top-Selling Items */}
          <GlassCard noPadding className="overflow-hidden">
            <div className="p-3 md:p-5 border-b border-white/5 bg-white/[0.02] flex items-center gap-2 md:gap-3">
              <Trophy size={16} md:size={18} className="text-amber-400" />
              <h3 className="text-white font-semibold text-xs md:text-base">Top-Selling Items</h3>
            </div>
            
            {topItems.length === 0 ? (
              <div className="p-8 text-center text-white/30">
                <UtensilsCrossed size={32} className="mx-auto mb-3 opacity-20" />
                No items have been ordered yet.
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden sm:block w-full max-w-full overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left min-w-[800px]">
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

              {/* Mobile Card View */}
              <div className="sm:hidden flex flex-col gap-2 p-2 md:p-3">
                {topItems.map((item, idx) => (
                  <div key={item.name} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2 md:gap-3">
                    {/* Top: Rank & Item Name */}
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <span className={`inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full text-[10px] md:text-xs font-bold ${
                        idx === 0 ? "bg-amber-400/20 text-amber-400" :
                        idx === 1 ? "bg-slate-300/20 text-slate-300" :
                        idx === 2 ? "bg-orange-400/20 text-orange-400" :
                        "bg-white/10 text-white/40"
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="font-bold text-white text-sm md:text-base">{item.name}</span>
                    </div>
                    {/* Bottom: Dual-column split */}
                    <div className="flex justify-between items-center bg-black/20 rounded-lg p-2 md:p-3">
                      <div className="flex flex-col">
                        <span className="text-[9px] md:text-[10px] uppercase text-white/40 tracking-wider mb-0.5">Units Sold</span>
                        <span className="font-mono text-white/80 text-sm md:text-base font-semibold">{item.count}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] md:text-[10px] uppercase text-white/40 tracking-wider mb-0.5">Total Revenue</span>
                        <span className="font-mono text-white font-bold text-emerald-400 text-sm md:text-base">₹{item.revenue.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}

export default AdminSales;
