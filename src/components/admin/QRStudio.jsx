/**
 * QRStudio.jsx
 * ------------
 * Admin component for generating and downloading table-specific QR code stickers.
 *
 * Features:
 *   - Base Domain URL pre-fills from window.location.origin on mount
 *     (auto-detects localhost, LAN IP, or live production domain)
 *   - Table number input → auto-builds URL → renders QR on canvas
 *   - Styled printable card preview
 *   - "Download PNG" button
 *   - "Print" button (opens browser print dialog with card template)
 */

import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { QrCode, Download, Printer, Table2, Link } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const glassCard = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
};

function QRStudio() {
  const { currentUser } = useAuth();
  const [tableId, setTableId]       = useState("");
  // window.location.origin captures the exact origin the app is loaded from:
  // • "http://localhost:5173"  when running locally via Vite dev server
  // • "http://192.168.1.42:5173" when accessed over a LAN / hotspot
  // • "https://your-restaurant.netlify.app" on a live production deploy
  const [domain, setDomain]         = useState(() => window.location.origin);
  const [qrDataUrl, setQrDataUrl]   = useState("");
  const [generating, setGenerating] = useState(false);
  const canvasRef                   = useRef(null);

  // ── Build the order URL ──────────────────────────────────────
  const orderUrl = tableId.trim() && currentUser
    ? `${domain.replace(/\/$/, "")}/menu?resId=${currentUser.uid}&table=${encodeURIComponent(tableId.trim())}`
    : "";

  // ── Generate QR whenever URL changes ────────────────────────
  useEffect(() => {
    if (!orderUrl) {
      setQrDataUrl("");
      return;
    }
    setGenerating(true);
    QRCode.toDataURL(orderUrl, {
      width: 512,
      margin: 2,
      color: { dark: "#1A1A1A", light: "#FFFFFF" },
      errorCorrectionLevel: "H",
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
        setGenerating(false);
      })
      .catch(() => setGenerating(false));
  }, [orderUrl]);

  // ── Download QR PNG ──────────────────────────────────────────
  function handleDownload() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `table-${tableId}-qr.png`;
    link.click();
  }

  // ── Print sticker card ───────────────────────────────────────
  function handlePrint() {
    if (!qrDataUrl) return;
    const printWindow = window.open("", "_blank", "width=600,height=700");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Table ${tableId} QR Code — Food World</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; background: #f5f5f0;
          }
          .card {
            background: white;
            border-radius: 24px;
            padding: 32px 28px;
            text-align: center;
            box-shadow: 0 8px 40px rgba(0,0,0,0.15);
            width: 320px;
            border: 2px solid #f0ede8;
          }
          .restaurant-name {
            font-size: 22px; font-weight: 800;
            color: #1a1a1a; letter-spacing: -0.5px;
            margin-bottom: 4px;
          }
          .tagline {
            font-size: 12px; color: #888; margin-bottom: 20px;
          }
          .qr-wrap {
            background: #fafaf8; border-radius: 16px;
            padding: 16px; display: inline-block;
            border: 1px solid #e8e4de; margin-bottom: 16px;
          }
          .qr-wrap img { display: block; width: 220px; height: 220px; }
          .table-badge {
            display: inline-block;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white; font-weight: 800; font-size: 28px;
            border-radius: 16px; padding: 8px 28px; margin-bottom: 12px;
          }
          .instruction {
            font-size: 13px; color: #555; line-height: 1.5;
            margin-bottom: 12px;
          }
          .url-text {
            font-size: 9px; color: #bbb;
            word-break: break-all;
            padding: 8px; background: #f8f8f8; border-radius: 8px;
          }
          .footer {
            margin-top: 16px; font-size: 10px; color: #ccc;
          }
          @media print {
            body { background: white; }
            .card { box-shadow: none; border: 2px solid #eee; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <p class="restaurant-name">🍽️ Food World</p>
          <p class="tagline">Scan to order from your seat</p>
          <div class="qr-wrap">
            <img src="${qrDataUrl}" alt="QR Code for Table ${tableId}" />
          </div>
          <div class="table-badge">Table ${tableId}</div>
          <p class="instruction">
            Scan the QR code above with your smartphone camera<br/>
            to browse our menu and place your order directly.
          </p>
          <p class="url-text">${orderUrl}</p>
          <p class="footer">Food World Restaurant Management System</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}
        >
          <QrCode size={20} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-white text-xl font-bold">QR Studio</h1>
          <p className="text-white/40 text-sm">
            Generate and print QR sticker cards for each table.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Input Panel ───────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* Domain input */}
          <div className="p-5 rounded-2xl" style={glassCard}>
            <label className="flex items-center gap-2 text-white/60 text-xs mb-2">
              <Link size={13} />
              Base Domain URL
            </label>
            <input
              type="url"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="https://your-restaurant.com"
              className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none focus:ring-2 focus:ring-indigo-500/50"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            />
            <p className="text-white/25 text-xs mt-2">
              Auto-detected from <code className="text-indigo-400/70">
                window.location.origin
              </code> — edit if deploying to a different domain.
            </p>
          </div>

          {/* Table ID input */}
          <div className="p-5 rounded-2xl" style={glassCard}>
            <div className="flex justify-between items-center mb-2">
              <label className="flex items-center gap-2 text-white/60 text-xs">
                <Table2 size={13} />
                Table Identifier
              </label>
              <button
                onClick={() => setTableId("PARCEL")}
                className="text-xs font-semibold bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 px-2.5 py-1 rounded-lg transition-colors border border-orange-500/20 flex items-center gap-1.5 shadow-sm"
              >
                <span>🛍️</span> Counter Parcel QR
              </button>
            </div>
            <input
              id="qr-table-input"
              type="text"
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              placeholder="e.g. 7, A1, Terrace-3"
              className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none focus:ring-2 focus:ring-indigo-500/50"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            />
          </div>

          {/* Generated URL preview */}
          {orderUrl && (
            <div
              className="p-4 rounded-2xl"
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.2)",
              }}
            >
              <p className="text-white/40 text-xs mb-1">Generated Order URL:</p>
              <p className="text-indigo-300 text-xs font-mono break-all">{orderUrl}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              id="btn-download-qr"
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <Download size={16} />
              Download PNG
            </button>
            <button
              id="btn-print-qr"
              onClick={handlePrint}
              disabled={!qrDataUrl}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10"
              style={{
                color: "rgba(255,255,255,0.7)",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <Printer size={16} />
              Print Card
            </button>
          </div>
        </div>

        {/* ── Right: Preview Card ──────────────────────────────── */}
        <div className="flex items-center justify-center">
          {!tableId.trim() ? (
            /* Empty state */
            <div
              className="w-full h-72 flex flex-col items-center justify-center rounded-2xl"
              style={glassCard}
            >
              <QrCode size={48} className="text-white/10 mb-3" />
              <p className="text-white/30 text-sm">Enter a table number to generate the QR code</p>
            </div>
          ) : generating ? (
            <div
              className="w-full h-72 flex items-center justify-center rounded-2xl"
              style={glassCard}
            >
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            /* Sticker card preview */
            <div
              className="w-full max-w-xs rounded-3xl p-6 text-center"
              style={{
                background: "white",
                boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              }}
            >
              <p className="text-xl font-black text-gray-900 mb-0.5">🍽️ Food World</p>
              <p className="text-xs text-gray-400 mb-4">Scan to order from your seat</p>

              <div
                className="inline-block p-3 rounded-2xl mb-4"
                style={{ background: "#fafaf8", border: "1px solid #f0ede8" }}
              >
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code for Table ${tableId}`}
                    className="w-44 h-44 object-contain"
                  />
                )}
              </div>

              <div
                className="inline-block px-6 py-2 rounded-2xl text-white font-black text-2xl mb-3"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                Table {tableId}
              </div>

              <p className="text-gray-500 text-xs leading-relaxed mb-3">
                Scan the QR code with your smartphone camera to browse the menu and place your order.
              </p>

              <p className="text-gray-300 text-[9px] font-mono break-all">
                {orderUrl}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tips */}
      <div
        className="mt-6 p-4 rounded-2xl"
        style={{
          background: "rgba(99,102,241,0.06)",
          border: "1px solid rgba(99,102,241,0.15)",
        }}
      >
        <p className="text-white/60 text-xs font-medium mb-1">💡 Deployment Tips</p>
        <ul className="text-white/35 text-xs space-y-1 list-disc list-inside">
          <li>Change the domain to your live URL before printing production stickers.</li>
          <li>Use a laminator on printed cards for restaurant durability.</li>
          <li>Table identifiers can be numbers, letters, or zones (e.g., "Rooftop-A3").</li>
          <li>QR codes use Error Correction Level H — readable even if partially obscured.</li>
        </ul>
      </div>
    </div>
  );
}

export default QRStudio;
