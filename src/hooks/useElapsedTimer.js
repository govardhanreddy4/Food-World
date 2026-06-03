/**
 * useElapsedTimer.js
 * ------------------
 * Custom React hook that tracks elapsed time since a given Firebase Timestamp.
 *
 * Returns:
 *   - `elapsed`   → Formatted string "mm:ss" (e.g. "14:32")
 *   - `isUrgent`  → Boolean, true when elapsed > URGENT_THRESHOLD_MS (15 min)
 *   - `totalSeconds` → Raw elapsed seconds for conditional logic
 *
 * Usage:
 *   const { elapsed, isUrgent } = useElapsedTimer(batch.timestamp);
 *   // batch.timestamp is a Firestore Timestamp object
 */

import { useState, useEffect } from "react";

/** Orders older than this in "Pending" or "Preparing" state get the orange glow */
const URGENT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * useElapsedTimer(timestamp)
 * @param {firebase/firestore.Timestamp | Date | null} timestamp
 *   The creation time of the order batch. Can be a Firestore Timestamp,
 *   a plain JS Date, or null (hook returns "00:00" safely).
 */
export function useElapsedTimer(timestamp) {
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    if (!timestamp) return;

    // Convert Firestore Timestamp → JS Date → epoch ms
    const startMs =
      typeof timestamp.toDate === "function"
        ? timestamp.toDate().getTime()
        : timestamp instanceof Date
        ? timestamp.getTime()
        : new Date(timestamp).getTime();

    const tick = () => {
      const diffMs = Date.now() - startMs;
      setTotalSeconds(Math.floor(diffMs / 1000));
    };

    // Run immediately, then every second
    tick();
    const intervalId = setInterval(tick, 1000);

    return () => clearInterval(intervalId);
  }, [timestamp]);

  // Format seconds → "mm:ss"
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const elapsed = `${minutes}:${seconds}`;

  const isUrgent = totalSeconds * 1000 > URGENT_THRESHOLD_MS;

  return { elapsed, isUrgent, totalSeconds };
}

export default useElapsedTimer;
