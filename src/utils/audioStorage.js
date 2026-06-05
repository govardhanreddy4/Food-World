/**
 * audioStorage.js
 * ---------------
 * Lightweight IndexedDB wrapper to provide a robust fallback
 * for storing custom alert audio when cloud uploads fail.
 */

const DB_NAME = "FoodWorldAudioDB";
const STORE_NAME = "audioBlobs";
const DB_VERSION = 1;

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export const saveAudioToLocalDB = async (key, blob) => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, key);

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (err) {
    console.error("IndexedDB Save Error:", err);
    throw err;
  }
};

export const getAudioFromLocalDB = async (key) => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve(null);
        return;
      }
      
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (err) {
    console.error("IndexedDB Get Error:", err);
    throw err;
  }
};
