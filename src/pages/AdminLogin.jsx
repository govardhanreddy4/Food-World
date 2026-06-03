/**
 * AdminLogin.jsx
 * --------------
 * Dark glassmorphic login gateway for admin access.
 *
 * Features:
 *   - Email/password sign-in form with real-time validation feedback
 *   - "Sign in with Google" OAuth button
 *   - Frosted-glass "Forgot Password" modal → sendPasswordResetEmail
 *   - Animated entrance transitions
 *   - Auto-redirects to /admin if already authenticated
 */

import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Mail,
  Lock,
  LogIn,
  X,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";

// ─── Google Logo SVG (inline, no external dependency) ───────────────────────
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ─── Forgot Password Modal ───────────────────────────────────────────────────
function ForgotPasswordModal({ isOpen, onClose, resetPassword }) {
  const [email, setEmail]         = useState("");
  const [status, setStatus]       = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg]   = useState("");

  if (!isOpen) return null;

  async function handleReset(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      await resetPassword(email.trim());
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err.code === "auth/user-not-found"
          ? "No account found with that email address."
          : "Failed to send reset email. Please try again."
      );
    }
  }

  function handleClose() {
    setEmail("");
    setStatus("idle");
    setErrorMsg("");
    onClose();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={handleClose}
    >
      {/* Modal Panel — stop click propagation */}
      <div
        className="relative w-full max-w-md rounded-2xl p-8 animate-fadeIn"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white/90 transition-colors"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-white mb-1">Reset Password</h2>
        <p className="text-white/50 text-sm mb-6">
          Enter your admin email and we'll send a recovery link.
        </p>

        {status === "success" ? (
          /* Success state */
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle size={48} className="text-emerald-400" />
            <p className="text-white text-center">
              Recovery email sent! Check your inbox and follow the link to reset
              your password.
            </p>
            <button
              onClick={handleClose}
              className="mt-2 px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            {/* Email input */}
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                type="email"
                placeholder="Admin email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 rounded-lg text-white text-sm placeholder-white/30 outline-none focus:ring-2 focus:ring-indigo-500/60"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              />
            </div>

            {/* Error message */}
            {status === "error" && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={status === "loading"}
              className="py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {status === "loading" ? "Sending…" : "Send Recovery Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main AdminLogin Component ───────────────────────────────────────────────
function AdminLogin() {
  const { user, login, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Already logged in → go straight to dashboard
  if (user) return <Navigate to="/admin" replace />;

  // ── Email/Password Login ──────────────────────────────────────
  async function handleEmailLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/admin");
    } catch (err) {
      setError(
        err.code === "auth/invalid-credential" || err.code === "auth/wrong-password"
          ? "Invalid email or password. Please try again."
          : err.code === "auth/user-not-found"
          ? "No admin account found with that email."
          : err.code === "auth/too-many-requests"
          ? "Too many failed attempts. Account temporarily locked."
          : "Sign in failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Google Login ──────────────────────────────────────────────
  async function handleGoogleLogin() {
    setError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      navigate("/admin");
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <>
      {/* ── Full-Page Dark Background ─────────────────────────── */}
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, #1a1040 0%, #0B0F19 50%, #040608 100%)",
        }}
      >
        {/* Ambient glow orbs */}
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        {/* ── Login Card ──────────────────────────────────────── */}
        <div
          className="relative w-full max-w-md rounded-3xl p-8 animate-fadeIn"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(20px)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <span className="text-2xl">🍽️</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Food World
            </h1>
            <p className="text-white/40 text-sm mt-1">Admin Control Panel</p>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl mb-4 text-red-300 text-sm"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Email/Password Form ───────────────────────────── */}
          <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
            {/* Email */}
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
              />
              <input
                id="admin-email"
                type="email"
                placeholder="Admin email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3.5 rounded-xl text-white text-sm placeholder-white/25 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
              />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full pl-10 pr-11 py-3.5 rounded-xl text-white text-sm placeholder-white/25 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Forgot Password link */}
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {/* Sign In Button */}
            <button
              id="btn-email-login"
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: "0 4px 24px rgba(99,102,241,0.4)",
              }}
            >
              <LogIn size={17} />
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <span className="text-white/30 text-xs">or</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Google Sign-In */}
          <button
            id="btn-google-login"
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl text-white/80 text-sm font-medium hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <GoogleLogo />
            {googleLoading ? "Opening Google…" : "Sign in with Google"}
          </button>

          {/* Footer note */}
          <p className="text-center text-white/20 text-xs mt-6">
            Admin access only. Customer orders use the menu QR.
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={forgotOpen}
        onClose={() => setForgotOpen(false)}
        resetPassword={resetPassword}
      />
    </>
  );
}

export default AdminLogin;
