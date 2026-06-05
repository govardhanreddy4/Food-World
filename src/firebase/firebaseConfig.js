/**
 * firebaseConfig.js
 * -----------------
 * Central Firebase SDK initializer for the Food World Restaurant App.
 *
 * All credentials are loaded from `.env` via Vite's import.meta.env system.
 * The VITE_ prefix is mandatory for Vite to expose variables to the browser bundle.
 *
 * Exports:
 *   db            → Firestore database instance
 *   auth          → Firebase Authentication instance
 *   googleProvider → Google OAuth2 provider (pre-configured)
 *   storage       → Firebase Storage bucket instance
 *   COLLECTIONS   → Central registry of Firestore collection name strings
 */

import { initializeApp }              from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage }                 from "firebase/storage";
import { getAnalytics }               from "firebase/analytics";
import { getMessaging }               from "firebase/messaging";

// ─── Firebase Project Configuration ─────────────────────────────────────────
// Reads from .env at build-time via Vite's static replacement.
// Never hardcode secrets here — always use import.meta.env.VITE_* variables.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ─── Initialize Firebase App ─────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);

// ─── Analytics ───────────────────────────────────────────────────────────────
// Wrapped in try/catch: analytics is optional and fails in some CSP environments.
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch {
  // Analytics unavailable — non-fatal, app continues normally
}
export { analytics };

// ─── Firestore Database ───────────────────────────────────────────────────────
/**
 * initializeFirestore() with persistentLocalCache replaces the deprecated
 * enableIndexedDbPersistence() API (removed warning in Firebase SDK 12+).
 *
 * persistentMultipleTabManager() allows multiple browser tabs (e.g. admin
 * dashboard open in two windows) to share the offline cache safely.
 */
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (error) {
  console.warn("Firestore persistent cache initialization failed (QuotaExceeded). Falling back to memory cache.", error);
  dbInstance = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
}
export const db = dbInstance;

// ─── Firebase Authentication ─────────────────────────────────────────────────
export const auth = getAuth(app);

// ─── Google OAuth Provider ───────────────────────────────────────────────────
export const googleProvider = new GoogleAuthProvider();
/**
 * Always show the Google account picker, even when a single account is
 * already signed in — important in shared restaurant staff devices.
 */
googleProvider.setCustomParameters({ prompt: "select_account" });

// ─── Firebase Storage ────────────────────────────────────────────────────────
/**
 * Used exclusively by MenuManager for uploading dish photos.
 * Storage path: /menu_images/{timestamp}_{random}.{ext}
 * Storage rules: public read, authenticated-admin-only write.
 */
export const storage = getStorage(app);

// ─── Firebase Cloud Messaging ────────────────────────────────────────────────
// Export messaging instance (will be null if not supported by the browser)
let messagingInstance = null;
try {
  messagingInstance = getMessaging(app);
} catch (error) {
  console.warn("Firebase Messaging initialization failed. Push notifications may not be supported in this environment.", error);
}
export const messaging = messagingInstance;

// ─── Firestore Collection Name Registry ──────────────────────────────────────
// Single source of truth for all collection names — prevents silent typos.
export const COLLECTIONS = {
  MENU_ITEMS:       "menu_items",               // Restaurant food catalog
  CATEGORIES:       "categories",              // Dynamic filter category labels
  ORDERS:           "orders",                   // Active and historical table order sessions
  WAITER_CALLS:     "waiterCalls",             // Real-time staff alert pings from customers
  SETTINGS:         "settings",                 // Restaurant-specific configurations (alerts, etc.)
  DAILY_SNAPSHOTS:  "daily_analytics_snapshots", // Aggregated daily historical data
};

export default app;
