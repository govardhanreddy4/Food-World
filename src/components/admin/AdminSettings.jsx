import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, COLLECTIONS } from "../../firebase/firebaseConfig";
import { compressAudio } from "../../utils/audioCompression";
import { saveAudioToLocalDB } from "../../utils/audioStorage";
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

  const handleSaveRestaurantName = () => {
    localStorage.setItem("restaurant_name", restaurantName);
  };

  const updateField = async (type, field, value) => {
    try {
      const updated = {
        ...settings,
        [type]: { ...settings[type], [field]: value }
      };
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
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(""); // clear previous errors

    // Strict 2MB limit
    if (file.size > 2 * 1024 * 1024) {
      alert("File too large! Please upload an audio file under 2MB.");
      setUploadError("File too large. Please upload an alert audio file under 2MB.");
      e.target.value = ""; // clear the input
      return;
    }

    if (type === "orderAlert") setUploadingOrder(true);
    else setUploadingCustomer(true);

    let compressedBlob;
    try {
      // Compress audio to reduce size and upload to Firebase Storage
      compressedBlob = await compressAudio(file);
    } catch (err) {
      console.error("Audio compression failed:", err);
      compressedBlob = file; // Fallback to raw file if compression fails
    }

    try {
      const storageRef = ref(storage, `notification_sounds/${currentUser.uid}_${type}_sound`);
      await uploadBytes(storageRef, compressedBlob);
      const downloadUrl = await getDownloadURL(storageRef);

      await updateField(type, "audioUrl", downloadUrl);
      
      if (type === "orderAlert") {
        setUploadSuccessOrder(true);
        setTimeout(() => setUploadSuccessOrder(false), 2000);
      } else {
        setUploadSuccessCustomer(true);
        setTimeout(() => setUploadSuccessCustomer(false), 2000);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Upload failed, using local browser fallback...");
      
      try {
        await saveAudioToLocalDB(type, compressedBlob);
        await updateField(type, "audioUrl", `localDB:${type}`);
        
        if (type === "orderAlert") {
          setUploadSuccessOrder(true);
          setTimeout(() => setUploadSuccessOrder(false), 2000);
        } else {
          setUploadSuccessCustomer(true);
          setTimeout(() => setUploadSuccessCustomer(false), 2000);
        }
      } catch (fallbackErr) {
        console.error("Local fallback also failed:", fallbackErr);
        setUploadError("Failed to upload audio and local fallback also failed.");
      }
    } finally {
      if (type === "orderAlert") setUploadingOrder(false);
      else setUploadingCustomer(false);
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
      const audio = new Audio(audioUrl);
      ref.current = audio;
      audio.loop = true;
      audio.play().catch(console.error);
      setPlayingState(true);

      setTimeout(() => {
        if (ref.current === audio) {
          audio.pause();
          audio.currentTime = 0;
          setPlayingState(false);
        }
      }, config.duration * 1000);
    } else {
      // Fallback
      if (type === "orderAlert") {
        playWebAudioBeep([
          { freq: 880, start: 0,    duration: 0.15 },
          { freq: 660, start: 0.2,  duration: 0.15 },
          { freq: 880, start: 0.4,  duration: 0.15 },
        ]);
      } else {
        playWebAudioBeep([{ freq: 1200, start: 0, duration: 0.3 }]);
      }
    }
  };

  // ─── Rendering ──────────────────────────────────────────────
  const glassCard = {
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(16px)",
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
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <div
          className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
        >
          <SettingsIcon size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-white text-xl md:text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-white/40 text-xs md:text-sm">Customize real-time notification tones and alert durations</p>
        </div>
      </div>

      {uploadError && (
        <div className="mb-5 md:mb-6 p-3 md:p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-medium text-xs md:text-sm flex items-center gap-3">
          <AlertTriangle size={18} />
          {uploadError}
        </div>
      )}

      {/* General Settings */}
      <div className="rounded-2xl p-4 md:p-6 mb-4 md:mb-6" style={glassCard}>
        <h2 className="text-white font-bold text-base md:text-lg mb-4">General Settings</h2>
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
          <div className="flex-1">
            <label className="block text-xs md:text-sm font-semibold text-white/70 mb-1.5 md:mb-2">
              Restaurant Name
            </label>
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Enter your restaurant name (e.g., Food World)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </div>
          <button
            onClick={handleSaveRestaurantName}
            className="w-full md:w-auto px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl transition-all"
          >
            Save Settings
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        
        {/* New Order Alerts */}
        <div className="rounded-2xl p-4 md:p-6 relative overflow-hidden" style={glassCard}>
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
              <label className="block text-xs md:text-sm font-semibold text-white/70 mb-1.5 md:mb-2">
                Playback Duration (Seconds)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.orderAlert.duration}
                onChange={(e) => updateField("orderAlert", "duration", Number(e.target.value))}
                className="w-full md:w-32 bg-white/5 border border-white/10 rounded-xl px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm text-white outline-none focus:border-indigo-500/50"
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
        </div>

        {/* Customer Assistance Alerts */}
        <div className="rounded-2xl p-4 md:p-6 relative overflow-hidden" style={glassCard}>
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
              <label className="block text-xs md:text-sm font-semibold text-white/70 mb-1.5 md:mb-2">
                Playback Duration (Seconds)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.customerAlert.duration}
                onChange={(e) => updateField("customerAlert", "duration", Number(e.target.value))}
                className="w-full md:w-32 bg-white/5 border border-white/10 rounded-xl px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm text-white outline-none focus:border-indigo-500/50"
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
        </div>



        {/* Database Retention Policy */}
        <div className="rounded-2xl p-4 md:p-6 relative overflow-hidden mt-6" style={glassCard}>
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
              <label className="block text-xs md:text-sm font-semibold text-white/70 mb-1.5 md:mb-2">
                Keep itemized bills for (Days)
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="number"
                  min="1"
                  value={retentionDaysInput}
                  onChange={(e) => setRetentionDaysInput(e.target.value)}
                  className="w-full sm:w-32 bg-white/5 border border-white/10 rounded-xl px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm text-white outline-none focus:border-indigo-500/50"
                  placeholder="e.g. 30"
                />
                <button
                  onClick={handleSaveRetentionPolicy}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"
                >
                  Save Retention Policy
                </button>
              </div>
              <p className="text-white/30 text-[10px] mt-2">
                Records older than this limit will be deleted to optimize storage. Daily aggregate snapshots will be permanently saved for analytics.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default AdminSettings;
