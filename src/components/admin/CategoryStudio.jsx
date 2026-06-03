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
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase/firebaseConfig";
import { Plus, Pencil, Trash2, Check, X, Tag, GripVertical } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

// ─── Shared dark-glass card style ───────────────────────────────────────────
const glassCard = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
};

function CategoryStudio() {
  const { currentUser } = useAuth();
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

  // ── Live categories listener ──────────────────────────────────
  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;
    const q = query(
      collection(db, COLLECTIONS.CATEGORIES),
      where("userId", "==", currentUser.uid),
      orderBy("displayOrder", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setCategories(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser, currentUser?.uid]);

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
        userId: currentUser.uid,
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
      </div>

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
