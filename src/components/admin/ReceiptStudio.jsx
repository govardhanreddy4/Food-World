import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { PageHeader, GlassCard, PrimaryButton } from "./AdminUI";
import { Settings2, Save, Printer, FileText, Loader2, Check } from "lucide-react";

export default function ReceiptStudio() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [settings, setSettings] = useState({
    kot: {
      includeHeader: true,
      showTimestamps: true,
      largeTableNumbers: true,
      includeBatchNumber: true,
    },
    customer: {
      restaurantTitle: "FOOD WORLD",
      footnoteGreeting: "Thank you! Visit Again",
      includeTotalItemCount: true,
      showCategoryLabels: false,
      doubleHeightTotals: true,
    }
  });

  useEffect(() => {
    async function loadSettings() {
      if (!currentUser?.uid) return;
      try {
        const docRef = doc(db, COLLECTIONS.SETTINGS, currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().receiptStudio) {
          // Merge with defaults
          setSettings(prev => ({
            kot: { ...prev.kot, ...docSnap.data().receiptStudio.kot },
            customer: { ...prev.customer, ...docSnap.data().receiptStudio.customer }
          }));
        }
      } catch (err) {
        console.error("Failed to load receipt settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [currentUser]);

  const handleSave = async () => {
    if (!currentUser?.uid) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const docRef = doc(db, COLLECTIONS.SETTINGS, currentUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        await updateDoc(docRef, { receiptStudio: settings, updatedAt: serverTimestamp() });
      } else {
        await setDoc(docRef, { receiptStudio: settings, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Update local storage so it acts as fallback
      localStorage.setItem('restaurant_name', settings.customer.restaurantTitle);
    } catch (err) {
      console.error("Failed to save receipt settings:", err);
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleKotChange = (key) => {
    setSettings(s => ({ ...s, kot: { ...s.kot, [key]: !s.kot[key] } }));
  };

  const handleCustomerChange = (key) => {
    setSettings(s => ({ ...s, customer: { ...s.customer, [key]: !s.customer[key] } }));
  };

  const handleCustomerText = (key, value) => {
    setSettings(s => ({ ...s, customer: { ...s.customer, [key]: value } }));
  };

  if (loading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 min-w-0 w-full overflow-y-auto" style={{ background: "#0B0F19", minHeight: "100vh" }}>
      <div className="flex items-center justify-between mb-6">
        <PageHeader 
          title="Receipt Studio" 
          subtitle="Configure thermal printer formatting and rules" 
        />
        <PrimaryButton onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 size={16} className="animate-spin" /> : (saveSuccess ? <Check size={16} /> : <Save size={16} />)}
          {saving ? "Saving..." : (saveSuccess ? "Saved!" : "Save Changes")}
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KOT Configuration Panel */}
        <GlassCard className="border-t-4 border-t-orange-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Printer className="text-orange-400" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Staff / KOT Receipts</h2>
              <p className="text-white/40 text-xs">Kitchen Order Ticket format for chefs</p>
            </div>
          </div>

          <div className="space-y-4">
            <ToggleOption 
              label="Include Header Text" 
              description="Print 'KITCHEN ORDER TICKET' at the top"
              checked={settings.kot.includeHeader}
              onChange={() => handleKotChange('includeHeader')}
            />
            <ToggleOption 
              label="Show Timestamps" 
              description="Print the exact time the order was placed"
              checked={settings.kot.showTimestamps}
              onChange={() => handleKotChange('showTimestamps')}
            />
            <ToggleOption 
              label="Print Large Table Numbers" 
              description="Use Double Width/Height font for table numbers (easier to read)"
              checked={settings.kot.largeTableNumbers}
              onChange={() => handleKotChange('largeTableNumbers')}
            />
            <ToggleOption 
              label="Include Batch Number" 
              description="Show 'Batch 1', 'Batch 2' to distinguish repeated orders"
              checked={settings.kot.includeBatchNumber}
              onChange={() => handleKotChange('includeBatchNumber')}
            />
          </div>
        </GlassCard>

        {/* Customer Receipt Configuration Panel */}
        <GlassCard className="border-t-4 border-t-indigo-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <FileText className="text-indigo-400" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Customer Receipts</h2>
              <p className="text-white/40 text-xs">Final billing receipt format for guests</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-white/70 text-sm font-semibold mb-2">Restaurant Title Header</label>
              <input 
                type="text" 
                value={settings.customer.restaurantTitle}
                onChange={(e) => handleCustomerText('restaurantTitle', e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. FOOD WORLD"
              />
            </div>
            
            <div>
              <label className="block text-white/70 text-sm font-semibold mb-2">Footnote Greeting Message</label>
              <input 
                type="text" 
                value={settings.customer.footnoteGreeting}
                onChange={(e) => handleCustomerText('footnoteGreeting', e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. Thank you! Visit Again"
              />
            </div>

            <div className="space-y-4 pt-2">
              <ToggleOption 
                label="Include Total Item Count" 
                description="Print the total number of items ordered above the total amount"
                checked={settings.customer.includeTotalItemCount}
                onChange={() => handleCustomerChange('includeTotalItemCount')}
              />
              <ToggleOption 
                label="Show Individual Item Category Labels" 
                description="Group or display category tags next to items (if available)"
                checked={settings.customer.showCategoryLabels}
                onChange={() => handleCustomerChange('showCategoryLabels')}
              />
              <ToggleOption 
                label="Double-Height Font for Totals" 
                description="Make the final bill amount larger and more prominent"
                checked={settings.customer.doubleHeightTotals}
                onChange={() => handleCustomerChange('doubleHeightTotals')}
              />
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function ToggleOption({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={onChange}>
      <div className="pr-4">
        <p className="text-white font-semibold text-sm">{label}</p>
        <p className="text-white/40 text-xs mt-1">{description}</p>
      </div>
      <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-indigo-500' : 'bg-gray-600'}`}>
        <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </div>
  );
}
