import React from "react";
import { Loader2 } from "lucide-react";

// ── Cards & Containers ──────────────────────────────────────────

export function GlassCard({ children, className = "", noPadding = false, style = {} }) {
  return (
    <div
      className={`rounded-2xl ${noPadding ? "" : "p-4 md:p-6"} ${className}`}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
        ...style
      }}
    >
      {children}
    </div>
  );
}

// ── Typography & Headers ──────────────────────────────────────

export function PageHeader({ title, subtitle, rightContent, className = "" }) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 md:mb-6 ${className}`}>
      <div>
        <h1 className="text-white text-xl md:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-white/40 text-xs md:text-sm mt-1">{subtitle}</p>}
      </div>
      {rightContent && <div className="flex items-center gap-3">{rightContent}</div>}
    </div>
  );
}

// ── Interactive Elements (Buttons & Tabs) ─────────────────────

export function PrimaryButton({ children, onClick, disabled, loading, icon: Icon, className = "", ...props }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-500/25 border border-indigo-500/50 transition-all disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled, icon: Icon, danger, className = "", ...props }) {
  const baseColors = danger 
    ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30"
    : "bg-white/5 hover:bg-white/10 text-white/90 border-white/10";
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 ${baseColors} active:scale-95 text-sm font-bold rounded-xl border transition-all disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function FilterTabs({ tabs, activeTab, onChange, className = "" }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              isActive 
                ? "bg-white text-slate-900 shadow-md scale-100" 
                : "bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}

// ── Badges ───────────────────────────────────────────────────

export function StatusBadge({ status, type = "order" }) {
  const norm = (status || "").toLowerCase();
  
  if (type === "fulfillment") {
    if (norm === "parcel" || norm === "takeaway") {
      return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-orange-600 text-white shadow-md shadow-orange-600/20 tracking-wide">🛍️ TAKEAWAY</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-600 text-white shadow-md shadow-indigo-600/20 tracking-wide">🍽️ DINE-IN</span>;
  }

  const styles = {
    pending: "bg-red-500 text-white shadow-md shadow-red-500/20 border border-red-400",
    preparing: "bg-amber-500 text-white shadow-md shadow-amber-500/20 border border-amber-400",
    ready: "bg-blue-500 text-white shadow-md shadow-blue-500/20 border border-blue-400",
    served: "bg-emerald-500 text-white shadow-md shadow-emerald-500/20 border border-emerald-400",
    completed: "bg-slate-600 text-white shadow-md shadow-slate-600/20 border border-slate-500"
  };

  const labels = {
    pending: "Pending",
    preparing: "Preparing",
    ready: "Ready",
    served: "Served",
    completed: "Completed"
  };

  const cls = styles[norm] || "bg-slate-700 text-white border border-slate-600";
  const label = labels[norm] || status || "Unknown";

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ── Widgets ───────────────────────────────────────────────────

export function StatCard({ label, value, color, icon: Icon, className = "" }) {
  return (
    <div
      className={`rounded-xl p-2.5 md:p-5 relative overflow-hidden ${className}`}
      style={{
        background: "rgba(15,23,42,0.8)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderTop: `2px solid ${color}`,
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex justify-between items-center mb-1.5 md:mb-2">
        <p className="text-slate-300 font-semibold text-xs md:text-sm">{label}</p>
        {Icon && <Icon size={16} style={{ color }} className="opacity-80 md:w-[18px] md:h-[18px]" />}
      </div>
      <p className="text-white text-xl md:text-3xl lg:text-4xl font-black tracking-tight truncate" style={{ color }}>{value}</p>
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────

export function TextInput({ label, type = "text", value, onChange, placeholder, disabled, required, className = "", multiline = false, rows = 3, options = [] }) {
  const inputClasses = "w-full bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner disabled:opacity-50";
  
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-semibold text-white/70">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      {multiline ? (
        <textarea
          rows={rows}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
        />
      ) : type === "select" ? (
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={inputClasses}
        >
          {placeholder && <option value="" disabled className="bg-[#0B0F19]">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value || opt} value={opt.value || opt} className="bg-[#0B0F19]">
              {opt.label || opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          style={type === "date" ? { colorScheme: 'dark' } : {}}
        />
      )}
    </div>
  );
}
