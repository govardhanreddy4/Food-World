import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc, writeBatch, collection, getDocs, query, where } from "firebase/firestore";
import { reauthenticateWithPopup } from "firebase/auth";
import { db, COLLECTIONS, auth, googleProvider } from "../../firebase/firebaseConfig";
import { compressAudio } from "../../utils/audioCompression";
import { saveAudioToLocalDB, getAudioFromLocalDB } from "../../utils/audioStorage";
import { useAuth } from "../../context/AuthContext";
import {
  Settings as SettingsIcon,
  Bell,
  UtensilsCrossed,
  Upload,
  Play,
  Square,
  Volume2,
  AlertTriangle,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { PageHeader, GlassCard, TextInput, PrimaryButton } from "./AdminUI";

const defaultSettings = {
  orderAlert: { audioUrl: "", duration: 15 },
  customerAlert: { audioUrl: "", duration: 15 },
  retentionDays: 30
};

function AdminSettings() {
  const { currentUser } = useAuth();
  
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  
  const [restaurantName, setRestaurantName] = useState(() => localStorage.getItem("restaurant_name") || "");
  
  const orderFileInputRef = useRef(null);
  const customerFileInputRef = useRef(null);

  const [uploadingOrder, setUploadingOrder] = useState(false);
  const [uploadingCustomer, setUploadingCustomer] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [playingOrder, setPlayingOrder] = useState(false);
  const [playingCustomer, setPlayingCustomer] = useState(false);
  
  const [uploadSuccessOrder, setUploadSuccessOrder] = useState(false);
  const [uploadSuccessCustomer, setUploadSuccessCustomer] = useState(false);

  const audioRefOrder = useRef(null);
  const audioRefCustomer = useRef(null);

  const [retentionDaysInput, setRetentionDaysInput] = useState(30);

  // ─── Purge State ────────────────────────────────────────────
  const [purgeOptions, setPurgeOptions] = useState({
    pendingOrders: false,
    completedOrders: false,
    salesAnalytics: false,
    activeTables: false,
    menuCategories: false,
  });
  const [isPurging, setIsPurging] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  // Sync retentionDays input when settings load
  useEffect(() => {
    if (settings.retentionDays !== undefined) {
      setRetentionDaysInput(settings.retentionDays);
    }
  }, [settings.retentionDays]);

  const handleSaveRetentionPolicy = async () => {
    const parsed = parseInt(retentionDaysInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      try {
        const updated = {
          ...settings,
          retentionDays: parsed
        };
        setSettings(updated);
        await setDoc(doc(db, COLLECTIONS.SETTINGS, currentUser.uid), updated, { merge: true });
        alert("Retention Policy Saved!");
      } catch (err) {
        console.error("Failed to save retention policy:", err);
      }
    } else {
      alert("Please enter a valid positive number for retention days.");
    }
  };

  // ─── Fetch Settings ─────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid) return;
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, COLLECTIONS.SETTINGS, currentUser.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSettings(prev => ({ ...prev, ...snap.data() }));
        }
      } catch (e) {
        console.error("Error fetching settings:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [currentUser?.uid]);

  // ─── Save Settings ──────────────────────────────────────────
  const saveSettings = async (newSettings) => {
    if (!currentUser?.uid) return;
    try {
      const docRef = doc(db, COLLECTIONS.SETTINGS, currentUser.uid);
      await setDoc(docRef, newSettings, { merge: true });
    } catch (e) {
      console.error("Error saving settings:", e);
    }
  };

  // ─── Execute Purge Logic ────────────────────────────────────
  const handleExecutePurge = async () => {
    if (!currentUser?.uid) return;
    const hasSelection = Object.values(purgeOptions).some(Boolean);
    if (!hasSelection) return;

    const proceed = window.confirm("WARNING: This will permanently delete the selected data from Firestore. This action CANNOT be undone. Proceed?");
    if (!proceed) return;

    const confirmText = window.prompt("Type 'PURGE' to confirm permanent deletion:");
    if (confirmText !== "PURGE") {
      alert("Purge aborted: Confirmation text did not match 'PURGE'.");
      return;
    }

    setIsPurging(true);
    try {
      const batch = writeBatch(db);
      
      if (purgeOptions.pendingOrders) {
        const qPending = query(
          collection(db, COLLECTIONS.ORDERS),
          where("adminEmail", "==", currentUser.email),
          where("status", "in", ["pending", "preparing"])
        );
        const snapPending = await getDocs(qPending);
        snapPending.forEach(d => batch.delete(d.ref));
      }

      if (purgeOptions.completedOrders) {
        const qCompleted = query(
          collection(db, COLLECTIONS.ORDERS),
          where("adminEmail", "==", currentUser.email),
          where("status", "in", ["served", "completed"])
        );
        const snapCompleted = await getDocs(qCompleted);
        snapCompleted.forEach(d => batch.delete(d.ref));
      }

      if (purgeOptions.salesAnalytics) {
        const qDaily = query(
          collection(db, COLLECTIONS.DAILY_SNAPSHOTS),
          where("adminEmail", "==", currentUser.email)
        );
        const snapDaily = await getDocs(qDaily);
        snapDaily.forEach(d => batch.delete(d.ref));
        
        const qWaiter = query(
          collection(db, COLLECTIONS.WAITER_CALLS),
          where("adminEmail", "==", currentUser.email)
        );
        const snapWaiter = await getDocs(qWaiter);
        snapWaiter.forEach(d => batch.delete(d.ref));
      }

      if (purgeOptions.activeTables) {
        const qActive = query(
          collection(db, COLLECTIONS.ORDERS),
          where("adminEmail", "==", currentUser.email),
          where("active", "==", true)
        );
        const snapActive = await getDocs(qActive);
        snapActive.forEach(d => batch.delete(d.ref));
      }

      if (purgeOptions.menuCategories) {
        const qMenu = query(
          collection(db, COLLECTIONS.MENU_ITEMS),
          where("adminEmail", "==", currentUser.email)
        );
        const snapMenu = await getDocs(qMenu);
        snapMenu.forEach(d => batch.delete(d.ref));

        const qCat = query(
          collection(db, COLLECTIONS.CATEGORIES),
          where("adminEmail", "==", currentUser.email)
        );
        const snapCat = await getDocs(qCat);
        snapCat.forEach(d => batch.delete(d.ref));
      }

      await batch.commit();

      setPurgeOptions({
        pendingOrders: false,
        completedOrders: false,
        salesAnalytics: false,
        activeTables: false,
        menuCategories: false,
      });

      alert("Selected collections successfully purged!");
    } catch (err) {
      console.error("Purge operation failed:", err);
      alert("Error: Purge operation failed.");
    } finally {
      setIsPurging(false);
    }
  };

  // ─── Execute Factory Reset (Complete Wipe) ──────────────────
  const handleFactoryReset = async () => {
    if (!currentUser?.uid) return;
    
    const proceed = window.confirm("☢️ CAUTION: You are about to initiate a COMPLETE FACTORY RESET. This will permanently wipe all orders, menus, categories, and settings from the entire database.\n\nAre you 100% sure you want to do this?");
    if (!proceed) return;

    setIsWiping(true);
    try {
      // Re-authenticate user via Google Popup as OTP/2FA verification
      const user = auth.currentUser;
      if (!user) throw new Error("No authenticated user found for re-authentication.");
      
      await reauthenticateWithPopup(user, googleProvider);

      const batch = writeBatch(db);
      
      // We will loop through all collections and delete every document
      const collectionsToWipe = [
        COLLECTIONS.ORDERS,
        COLLECTIONS.MENU_ITEMS,
        COLLECTIONS.CATEGORIES,
        COLLECTIONS.WAITER_CALLS,
        COLLECTIONS.SETTINGS,
        COLLECTIONS.DAILY_SNAPSHOTS
      ];

      for (const colName of collectionsToWipe) {
        if (!colName) continue;
        const snap = await getDocs(collection(db, colName));
        snap.forEach(docSnap => batch.delete(docSnap.ref));
      }

      await batch.commit();

      alert("☢️ FACTORY RESET COMPLETE. All data has been purged. The application will now reload.");
      window.location.reload();
      
    } catch (err) {
      console.error("Factory reset failed or was cancelled:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        alert("Verification cancelled. The database was NOT wiped.");
      } else {
        alert("Failed to verify or wipe database. Check console for details.");
      }
    } finally {
      setIsWiping(false);
    }
  };

  const handleSaveRestaurantName = () => {
    localStorage.setItem("restaurant_name", restaurantName);
  };

  const updateField = async (type, field, value) => {
    try {
      const updated = {
        ...settings,
        [type]: { ...settings[type], [field]: value }
      };
      // If we are setting a localDB audio, also set the flat flag requested by the user
      if (field === "audioUrl" && value.startsWith("localDB:")) {
        updated[`${type}AudioUrl`] = "localDB";
      }
      setSettings(updated);
      await setDoc(doc(db, COLLECTIONS.SETTINGS, currentUser.uid), updated, { merge: true });
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  const triggerOrderUpload = () => {
    try {
      setUploadError("");
      if (orderFileInputRef.current) {
        orderFileInputRef.current.click();
      }
    } catch (err) {
      console.error("Failed to open file picker:", err);
      setUploadError("Could not open file selector. Please check browser permissions.");
    }
  };

  const triggerCustomerUpload = () => {
    try {
      setUploadError("");
      if (customerFileInputRef.current) {
        customerFileInputRef.current.click();
      }
    } catch (err) {
      console.error("Failed to open file picker:", err);
      setUploadError("Could not open file selector. Please check browser permissions.");
    }
  };

  // ─── File Upload Logic ──────────────────────────────────────
  const handleAudioUpload = async (e, type) => {
    // 1. Secure Input Metric Capture:
    const inputElement = e.target;
    const file = inputElement?.files?.[0];

    if (!file) {
      console.error("Audio upload failed: No file selected or file object lost.");
      setUploadingOrder(false);
      setUploadingCustomer(false);
      return;
    }

    console.log("File detected:", file.name, file.size, file.type);

    const fileName = file.name;
    const fileType = file.type || "audio/mpeg";
    const fileSize = file.size;

    setUploadError(""); // clear previous errors

    // Strict 5MB limit
    if (fileSize > 5 * 1024 * 1024) {
      const errMsg = `File size (${(fileSize / (1024 * 1024)).toFixed(2)}MB) exceeds the 5MB limit. Please trim or compress your audio file.`;
      console.error("Audio upload failed:", errMsg);
      alert(errMsg);
      setUploadError(errMsg);
      if (inputElement) inputElement.value = "";
      return;
    }

    if (type === "orderAlert") setUploadingOrder(true);
    else setUploadingCustomer(true);

    try {
      // 2. Force the file handler to immediately call saveAudioToLocalDB:
      console.log(`Saving pure audio binary directly to local IndexedDB under key: ${type}`);
      await saveAudioToLocalDB(type, file);
      console.log(`Successfully saved raw audio to local IndexedDB`);

      // 3. Update the Firestore configuration document with a standard local flag:
      updateField(type, "audioUrl", `localDB:${type}`);

      if (type === "orderAlert") {
        setUploadSuccessOrder(true);
        setTimeout(() => setUploadSuccessOrder(false), 2000);
      } else {
        setUploadSuccessCustomer(true);
        setTimeout(() => setUploadSuccessCustomer(false), 2000);
      }
    } catch (err) {
      console.error("Local upload failed:", err);
      setUploadError("Failed to save audio file to local DB.");
      alert("Error: Local IndexedDB storage failed.");
    } finally {
      // 4. Guaranteed Interface Reset:
      if (inputElement) inputElement.value = "";
      setUploadingOrder(false);
      setUploadingCustomer(false);
    }
  };

  // ─── Playback Logic ─────────────────────────────────────────
  const playWebAudioBeep = (freqs) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach(({ freq, start, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration + 0.05);
      });
    } catch {}
  };

  const playTestSound = async (type) => {
    const config = settings[type];
    const isPlayingState = type === "orderAlert" ? playingOrder : playingCustomer;
    const setPlayingState = type === "orderAlert" ? setPlayingOrder : setPlayingCustomer;
    const ref = type === "orderAlert" ? audioRefOrder : audioRefCustomer;

    if (isPlayingState) {
      if (ref.current) {
        ref.current.pause();
        ref.current.currentTime = 0;
      }
      setPlayingState(false);
      return;
    }

    const audioUrl = config?.audioUrl;

    if (audioUrl && audioUrl !== "local" && audioUrl !== "") {
      let finalAudioUrl = audioUrl;
      let isLocalUrl = false;

      if (audioUrl.startsWith("localDB:")) {
        const key = audioUrl.split(":")[1];
        try {
          const blob = await getAudioFromLocalDB(key);
          if (blob) {
            finalAudioUrl = URL.createObjectURL(blob);
            isLocalUrl = true;
          } else {
            console.warn("Local DB audio blob not found, falling back to default beep.");
            playDefaultBeep(type);
            return;
          }
        } catch (err) {
          console.error("Failed to retrieve audio from IndexedDB for test playback:", err);
          playDefaultBeep(type);
          return;
        }
      }

      try {
        const audio = new Audio(finalAudioUrl);
        ref.current = audio;
        audio.loop = true;
        await audio.play();
        setPlayingState(true);

        setTimeout(() => {
          if (ref.current === audio) {
            audio.pause();
            audio.currentTime = 0;
            setPlayingState(false);
          }
          if (isLocalUrl) {
            URL.revokeObjectURL(finalAudioUrl);
          }
        }, config.duration * 1000);
      } catch (err) {
        console.error("Playback failed for custom tone:", err);
        if (isLocalUrl) {
          URL.revokeObjectURL(finalAudioUrl);
        }
        playDefaultBeep(type);
      }
    } else {
      playDefaultBeep(type);
    }
  };

  const playDefaultBeep = (type) => {
    if (type === "orderAlert") {
      playWebAudioBeep([
        { freq: 880, start: 0,    duration: 0.15 },
        { freq: 660, start: 0.2,  duration: 0.15 },
        { freq: 880, start: 0.4,  duration: 0.15 },
      ]);
    } else {
      playWebAudioBeep([{ freq: 1200, start: 0, duration: 0.3 }]);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0B0F19" }}>
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "#0B0F19" }}>
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <PageHeader
          title="Settings"
          subtitle="Customize real-time notification tones and alert durations"
          rightContent={
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/20 border border-indigo-500/30">
              <SettingsIcon size={20} className="text-indigo-400" />
            </div>
          }
        />
      </div>

      {uploadError && (
        <div className="mb-5 md:mb-6 p-3 md:p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-medium text-xs md:text-sm flex items-center gap-3">
          <AlertTriangle size={18} />
          {uploadError}
        </div>
      )}

      {/* General Settings */}
      <GlassCard className="mb-4 md:mb-6 p-4 md:p-6">
        <h2 className="text-white font-bold text-base md:text-lg mb-4">General Settings</h2>
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
          <div className="flex-1">
            <TextInput
              label="Restaurant Name"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Enter your restaurant name (e.g., Food World)"
            />
          </div>
          <PrimaryButton onClick={handleSaveRestaurantName} className="w-full md:w-auto">
            Save Settings
          </PrimaryButton>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        
        {/* New Order Alerts */}
        <GlassCard className="p-4 md:p-6 overflow-hidden">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="p-2 md:p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UtensilsCrossed size={18} md:size={20} />
            </div>
            <div>
              <h2 className="text-white font-bold text-base md:text-lg">New Order Alerts</h2>
              <p className="text-white/40 text-[11px] md:text-xs mt-0.5">Plays when a new table order arrives in the KDS</p>
            </div>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div>
              <TextInput
                label="Playback Duration (Seconds)"
                type="number"
                min="1"
                max="60"
                value={settings.orderAlert.duration}
                onChange={(e) => updateField("orderAlert", "duration", Number(e.target.value))}
              />
              <p className="text-white/30 text-[10px] mt-2">Recommended: 15 seconds to ensure staff attention during rush.</p>
            </div>

            <div className="pt-4 border-t border-white/10">
              <label className="block text-xs md:text-sm font-semibold text-white/70 mb-2 md:mb-3">
                Custom Alert Tone
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={triggerOrderUpload}
                  disabled={uploadingOrder || uploadSuccessOrder}
                  className={`inline-flex items-center justify-center gap-2 px-3 py-2 md:px-4 md:py-2 w-full sm:w-auto rounded-xl text-xs md:text-sm font-semibold transition-all duration-300 ${
                    uploadingOrder
                      ? "bg-white/5 text-white/40"
                      : uploadSuccessOrder
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-success-flash"
                      : "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"
                  }`}
                >
                  {uploadingOrder ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : uploadSuccessOrder ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Upload size={16} />
                  )}
                  {uploadingOrder ? "Uploading..." : uploadSuccessOrder ? "Saved!" : settings.orderAlert.audioUrl ? "Replace Tone" : "Upload Custom Alert Tone"}
                </button>
                <input
                  type="file"
                  accept="audio/*"
                  ref={orderFileInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => handleAudioUpload(e, "orderAlert")}
                  disabled={uploadingOrder}
                />
                
                <button
                  onClick={() => playTestSound("orderAlert")}
                  className={`inline-flex items-center justify-center gap-2 px-3 py-2 md:px-4 md:py-2 w-full sm:w-auto rounded-xl text-xs md:text-sm font-semibold transition-all ${
                    playingOrder ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20" : "bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  {playingOrder ? <Square size={16} /> : <Play size={16} />}
                  {playingOrder ? "Stop Playing" : "Play Test Sound"}
                </button>
              </div>
              
              {settings.orderAlert.audioUrl ? (
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg w-fit border border-emerald-500/20">
                  <Volume2 size={14} /> Custom Tone Active
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" /> Default chime is active
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Customer Assistance Alerts */}
        <GlassCard className="p-4 md:p-6 overflow-hidden">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="p-2 md:p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Bell size={18} md:size={20} />
            </div>
            <div>
              <h2 className="text-white font-bold text-base md:text-lg">Customer Assistance Alerts</h2>
              <p className="text-white/40 text-[11px] md:text-xs mt-0.5">Plays when a table requests a waiter or bill</p>
            </div>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div>
              <TextInput
                label="Playback Duration (Seconds)"
                type="number"
                min="1"
                max="60"
                value={settings.customerAlert.duration}
                onChange={(e) => updateField("customerAlert", "duration", Number(e.target.value))}
              />
              <p className="text-white/30 text-[10px] mt-2">Recommended: 15 seconds to ensure staff attention during rush.</p>
            </div>

            <div className="pt-4 border-t border-white/10">
              <label className="block text-xs md:text-sm font-semibold text-white/70 mb-2 md:mb-3">
                Custom Alert Tone
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={triggerCustomerUpload}
                  disabled={uploadingCustomer || uploadSuccessCustomer}
                  className={`inline-flex items-center justify-center gap-2 px-3 py-2 md:px-4 md:py-2 w-full sm:w-auto rounded-xl text-xs md:text-sm font-semibold transition-all duration-300 ${
                    uploadingCustomer
                      ? "bg-white/5 text-white/40"
                      : uploadSuccessCustomer
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-success-flash"
                      : "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"
                  }`}
                >
                  {uploadingCustomer ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : uploadSuccessCustomer ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Upload size={16} />
                  )}
                  {uploadingCustomer ? "Uploading..." : uploadSuccessCustomer ? "Saved!" : settings.customerAlert.audioUrl ? "Replace Tone" : "Upload Custom Alert Tone"}
                </button>
                <input
                  type="file"
                  accept="audio/*"
                  ref={customerFileInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => handleAudioUpload(e, "customerAlert")}
                  disabled={uploadingCustomer}
                />
                
                <button
                  onClick={() => playTestSound("customerAlert")}
                  className={`inline-flex items-center justify-center gap-2 px-3 py-2 md:px-4 md:py-2 w-full sm:w-auto rounded-xl text-xs md:text-sm font-semibold transition-all ${
                    playingCustomer ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20" : "bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  {playingCustomer ? <Square size={16} /> : <Play size={16} />}
                  {playingCustomer ? "Stop Playing" : "Play Test Sound"}
                </button>
              </div>
              
              {settings.customerAlert.audioUrl ? (
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg w-fit border border-emerald-500/20">
                  <Volume2 size={14} /> Custom Tone Active
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" /> Default chime is active
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Database Retention Policy */}
        <GlassCard className="p-4 md:p-6 overflow-hidden mt-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="p-2 md:p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertTriangle size={18} md:size={20} />
            </div>
            <div>
              <h2 className="text-white font-bold text-base md:text-lg">🧹 Database Retention Policy</h2>
              <p className="text-white/40 text-[11px] md:text-xs mt-0.5">Automatically prune old billing documents while keeping analytics intact.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex flex-col sm:flex-row items-end gap-3">
                <div className="w-full sm:w-64">
                  <TextInput
                    label="Keep itemized bills for (Days)"
                    type="number"
                    min="1"
                    value={retentionDaysInput}
                    onChange={(e) => setRetentionDaysInput(e.target.value)}
                    placeholder="e.g. 30"
                  />
                </div>
                <PrimaryButton onClick={handleSaveRetentionPolicy}>
                  Save Retention Policy
                </PrimaryButton>
              </div>
              <p className="text-white/30 text-[10px] mt-2">
                Records older than this limit will be deleted to optimize storage. Daily aggregate snapshots will be permanently saved for analytics.
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Advanced Database Maintenance & Purge Operations */}
        <GlassCard className="p-4 md:p-6 overflow-hidden mt-6 lg:col-span-2 border-red-500/30">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="p-2 md:p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertTriangle size={18} md:size={20} />
            </div>
            <div>
              <h2 className="text-white font-bold text-base md:text-lg">⚠️ Advanced Database Maintenance & Purge Operations</h2>
              <p className="text-white/40 text-[11px] md:text-xs mt-0.5">Permanently wipe collections and reset operational stuck states.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 p-4 rounded-xl border border-white/5">
              <AnimatedCheckbox
                checked={purgeOptions.pendingOrders}
                onChange={(e) => setPurgeOptions(prev => ({...prev, pendingOrders: e.target.checked}))}
                label="Pending & Active Orders"
              />
              <AnimatedCheckbox
                checked={purgeOptions.completedOrders}
                onChange={(e) => setPurgeOptions(prev => ({...prev, completedOrders: e.target.checked}))}
                label="Completed & Served Orders History"
              />
              <AnimatedCheckbox
                checked={purgeOptions.salesAnalytics}
                onChange={(e) => setPurgeOptions(prev => ({...prev, salesAnalytics: e.target.checked}))}
                label="Sales & Analytics Records"
              />
              <AnimatedCheckbox
                checked={purgeOptions.activeTables}
                onChange={(e) => setPurgeOptions(prev => ({...prev, activeTables: e.target.checked}))}
                label="Active Table Session Flags"
              />
              <div className="col-span-1 md:col-span-2">
                <AnimatedCheckbox
                  checked={purgeOptions.menuCategories}
                  onChange={(e) => setPurgeOptions(prev => ({...prev, menuCategories: e.target.checked}))}
                  label="Menu Items & Categories (Caution)"
                  isDanger={true}
                />
              </div>
            </div>

            <button
              disabled={isPurging || !Object.values(purgeOptions).some(Boolean)}
              onClick={handleExecutePurge}
              className={`w-full py-3 px-4 rounded-xl text-sm font-bold transition-all flex justify-center items-center gap-2 ${
                Object.values(purgeOptions).some(Boolean) 
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/25' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isPurging ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
              🔥 Execute Selected Permanent Purge
            </button>

            <div className="pt-6 mt-6 border-t border-red-500/20">
              <button
                disabled={isWiping}
                onClick={handleFactoryReset}
                className="w-full py-4 px-4 rounded-xl text-sm font-black tracking-wider transition-all flex justify-center items-center gap-3 bg-red-950/80 text-red-500 border border-red-900/50 hover:bg-red-900 hover:text-red-400 hover:border-red-500 shadow-[inset_0_0_20px_rgba(220,38,38,0.2)]"
              >
                {isWiping ? <Loader2 size={20} className="animate-spin" /> : <AlertTriangle size={20} />}
                ☢️ FACTORY RESET: WIPE ENTIRE DATABASE
              </button>
              <p className="text-center text-red-500/50 text-[10px] mt-3 uppercase tracking-widest font-bold">Requires Google Re-Authentication to verify identity</p>
            </div>

          </div>
        </GlassCard>

      </div>
    </div>
  );
}

export default AdminSettings;

function AnimatedCheckbox({ checked, onChange, label, isDanger }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group w-fit">
      <div className="relative w-5 h-5 shrink-0" style={{ perspective: "20px" }}>
        <input 
          type="checkbox" 
          checked={checked} 
          onChange={onChange} 
          className="peer sr-only" 
        />
        <div className={`absolute inset-0 rounded-[4px] border-2 transition-all duration-300 peer-checked:border-red-500 ${isDanger ? 'border-red-500/50 bg-red-500/10' : 'border-[#4b5563] bg-black/40 group-hover:border-red-400'}`}></div>
        <div className="absolute inset-0 transition-all duration-400 peer-checked:[transform:rotateY(180deg)]" style={{ transformStyle: "preserve-3d" }}>
          <div className="absolute inset-0 z-10" style={{ backfaceVisibility: "hidden" }}></div>
          <div className="absolute inset-0 bg-red-500 flex items-center justify-center rounded-[2px] shadow-[0_0_0_1px_#ef4444]" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}>
            <svg viewBox="0 0 14 10" className="w-[12px] h-[12px] fill-none">
              <polyline points="1.5 6 4.5 9 10.5 1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></polyline>
            </svg>
          </div>
        </div>
      </div>
      <span className={`text-sm ${isDanger ? "text-red-400 font-bold" : "text-white group-hover:text-red-400 transition-colors"}`}>
        {label}
      </span>
    </label>
  );
}
