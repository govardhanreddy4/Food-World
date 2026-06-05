import { collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";
import { db, COLLECTIONS } from "../firebase/firebaseConfig";

/**
 * runDatabasePruner
 * -----------------
 * 1. Aggregation Rule: Scans itemized orders for complete past calendar dates, 
 *    computes totals (revenue, orders, units, top items), and persists them 
 *    into the `daily_analytics_snapshots` collection.
 * 2. Pruning Rule: Deletes orders older than the custom retention threshold.
 */
export const runDatabasePruner = async (restaurantId, retentionDays) => {
  if (!restaurantId || !retentionDays || retentionDays <= 0) return;

  try {
    const ordersRef = collection(db, COLLECTIONS.ORDERS);
    const q = query(
      ordersRef,
      where("restaurantId", "==", restaurantId)
    );
    
    const snapshot = await getDocs(q);
    const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const thresholdTimestamp = now.getTime() - (retentionDays * 24 * 60 * 60 * 1000);

    const dailyAggregates = {};
    const ordersToDelete = [];

    orders.forEach(order => {
      // Find order timestamp
      let orderTime = 0;
      if (order.updatedAt?.toMillis) {
        orderTime = order.updatedAt.toMillis();
      } else if (order.updatedAt?.toDate) {
        orderTime = order.updatedAt.toDate().getTime();
      } else if (order.createdAt?.toMillis) {
        orderTime = order.createdAt.toMillis();
      } else if (order.createdAt?.toDate) {
        orderTime = order.createdAt.toDate().getTime();
      } else if (order.updatedAt) {
        orderTime = new Date(order.updatedAt).getTime();
      }
      
      if (orderTime === 0) return;

      // Explicit Safety Constraint: Only target documents that are confirmed settled/completed
      // Categories and Menu Items do not have these statuses, acting as a secondary firewall.
      const rawStatus = (order.status || "").toLowerCase();
      const isCompleted = order.active === false || rawStatus.includes("completed") || rawStatus.includes("settled");

      // Aggregation Rule: Aggregate completed orders from PAST dates
      if (isCompleted && orderTime < startOfToday) {
        const orderDateObj = new Date(orderTime);
        const year = orderDateObj.getFullYear();
        const month = String(orderDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(orderDateObj.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        if (!dailyAggregates[dateString]) {
          dailyAggregates[dateString] = {
            date: dateString,
            restaurantId,
            totalRevenue: 0,
            totalOrders: 0,
            totalUnitsSold: 0,
            topItemsMap: {}
          };
        }

        const agg = dailyAggregates[dateString];
        agg.totalOrders += 1;
        agg.totalRevenue += Number(order.totalAmount || 0);

        const batches = order.orderBatches || [];
        batches.forEach(batch => {
          const items = batch.items || [];
          items.forEach(item => {
            const qty = Number(item.quantity) || 1;
            const price = Number(item.price) || 0;
            agg.totalUnitsSold += qty;

            if (agg.topItemsMap[item.name]) {
              agg.topItemsMap[item.name].count += qty;
              agg.topItemsMap[item.name].revenue += (qty * price);
            } else {
              agg.topItemsMap[item.name] = { count: qty, revenue: (qty * price), price };
            }
          });
        });
      }

      // Pruning Rule: if order is older than thresholdTimestamp AND explicitly completed, queue for deletion
      if (orderTime < thresholdTimestamp && isCompleted) {
        ordersToDelete.push(order.id);
      }
    });

    // We will use multiple batches if necessary since Firestore limits batches to 500 operations
    let batch = writeBatch(db);
    let batchCount = 0;

    // 1. Save Aggregates
    for (const [dateString, agg] of Object.entries(dailyAggregates)) {
      const topItemsArray = Object.entries(agg.topItemsMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50); // Keep top 50 items per day to prevent document size explosion

      const snapshotData = {
        date: agg.date,
        restaurantId: agg.restaurantId,
        totalRevenue: agg.totalRevenue,
        totalOrders: agg.totalOrders,
        totalUnitsSold: agg.totalUnitsSold,
        topItems: topItemsArray,
        updatedAt: new Date().toISOString()
      };

      const docRef = doc(db, COLLECTIONS.DAILY_SNAPSHOTS, `${restaurantId}_${dateString}`);
      batch.set(docRef, snapshotData, { merge: true });
      batchCount++;
      
      if (batchCount === 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    // 2. Process Deletions
    if (ordersToDelete.length > 0) {
      console.log("🧹 Retention Policy: Purging old itemized billing history records older than threshold...");
    }
    for (const orderId of ordersToDelete) {
      // Strict Collection Isolation: Hardcoded targeting only COLLECTIONS.ORDERS
      const docRef = doc(db, COLLECTIONS.ORDERS, orderId);
      batch.delete(docRef);
      batchCount++;
      
      if (batchCount === 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`Database Pruner complete: Saved ${Object.keys(dailyAggregates).length} snapshots, Deleted ${ordersToDelete.length} old orders.`);
  } catch (err) {
    console.error("Failed to run database pruner:", err);
  }
};
