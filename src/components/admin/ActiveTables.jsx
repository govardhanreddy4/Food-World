import React, { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { Clock, Printer, Trash2, X, Utensils } from "lucide-react";
import { printOrderToken } from "../../utils/thermalPrinter";
import { PageHeader, Toast } from "./AdminUI";
import { useElapsedTimer } from "../../hooks/useElapsedTimer";

// Reusable timer for occupied table
function TableTimer({ timestamp }) {
  const { elapsed } = useElapsedTimer(timestamp);
  return (
    <div className="flex items-center gap-1.5 text-white/70 text-xs font-mono bg-black/20 px-2 py-1 rounded-md">
      <Clock size={12} />
      <span>{elapsed}</span>
    </div>
  );
}

const TOTAL_TABLES = 12;

function ActiveTables() {
  const { currentUser } = useAuth();
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [printStatuses, setPrintStatuses] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '' });

  const showToast = (message) => {
    setToast({ visible: true, message });
    setTimeout(() => setToast({ visible: false, message: '' }), 5000);
  };

  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      where("restaurantId", "==", currentUser.uid),
      where("active", "==", true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setActiveOrders(orders);
      setLoading(false);
      
      // Update selected order if modal is open
      setSelectedOrder(prev => {
        if (!prev) return null;
        const updated = orders.find(o => o.id === prev.id);
        return updated || null; // Will close modal if deleted
      });
    });

    const unsubSettings = onSnapshot(doc(db, COLLECTIONS.SETTINGS, currentUser.uid), (snap) => {
      if (snap.exists() && snap.data().receiptStudio) {
        setReceiptSettings(snap.data().receiptStudio);
      }
    });

    return () => {
      unsub();
      unsubSettings();
    };
  }, [currentUser?.uid]);

  const handlePrint = async (order) => {
    if (receiptSettings?.hardware?.isCustomerHardwareOn === false) {
      showToast(`Billing print bypassed via hardware settings.`);
      return;
    }

    setPrintStatuses(prev => ({ ...prev, [order.id]: { printing: true, success: false, target: '' } }));
    const restaurantName = localStorage.getItem('restaurant_name') || 'FOOD WORLD';
    try {
      const result = await printOrderToken(order, restaurantName, null, receiptSettings);
      
      if (result.success && !result.bypassed) {
        setPrintStatuses(prev => ({ ...prev, [order.id]: { printing: false, success: true, target: 'Billing' } }));
        showToast(`💰 Invoice for Table ${order.tableNumber} successfully printed at Billing Desk.`);
        setTimeout(() => {
          setPrintStatuses(prev => { const next = { ...prev }; delete next[order.id]; return next; });
        }, 3000);
      } else {
        setPrintStatuses(prev => { const next = { ...prev }; delete next[order.id]; return next; });
        if (!result.success && !result.cancelled) alert(`Print failed: ${result.error}`);
      }
    } catch (err) {
      setPrintStatuses(prev => { const next = { ...prev }; delete next[order.id]; return next; });
      alert(`Print error: ${err.message}`);
    }
  };

  const handleClearTable = async (order) => {
    if (!window.confirm(`Are you sure you want to clear Table ${order.tableNumber}'s active order? This will permanently delete the current session.`)) {
      return;
    }
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS.ORDERS, order.id));
      setSelectedOrder(null);
    } catch (error) {
      console.error("Failed to clear table:", error);
      alert("Failed to clear table.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Generate table array (1-12)
  const tables = Array.from({ length: TOTAL_TABLES }, (_, i) => i + 1);

  return (
    <>
    <Toast message={toast.message} visible={toast.visible} onClose={() => setToast({ visible: false, message: '' })} />
    <div className="flex-1 p-4 md:p-6 min-w-0 w-full overflow-y-auto" style={{ background: "#0B0F19", minHeight: "100vh" }}>
      <PageHeader 
        title="Restaurant Floor" 
        subtitle="Live table occupancy grid" 
      />
      
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 mt-6">
          {tables.map(tableNo => {
            const order = activeOrders.find(o => String(o.tableNumber) === String(tableNo) && String(o.fulfillmentType).toLowerCase() !== 'parcel');
            
            if (order) {
              // Occupied Table
              const firstBatchTimestamp = order.orderBatches?.[0]?.timestamp;
              const oPStatus = printStatuses[order.id];
              const glow = oPStatus?.success ? "border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)] bg-green-500/10" : "";

              return (
                <button
                  key={tableNo}
                  onClick={() => setSelectedOrder(order)}
                  className={`relative flex flex-col items-center justify-center p-5 rounded-3xl transition-all duration-300 hover:scale-105 active:scale-95 text-left border shadow-2xl ${glow}`}
                  style={!glow ? {
                    background: "linear-gradient(145deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.2) 100%)",
                    borderColor: "rgba(139,92,246,0.3)",
                    boxShadow: "0 10px 30px -10px rgba(139,92,246,0.3)"
                  } : {}}
                >
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 flex items-center gap-1 shadow-md shadow-fuchsia-900/20">
                      <Utensils size={10} /> Occupied
                    </span>
                  </div>
                  
                  <h3 className="text-white text-4xl font-black mt-4 mb-1">T{tableNo}</h3>
                  <p className="text-white font-bold text-lg mb-3">₹{Number(order.totalAmount || 0).toFixed(2)}</p>
                  
                  <TableTimer timestamp={firstBatchTimestamp || order.createdAt} />
                </button>
              );
            } else {
              // Available Table
              return (
                <div
                  key={tableNo}
                  className="relative flex flex-col items-center justify-center p-5 rounded-3xl text-left border transition-all"
                  style={{
                    background: "rgba(17, 24, 39, 0.4)",
                    borderColor: "rgba(75, 85, 99, 0.4)", // Gray-600/40
                  }}
                >
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-gray-500/10 text-gray-400 border border-gray-500/20">
                      Available
                    </span>
                  </div>
                  <h3 className="text-white/20 text-4xl font-black mt-4 mb-2">T{tableNo}</h3>
                  <p className="text-white/10 font-medium text-xs">No active orders</p>
                </div>
              );
            }
          })}
        </div>
      )}

      {/* Slide-out Order Details Drawer / Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full sm:max-w-md h-[85vh] sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300" 
            style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 bg-black/20 border-b border-white/5">
              <div>
                <h2 className="text-xl font-black text-white">Table {selectedOrder.tableNumber}</h2>
                <p className="text-indigo-400 font-semibold text-sm">₹{Number(selectedOrder.totalAmount || 0).toFixed(2)} Total</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Items List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {selectedOrder.orderBatches?.map((batch, bIdx) => (
                <div key={bIdx} className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <p className="text-white/40 font-mono text-[10px] uppercase tracking-wider mb-3">Batch {bIdx + 1}</p>
                  <div className="space-y-3">
                    {batch.items?.map((item, i) => (
                      <div key={i} className="flex justify-between items-start">
                        <div className="flex gap-2 text-sm text-white/90">
                          <span className="font-bold text-white/50">{item.quantity}x</span>
                          <span className="font-medium">{item.name}</span>
                        </div>
                        <span className="text-white/50 text-xs font-semibold">₹{(item.price * item.quantity).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                  {batch.notes && (
                    <div className="mt-3 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-200 text-xs italic">
                      📝 {batch.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Footer */}
            <div className="p-5 bg-black/40 border-t border-white/5 flex flex-col gap-3">
              <button
                onClick={() => handlePrint(selectedOrder)}
                disabled={printStatuses[selectedOrder.id]?.printing}
                className="w-full py-3.5 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
              >
                <Printer size={18} />
                {printStatuses[selectedOrder.id]?.printing ? "Sending to Hardware..." : "Print Billing Receipt"}
              </button>
              
              <button
                onClick={() => handleClearTable(selectedOrder)}
                disabled={isDeleting}
                className="w-full py-3.5 rounded-xl font-bold text-red-50 transition-all hover:bg-red-500 disabled:opacity-50 flex items-center justify-center gap-2 border border-red-500/30 bg-red-500/20"
              >
                <Trash2 size={18} />
                {isDeleting ? "Clearing Table..." : "Clear / Reset Table"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default ActiveTables;
