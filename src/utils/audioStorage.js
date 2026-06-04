export const AudioStorage = {
  async saveAudio(key, base64String) {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open("AudioStorageDB", 1);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("audioStore")) {
            db.createObjectStore("audioStore");
          }
        };
        request.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction("audioStore", "readwrite");
          const store = tx.objectStore("audioStore");
          store.put(base64String, key);
          tx.oncomplete = () => resolve();
          tx.onerror = (err) => reject(err);
        };
        request.onerror = (err) => reject(err);
      } catch (err) {
        reject(err);
      }
    });
  },
  async getAudio(key) {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open("AudioStorageDB", 1);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("audioStore")) {
            db.createObjectStore("audioStore");
          }
        };
        request.onsuccess = (e) => {
          const db = e.target.result;
          // If the store doesn't exist, we return null immediately
          if (!db.objectStoreNames.contains("audioStore")) {
            resolve(null);
            return;
          }
          const tx = db.transaction("audioStore", "readonly");
          const store = tx.objectStore("audioStore");
          const getReq = store.get(key);
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = (err) => reject(err);
        };
        request.onerror = (err) => reject(err);
      } catch (err) {
        reject(err);
      }
    });
  },
  async clearStorage() {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open("AudioStorageDB", 1);
        request.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("audioStore")) {
            resolve();
            return;
          }
          const tx = db.transaction("audioStore", "readwrite");
          const store = tx.objectStore("audioStore");
          store.clear();
          tx.oncomplete = () => resolve();
          tx.onerror = (err) => reject(err);
        };
        request.onerror = (err) => reject(err);
      } catch (err) {
        reject(err);
      }
    });
  }
};
