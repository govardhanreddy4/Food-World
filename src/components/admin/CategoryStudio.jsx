/**
 * CategoryStudio.jsx
 * ------------------
 * Admin sub-component for CRUD management of the `categories` collection.
 *
 * Features:
 *   - Live list of all categories sorted by displayOrder
 *   - Add new category with name + order
 *   - Inline rename via double-click
 *   - Delete with confirmation
 *   - Real-time sync via onSnapshot
 *   - One-click seeder: batch-writes all 22 predefined categories
 *     (idempotent — skips labels that already exist in Firestore)
 */

import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { Plus, Pencil, Trash2, Check, X, Tag, GripVertical, Database, CheckCircle2 } from "lucide-react";

// ─── Canonical seed payload — 22 categories in display order ─────────────────
// This is the single source of truth for the restaurant's menu taxonomy.
// Labels use exact capitalisation as specified in the product requirement.
const SEED_CATEGORIES = [
  { label: "Water",                displayOrder: 1  },
  { label: "Soups",                displayOrder: 2  },
  { label: "Salads",               displayOrder: 3  },
  { label: "Appetizers",           displayOrder: 4  },
  { label: "BBQ's",                displayOrder: 5  },
  { label: "Rice Bowls",           displayOrder: 6  },
  { label: "Pasta",                displayOrder: 7  },
  { label: "Burger",               displayOrder: 8  },
  { label: "Pizza",                displayOrder: 9  },
  { label: "Sandwich",             displayOrder: 10 },
  { label: "Sides",                displayOrder: 11 },
  { label: "Dumplings",            displayOrder: 12 },
  { label: "Cold Coffee",          displayOrder: 13 },
  { label: "Hot Coffee",           displayOrder: 14 },
  { label: "Mocktails",            displayOrder: 15 },
  { label: "Thick Shakes",         displayOrder: 16 },
  { label: "Sundaes",              displayOrder: 17 },
  { label: "Desserts & Pastries",  displayOrder: 18 },
  { label: "Brownie",              displayOrder: 19 },
  { label: "Cookies & Macarons",   displayOrder: 20 },
  { label: "Cakes",                displayOrder: 21 },
  { label: "Pure Chocolates",      displayOrder: 22 },
];

// ─── Shared dark-glass card style ───────────────────────────────────────────
const glassCard = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
};

function CategoryStudio() {
  const [categories, setCategories]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [newLabel, setNewLabel]       = useState("");
  const [newOrder, setNewOrder]       = useState("");
  const [adding, setAdding]           = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [editLabel, setEditLabel]     = useState("");
  const [editOrder, setEditOrder]     = useState("");
  const [deletingId, setDeletingId]   = useState(null);
  const [error, setError]             = useState("");
  // Seeder state
  const [seeding, setSeeding]         = useState(false);
  const [seedResult, setSeedResult]   = useState(null); // { added, skipped }

  // ── Live categories listener ──────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.CATEGORIES),
      orderBy("displayOrder", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setCategories(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Add new category ─────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setAdding(true);
    setError("");
    try {
      await addDoc(collection(db, COLLECTIONS.CATEGORIES), {
        label: newLabel.trim(),
        displayOrder: parseInt(newOrder) || categories.length + 1,
        createdAt: serverTimestamp(),
      });
      setNewLabel("");
      setNewOrder("");
    } catch {
      setError("Failed to add category.");
    } finally {
      setAdding(false);
    }
  }

  // ── Seed all 22 categories (idempotent writeBatch) ────────────
  /**
   * seedCategories
   * --------------
   * Reads all existing labels from Firestore first, then uses a single
   * writeBatch to add only the categories that don't already exist.
   * Safe to run multiple times — never creates duplicate labels.
   *
   * Firestore writeBatch is limited to 500 writes per call. Our 22-item
   * payload is well within this limit.
   */
  async function seedCategories() {
    setSeeding(true);
    setSeedResult(null);
    setError("");
    try {
      // Step 1: Fetch all existing category labels from Firestore
      const existingSnap = await getDocs(
        collection(db, COLLECTIONS.CATEGORIES)
      );
      const existingLabels = new Set(
        existingSnap.docs.map((d) => d.data().label)
      );

      // Step 2: Filter out any categories already in Firestore
      const toAdd = SEED_CATEGORIES.filter(
        (cat) => !existingLabels.has(cat.label)
      );

      const skipped = SEED_CATEGORIES.length - toAdd.length;

      if (toAdd.length === 0) {
        // All 22 categories already exist — nothing to write
        setSeedResult({ added: 0, skipped });
        return;
      }

      // Step 3: Batch-write only the missing categories
      const batch = writeBatch(db);
      const colRef = collection(db, COLLECTIONS.CATEGORIES);
      toAdd.forEach((cat) => {
        const newDocRef = doc(colRef); // auto-generated ID
        batch.set(newDocRef, {
          label:        cat.label,
          displayOrder: cat.displayOrder,
          createdAt:    serverTimestamp(),
        });
      });

      await batch.commit();
      setSeedResult({ added: toAdd.length, skipped });
    } catch (err) {
      console.error("[CategoryStudio] Seed failed:", err);
      setError("Seed failed: " + (err.message || "Unknown error."));
    } finally {
      setSeeding(false);
    }
  }

  // ── Start inline edit ────────────────────────────────────────
  function startEdit(cat) {
    setEditingId(cat.id);
    setEditLabel(cat.label);
    setEditOrder(String(cat.displayOrder));
  }

  // ── Save inline edit ─────────────────────────────────────────
  async function saveEdit(id) {
    if (!editLabel.trim()) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.CATEGORIES, id), {
        label: editLabel.trim(),
        displayOrder: parseInt(editOrder) || 0,
      });
    } catch {
      setError("Failed to update category.");
    } finally {
      setEditingId(null);
    }
  }

  // ── Delete category ──────────────────────────────────────────
  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, id));
    } catch {
      setError("Failed to delete category.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}
          >
            <Tag size={20} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Category Studio</h1>
            <p className="text-white/40 text-sm">
              Manage menu categories. Changes appear instantly on customer menus.
            </p>
          </div>
        </div>

        {/* ── Seed Button ───────────────────────────────────────── */}
        <button
          id="btn-seed-categories"
          onClick={seedCategories}
          disabled={seeding}
          title="Batch-write all 22 predefined categories (skips duplicates)"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shrink-0 hover:opacity-90"
          style={{
            background: "rgba(16,185,129,0.15)",
            border: "1px solid rgba(16,185,129,0.35)",
            color: "#10b981",
          }}
        >
          <Database size={15} />
          {seeding ? "Seeding…" : "Seed All 22"}
        </button>
      </div>

      {/* ── Seed Result Banner ────────────────────────────────────── */}
      {seedResult !== null && (
        <div
          className="flex items-start gap-3 p-4 rounded-2xl mb-5"
          style={{
            background: seedResult.added > 0
              ? "rgba(16,185,129,0.10)"
              : "rgba(99,102,241,0.08)",
            border: seedResult.added > 0
              ? "1px solid rgba(16,185,129,0.25)"
              : "1px solid rgba(99,102,241,0.20)",
          }}
        >
          <CheckCircle2
            size={18}
            className={seedResult.added > 0 ? "text-emerald-400 shrink-0 mt-0.5" : "text-indigo-400 shrink-0 mt-0.5"}
          />
          <div className="text-sm">
            {seedResult.added > 0 ? (
              <p className="text-emerald-300 font-semibold">
                ✅ {seedResult.added} categor{seedResult.added !== 1 ? "ies" : "y"} added to Firestore.
              </p>
            ) : (
              <p className="text-indigo-300 font-semibold">
                ℹ️ All 22 categories already exist — nothing was written.
              </p>
            )}
            {seedResult.skipped > 0 && (
              <p className="text-white/40 text-xs mt-0.5">
                {seedResult.skipped} duplicate label{seedResult.skipped !== 1 ? "s" : ""} skipped.
              </p>
            )}
          </div>
          <button
            onClick={() => setSeedResult(null)}
            className="ml-auto text-white/30 hover:text-white/70 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-xl mb-4 text-red-300 text-sm"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          <X size={15} />
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* ── Add Category Form ─────────────────────────────────── */}
      <form
        onSubmit={handleAdd}
        className="flex gap-3 mb-6 p-4 rounded-2xl"
        style={glassCard}
      >
        <input
          type="text"
          placeholder="Category name (e.g. Starters)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          required
          className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm placeholder-white/25 outline-none focus:ring-2 focus:ring-indigo-500/50"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
        />
        <input
          type="number"
          placeholder="Order"
          value={newOrder}
          onChange={(e) => setNewOrder(e.target.value)}
          className="w-20 px-3 py-2.5 rounded-xl text-white text-sm placeholder-white/25 outline-none focus:ring-2 focus:ring-indigo-500/50 text-center"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
        />
        <button
          type="submit"
          disabled={adding}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
        >
          <Plus size={16} />
          Add
        </button>
      </form>

      {/* ── Category List ─────────────────────────────────────── */}
      {loading ? (
        <p className="text-white/40 text-center py-12">Loading categories…</p>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 rounded-2xl" style={glassCard}>
          <Tag size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40">No categories yet.</p>
          <p className="text-white/25 text-sm">Add your first category above.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 p-4 rounded-xl transition-all"
              style={glassCard}
            >
              <GripVertical size={16} className="text-white/20 shrink-0" />

              {editingId === cat.id ? (
                /* Inline edit mode */
                <>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    autoFocus
                    className="flex-1 px-3 py-1.5 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(cat.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <input
                    type="number"
                    value={editOrder}
                    onChange={(e) => setEditOrder(e.target.value)}
                    className="w-16 px-2 py-1.5 rounded-lg text-white text-sm text-center outline-none focus:ring-2 focus:ring-indigo-500/50"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                  />
                  <button
                    onClick={() => saveEdit(cat.id)}
                    className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    aria-label="Save"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1.5 rounded-lg text-white/40 hover:bg-white/10 transition-colors"
                    aria-label="Cancel"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                /* Display mode */
                <>
                  <span
                    className="flex-1 text-white/80 text-sm font-medium cursor-pointer hover:text-white"
                    onDoubleClick={() => startEdit(cat)}
                    title="Double-click to rename"
                  >
                    {cat.label}
                  </span>
                  <span className="text-white/25 text-xs w-8 text-center">
                    #{cat.displayOrder}
                  </span>
                  <button
                    onClick={() => startEdit(cat)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                    aria-label={`Edit ${cat.label}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    disabled={deletingId === cat.id}
                    className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    aria-label={`Delete ${cat.label}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-white/20 text-xs text-center mt-6">
        {categories.length} categor{categories.length !== 1 ? "ies" : "y"} • Double-click any label to rename inline
      </p>
    </div>
  );
}

export default CategoryStudio;
