import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, COLLECTIONS } from "../../firebase/firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import {
  Settings as SettingsIcon,
  Bell,
  UtensilsCrossed,
  Upload,
  Play,
  Square,
  Volume2
} from "lucide-react";

function AdminSettings() {
  const { currentUser } = useAuth();
  
  const [settings, setSettings] = useState({
    orderAlert: { audioUrl: "", duration: 15 },
    customerAlert: { audioUrl: "", duration: 15 }
  });
  
  const [loading, setLoading] = useState(true);
  const [uploadingOrder, setUploadingOrder] = useState(false);
  const [uploadingCustomer, setUploadingCustomer] = useState(false);

  const [playingOrder, setPlayingOrder] = useState(false);
  const [playingCustomer, setPlayingCustomer] = useState(false);
  const audioRefOrder = useRef(null);
  const audioRefCustomer = useRef(null);

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

  const updateField = (type, field, value) => {
    const updated = {
      ...settings,
      [type]: { ...settings[type], [field]: value }
    };
    setSettings(updated);
    saveSettings(updated);
  };

  // ─── File Upload Logic ──────────────────────────────────────
  const handleAudioUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.uid) return;

    if (type === "orderAlert") setUploadingOrder(true);
    else setUploadingCustomer(true);

    try {
      const ext = file.name.split(".").pop();
      const storageRef = ref(storage, `alert_sounds/${currentUser.uid}/${type}_${Date.now()}.${ext}`);
      
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on(
        "state_changed",
        null,
        (error) => {
          console.error("Upload error:", error);
          if (type === "orderAlert") setUploadingOrder(false);
          else setUploadingCustomer(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          updateField(type, "audioUrl", downloadURL);
          if (type === "orderAlert") setUploadingOrder(false);
          else setUploadingCustomer(false);
        }
      );
    } catch (err) {
      console.error("Upload error:", err);
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

  const playTestSound = (type) => {
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

    if (config.audioUrl) {
      const audio = new Audio(config.audioUrl);
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
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
        >
          <SettingsIcon size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-white/40 text-sm">Customize real-time notification tones and alert durations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* New Order Alerts */}
        <div className="rounded-2xl p-6 relative overflow-hidden" style={glassCard}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UtensilsCrossed size={20} />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">New Order Alerts</h2>
              <p className="text-white/40 text-xs mt-0.5">Plays when a new table order arrives in the KDS</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-white/70 mb-2">
                Playback Duration (Seconds)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.orderAlert.duration}
                onChange={(e) => updateField("orderAlert", "duration", Number(e.target.value))}
                className="w-full md:w-32 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-indigo-500/50"
              />
              <p className="text-white/30 text-[10px] mt-2">Recommended: 15 seconds to ensure staff attention during rush.</p>
            </div>

            <div className="pt-4 border-t border-white/10">
              <label className="block text-sm font-semibold text-white/70 mb-3">
                Custom Alert Tone
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <label className={`cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 w-full sm:w-auto rounded-xl text-sm font-semibold transition-all ${
                  uploadingOrder ? "bg-white/5 text-white/40" : "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"
                }`}>
                  <Upload size={16} />
                  {uploadingOrder ? "Uploading..." : settings.orderAlert.audioUrl ? "Replace Tone" : "Upload Custom Alert Tone"}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleAudioUpload(e, "orderAlert")}
                    disabled={uploadingOrder}
                  />
                </label>
                
                <button
                  onClick={() => playTestSound("orderAlert")}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 w-full sm:w-auto rounded-xl text-sm font-semibold transition-all ${
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
        <div className="rounded-2xl p-6 relative overflow-hidden" style={glassCard}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Bell size={20} />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Customer Assistance Alerts</h2>
              <p className="text-white/40 text-xs mt-0.5">Plays when a table requests a waiter or bill</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-white/70 mb-2">
                Playback Duration (Seconds)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.customerAlert.duration}
                onChange={(e) => updateField("customerAlert", "duration", Number(e.target.value))}
                className="w-full md:w-32 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-indigo-500/50"
              />
              <p className="text-white/30 text-[10px] mt-2">Recommended: 15 seconds to ensure staff attention during rush.</p>
            </div>

            <div className="pt-4 border-t border-white/10">
              <label className="block text-sm font-semibold text-white/70 mb-3">
                Custom Alert Tone
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <label className={`cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 w-full sm:w-auto rounded-xl text-sm font-semibold transition-all ${
                  uploadingCustomer ? "bg-white/5 text-white/40" : "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"
                }`}>
                  <Upload size={16} />
                  {uploadingCustomer ? "Uploading..." : settings.customerAlert.audioUrl ? "Replace Tone" : "Upload Custom Alert Tone"}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleAudioUpload(e, "customerAlert")}
                    disabled={uploadingCustomer}
                  />
                </label>
                
                <button
                  onClick={() => playTestSound("customerAlert")}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 w-full sm:w-auto rounded-xl text-sm font-semibold transition-all ${
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

      </div>
    </div>
  );
}

export default AdminSettings;
