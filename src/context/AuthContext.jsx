/**
 * AuthContext.jsx
 * ---------------
 * Global authentication state provider for the Restaurant Ordering App.
 *
 * Wraps the entire app and provides:
 *   - `user`           → Current Firebase Auth user (null if unauthenticated)
 *   - `loading`        → True while auth state is being determined on load
 *   - `login()`        → Email/password sign-in
 *   - `loginWithGoogle()` → Google OAuth sign-in popup
 *   - `logout()`       → Sign out and redirect to /admin/login
 *   - `resetPassword()` → Sends password reset email via Firebase
 *
 * Usage:
 *   Wrap <App /> with <AuthProvider />
 *   Access context via `useAuth()` hook anywhere in the tree.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase/firebaseConfig";

// ─── Context Definition ─────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── Custom Hook ────────────────────────────────────────────────────────────
/**
 * useAuth()
 * Access the auth context from any component inside <AuthProvider>.
 * Throws an error if used outside the provider tree.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth() must be used inside an <AuthProvider> tree.");
  }
  return context;
}

// ─── Auth Provider Component ─────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // Firebase user object
  const [loading, setLoading] = useState(true);   // Auth resolution pending

  // ── Listen for auth state changes ──────────────────────────────────────
  useEffect(() => {
    /**
     * onAuthStateChanged fires immediately on mount with the current user
     * (or null), and again whenever the user signs in or out.
     * We set loading=false only after the first resolution so protected
     * routes don't flash the login page before auth is confirmed.
     */
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Cleanup listener on component unmount
    return () => unsubscribe();
  }, []);

  // ── Auth Action Functions ───────────────────────────────────────────────

  /**
   * login(email, password)
   * Signs in with email/password credentials.
   * Returns the UserCredential on success, throws on failure.
   */
  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  /**
   * loginWithGoogle()
   * Opens a Google account picker popup and signs in.
   * Configured to always show account selection (see firebaseConfig.js).
   */
  async function loginWithGoogle() {
    return signInWithPopup(auth, googleProvider);
  }

  /**
   * logout()
   * Signs the current user out of Firebase Auth.
   * The router/ProtectedRoute handles the redirect to /admin/login.
   */
  async function logout() {
    return signOut(auth);
  }

  /**
   * resetPassword(email)
   * Triggers Firebase to send a password-reset email to the given address.
   * Does NOT require the user to be currently logged in.
   */
  async function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  // ── Context Value ───────────────────────────────────────────────────────
  const value = {
    user,
    loading,
    isAdmin: !!user,      // Convenience boolean alias
    login,
    loginWithGoogle,
    logout,
    resetPassword,
  };

  // Render children only after auth state is resolved.
  // This prevents protected routes from flickering.
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
