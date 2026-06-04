/**
 * MenuManager.jsx
 * ---------------
 * Admin component for managing the restaurant's `menuItems` Firestore collection.
 *
 * Features:
 *   - Live list of all menu items (onSnapshot)
 *   - Add new item via modal form
 *   - Edit existing item (inline modal, same form)
 *   - Toggle item availability (available flag)
 *   - Delete item
 *   - Category dropdown populated from live `categories` collection
 *   - Menu image via native file picker → Firebase Storage upload → Firestore URL
 *   - Spinner overlay blocks form during upload transit
 */

import React, { useEffect, useState, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  UtensilsCrossed,
  ToggleLeft,
  ToggleRight,
  ImageIcon,
  AlertCircle,
  UploadCloud,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const glassCard = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
};

// ─── Empty form state factory ────────────────────────────────────────────────
const emptyForm = () => ({
  name: "",
  description: "",
  price: "",
  category: "",
  imageUrl: "",
  available: true,
  foodType: "Veg",
});

// ─── Item Form Modal ────────────────────────────────────────────────────────────
function ItemFormModal({ isOpen, onClose, editItem, categories, onSave }) {
  const [form, setForm]           = useState(emptyForm());
  const [saving, setSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError]         = useState("");
  // Upload-specific state
  const [uploading, setUploading] = useState(false);  // true while file is in transit
  const [uploadPct, setUploadPct] = useState(0);      // 0–100 progress integer
  const [localPreview, setLocalPreview] = useState(""); // object URL for instant preview
  const [showFallbackUrl, setShowFallbackUrl] = useState(false); // Manual fallback URL input trigger
  const fileInputRef              = useRef(null);

  // Pre-populate form when editing an existing item
  useEffect(() => {
    if (editItem) {
      setForm({
        name:        editItem.name        || "",
        description: editItem.description || "",
        price:       String(editItem.price ?? ""),
        category:    editItem.category    || "",
        imageUrl:    editItem.imageUrl    || "",
        available:   editItem.available   ?? true,
        foodType:    editItem.foodType    || "Veg",
      });
      // Show existing image as preview when editing
      setLocalPreview("");
      setShowFallbackUrl(!!editItem.imageUrl);
    } else {
      setForm(emptyForm());
      setLocalPreview("");
      setShowFallbackUrl(false);
    }
    setError("");
    setUploading(false);
    setUploadPct(0);
    setSaveSuccess(false);
  }, [editItem, isOpen]);

  if (!isOpen) return null;

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * handleImageSelect
   * -----------------
   * Fires when the admin selects a file from the native photo gallery / file picker.
   *
   * Flow:
   *   1. Show an instant local preview via URL.createObjectURL (zero latency).
   *   2. Upload the raw File object to Firebase Storage under /menu_images/.
   *      Filename is timestamped to avoid collisions on re-upload of same file.
   *   3. Track progress via uploadBytesResumable so we can show % in the spinner.
   *   4. On completion, call getDownloadURL to get the permanent public CDN string.
   *   5. Write that URL into form.imageUrl so it gets saved to Firestore on submit.
   */
  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Guard: only accept image MIME types
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (JPG, PNG, WebP, etc.)");
      return;
    }

    // Firestore has a 1MB size limit for the entire document.
    // Encoded Base64 images must be small to prevent Firestore write failure.
    // Cap at 600 KB to be safe.
    if (file.size > 600 * 1024) {
      setError("Image is too large. For local database storage, please select an image smaller than 600 KB.");
      return;
    }

    setUploading(true);
    setUploadPct(10);
    setError("");

    // Simulate progress during FileReader loading
    const progressInterval = setInterval(() => {
      setUploadPct((prev) => (prev < 90 ? prev + 15 : prev));
    }, 100);

    const reader = new FileReader();

    // 5-second timeout threshold
    const timeoutId = setTimeout(() => {
      clearInterval(progressInterval);
      reader.abort();
      setUploading(false);
      setError("Image processing timed out.");
      alert("Upload timed out. Please check your image file.");
    }, 5000);

    reader.onload = () => {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      setUploadPct(100);
      
      const base64String = reader.result;
      setForm((prev) => ({ ...prev, imageUrl: base64String }));
      setLocalPreview(base64String);
      setUploading(false);
    };

    reader.onerror = (error) => {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      setUploading(false);
      console.error("FileReader error:", error);
      setError("Failed to read image file.");
      alert("FileReader failed to process the image.");
    };

    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (uploading) {
      setError("Please wait for the image processing to finish.");
      return;
    }
    if (!form.name.trim() || !form.price || !form.category) {
      setError("Name, price, and category are required.");
      return;
    }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) {
      setError("Please enter a valid price.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      // Map keys exactly as specified in the prompt
      const payload = {
        name: form.name,
        description: form.description,
        price: price,
        category: form.category,
        imageUrl: form.imageUrl, // The encoded local image text string
        available: form.available,
        isAvailable: form.available,
        foodType: form.foodType || "Veg",
      };
      await onSave(payload);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error(err);
      setError("Failed to save item. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Determine which image src to show in preview:
  // During upload: local object URL gives zero-latency feedback.
  // After upload / when editing: the Firestore-persisted CDN URL.
  const previewSrc = localPreview || form.imageUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      {/* ─────────────────────────────────────────────────────────────────
          Upload Spinner Overlay
          Covers the entire modal panel while a file is in transit.
          Pointer-events are blocked so the admin cannot interact with
          the form until the upload resolves (success or error).
      ───────────────────────────────────────────────────────────────── */}
      {uploading && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
          style={{ background: "rgba(11,15,25,0.82)", backdropFilter: "blur(6px)" }}
        >
          {/* Spinning ring */}
          <div className="relative w-20 h-20 mb-4">
            {/* Background track */}
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="rgba(99,102,241,0.15)"
                strokeWidth="6"
              />
              {/* Animated progress arc */}
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="url(#uploadGrad)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - uploadPct / 100)}`}
                style={{ transition: "stroke-dashoffset 0.3s ease" }}
              />
              <defs>
                <linearGradient id="uploadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            {/* Percentage label in the centre */}
            <span
              className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm"
            >
              {uploadPct}%
            </span>
          </div>
          <p className="text-white font-semibold text-sm">Uploading image…</p>
          <p className="text-white/40 text-xs mt-1">Please wait, do not close this window.</p>
        </div>
      )}

      <div
        className="relative w-full max-w-lg rounded-2xl p-6 animate-fadeIn max-h-[90vh] overflow-y-auto"
        style={{
          background: "rgba(15,23,42,0.95)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white text-lg font-bold">
            {editItem ? "Edit Menu Item" : "Add Menu Item"}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 p-3 rounded-xl mb-4 text-red-300 text-sm"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Item Name */}
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Item Name *</label>
            <input
              type="text"
              placeholder="e.g. Butter Chicken"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none focus:ring-2 focus:ring-indigo-500/50"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Description</label>
            <textarea
              placeholder="Short description of the dish…"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={2}
              className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            />
          </div>

          {/* Price + Category + Food Type */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => handleChange("price", e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none focus:ring-2 focus:ring-indigo-500/50"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
              />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Category *</label>
              <select
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <option value="" disabled className="bg-slate-900">Select…</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.label} className="bg-slate-900">
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Food Type *</label>
              <select
                value={form.foodType}
                onChange={(e) => handleChange("foodType", e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <option value="Veg" className="bg-slate-900">Veg</option>
                <option value="Non-Veg" className="bg-slate-900">Non-Veg</option>
              </select>
            </div>
          </div>

          {/* ── Image Upload Field ──────────────────────────────────────────
              Hidden native <input type="file" /> paired with a styled
              clickable label. On mobile this opens the device photo gallery.
              Accepts all image formats; filtered to images in JS as well.
          ──────────────────────────────────────────────────────────── */}
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ImageIcon size={12} /> Dish Photo
                </span>
                <button
                  type="button"
                  onClick={() => setShowFallbackUrl((prev) => !prev)}
                  className="text-indigo-400 hover:text-indigo-300 text-[10px] font-medium transition-colors"
                >
                  {showFallbackUrl ? "Hide URL Input" : "Use Manual URL"}
                </button>
              </span>
            </label>

            {/* Hidden file input — triggered by the styled button below */}
            <input
              id="menu-image-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture={false}     /* false = gallery, true = camera-only */
              onChange={handleImageSelect}
              className="hidden"
              aria-label="Select dish photo from gallery"
            />

            {/* Preview area + picker trigger */}
            <div
              className="relative rounded-xl overflow-hidden cursor-pointer group"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: previewSrc
                  ? "1px solid rgba(99,102,241,0.35)"
                  : "2px dashed rgba(255,255,255,0.12)",
                minHeight: "120px",
              }}
              onClick={() => fileInputRef.current?.click()}
              title="Click to choose a photo from your gallery"
            >
              {previewSrc ? (
                /* Image preview */
                <>
                  <img
                    src={previewSrc}
                    alt="Dish preview"
                    className="w-full h-44 object-cover"
                  />
                  {/* Hover replace overlay */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.55)" }}
                  >
                    <UploadCloud size={24} className="text-white mb-1" />
                    <span className="text-white text-xs font-semibold">Replace photo</span>
                  </div>
                  {/* Upload-complete badge */}
                  {!uploading && uploadPct === 100 && (
                    <div
                      className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                      style={{ background: "rgba(16,185,129,0.85)" }}
                    >
                      <CheckCircle2 size={12} className="text-white" />
                      <span className="text-white">Uploaded</span>
                    </div>
                  )}
                </>
              ) : (
                /* Empty state — prompt to pick */
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
                    style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}
                  >
                    <UploadCloud size={22} className="text-indigo-400" />
                  </div>
                  <p className="text-white/60 text-sm font-medium text-center">
                    Tap to open photo gallery
                  </p>
                  <p className="text-white/25 text-xs text-center">
                    JPG, PNG, WebP • Max 5 MB
                  </p>
                </div>
              )}
            </div>

            {/* Inline progress bar (visible only while uploading) */}
            {uploading && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-indigo-300 text-xs flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" />
                    Uploading to Storage…
                  </span>
                  <span className="text-white/40 text-xs">{uploadPct}%</span>
                </div>
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${uploadPct}%`,
                      background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Fallback Image URL Input (displays if upload fails, timeout triggers, or user manual toggled) */}
          {showFallbackUrl && (
            <div
              className="mt-1 p-3.5 rounded-xl border border-dashed text-sm transition-all duration-300"
              style={{
                background: "rgba(245,158,11,0.05)",
                borderColor: "rgba(245,158,11,0.25)",
              }}
            >
              <label className="text-amber-400 text-xs font-semibold mb-1 block">
                Image URL (Fallback Input)
              </label>
              <input
                type="url"
                placeholder="https://example.com/dish-image.jpg"
                value={form.imageUrl}
                onChange={(e) => handleChange("imageUrl", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-white text-xs placeholder-white/20 outline-none focus:ring-1 focus:ring-amber-500/50 bg-slate-900/60 border border-white/10"
                style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              />
              <p className="text-white/40 text-[10px] mt-1.5 leading-relaxed">
                If Storage is blocked, paste a direct public image link here.
              </p>
            </div>
          )}

          {/* Availability Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div>
              <p className="text-white/80 text-sm font-medium">Item Available</p>
              <p className="text-white/35 text-xs">
                {form.available
                  ? "Visible and orderable on customer menu"
                  : "Will show as 'Sold Out' on customer menu"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleChange("available", !form.available)}
              className="transition-colors"
            >
              {form.available
                ? <ToggleRight size={32} className="text-emerald-400" />
                : <ToggleLeft size={32} className="text-white/25" />}
            </button>
          </div>

          {/* Submit — disabled while upload is in progress */}
          <button
            type="submit"
            disabled={saving || uploading || saveSuccess}
            className={`py-3 rounded-xl font-semibold text-white text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 flex items-center justify-center gap-2 ${
              saveSuccess ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-success-flash" : ""
            }`}
            style={saveSuccess ? {} : { background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            {uploading ? (
              <><Loader2 size={16} className="animate-spin" /> Uploading image…</>
            ) : saving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving…</>
            ) : saveSuccess ? (
              <><CheckCircle2 size={16} /> Saved!</>
            ) : (
              editItem ? "Update Item" : "Add to Menu"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main MenuManager Component ──────────────────────────────────────────────
function MenuManager() {
  const { currentUser } = useAuth();
  const [items, setItems]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [filterCat, setFilterCat]   = useState("All");
  const [deletingId, setDeletingId] = useState(null);

  // ── Live menu items listener ──────────────────────────────────
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const q = query(
      collection(db, COLLECTIONS.MENU_ITEMS),
      where("restaurantId", "==", currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const fetchedItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedItems.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setItems(fetchedItems);
      setLoading(false);
    }, (error) => console.error("Menu items listener error:", error));
    return () => unsub();
  }, [currentUser, currentUser?.uid]);

  // ── Live categories listener ──────────────────────────────────
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const q = query(
      collection(db, COLLECTIONS.CATEGORIES),
      where("restaurantId", "==", currentUser.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const fetchedCats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedCats.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      setCategories(fetchedCats);
    }, (error) => console.error("Categories listener error:", error));
    return () => unsub();
  }, [currentUser, currentUser?.uid]);

  // ── Filtered items ────────────────────────────────────────────
  const filteredItems =
    filterCat === "All" ? items : items.filter((i) => i.category === filterCat);

  // ── Save handler (add or update) ─────────────────────────────
  async function handleSave(formData) {
    if (editItem) {
      await updateDoc(doc(db, COLLECTIONS.MENU_ITEMS, editItem.id), {
        ...formData,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, COLLECTIONS.MENU_ITEMS), {
        ...formData,
        restaurantId: currentUser.uid,
        createdAt: serverTimestamp(),
      });
    }
  }

  // ── Toggle availability ───────────────────────────────────────
  async function toggleAvailability(item) {
    const nextVal = !(item.available ?? item.isAvailable ?? true);
    await updateDoc(doc(db, COLLECTIONS.MENU_ITEMS, item.id), {
      available: nextVal,
      isAvailable: nextVal,
    });
  }

  // ── Delete item ───────────────────────────────────────────────
  async function handleDelete(id) {
    if (!window.confirm("Delete this menu item? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, COLLECTIONS.MENU_ITEMS, id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}
          >
            <UtensilsCrossed size={20} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Menu Manager</h1>
            <p className="text-white/40 text-sm">{items.length} items total</p>
          </div>
        </div>
        <button
          onClick={() => { setEditItem(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
        >
          <Plus size={17} />
          Add Item
        </button>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        {["All", ...categories.map((c) => c.label)].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              filterCat === cat
                ? "text-white"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
            style={
              filterCat === cat
                ? {
                    background: "rgba(99,102,241,0.25)",
                    border: "1px solid rgba(99,102,241,0.4)",
                  }
                : { border: "1px solid rgba(255,255,255,0.08)" }
            }
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      {loading ? (
        <p className="text-white/40 text-center py-20">Loading menu items…</p>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 rounded-2xl text-center" style={glassCard}>
          {items.length === 0 ? (
            <>
              <span className="text-5xl mb-4">🍽️</span>
              <h3 className="text-xl font-semibold text-white">Your menu is empty</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-sm">Click <strong>+ Add Item</strong> to build your food catalog.</p>
            </>
          ) : (
            <>
              <UtensilsCrossed size={40} className="text-white/15 mx-auto mb-3" />
              <p className="text-white/40">No items in this category.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl overflow-hidden transition-all ${!item.available ? "opacity-60" : ""}`}
              style={glassCard}
            >
              {/* Image */}
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-36 object-cover"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              ) : (
                <div className="w-full h-36 flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  <ImageIcon size={28} className="text-white/15" />
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <h3 className="text-white font-semibold text-sm leading-tight">
                      {item.name} <span className="ml-1 text-[10px]" title={item.foodType || "Veg"}>{item.foodType === "Non-Veg" ? "🔴" : "🟢"}</span>
                    </h3>
                    <span className="text-indigo-400/80 text-xs">{item.category}</span>
                  </div>
                  <span className="text-white font-bold text-sm shrink-0">
                    ₹{Number(item.price).toFixed(2)}
                  </span>
                </div>
                {item.description && (
                  <p className="text-white/40 text-xs mt-1 line-clamp-2">{item.description}</p>
                )}

                {/* Availability badge */}
                <div className="flex items-center justify-between mt-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      item.available
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {item.available ? "Available" : "Sold Out"}
                  </span>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleAvailability(item)}
                      title={item.available ? "Mark as sold out" : "Mark as available"}
                      className="p-1.5 rounded-lg text-white/30 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                      {item.available
                        ? <ToggleRight size={17} className="text-emerald-400" />
                        : <ToggleLeft size={17} />}
                    </button>
                    <button
                      onClick={() => { setEditItem(item); setModalOpen(true); }}
                      className="p-1.5 rounded-lg text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                      aria-label={`Edit ${item.name}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <ItemFormModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        editItem={editItem}
        categories={categories}
        onSave={handleSave}
      />
    </div>
  );
}

export default MenuManager;
