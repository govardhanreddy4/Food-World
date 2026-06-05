// Import Firebase Compat scripts for Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

// Extract config from URL search params (passed during registration to avoid hardcoding secrets)
const urlParams = new URLSearchParams(location.search);

const firebaseConfig = {
  apiKey: urlParams.get('apiKey'),
  projectId: urlParams.get('projectId'),
  messagingSenderId: urlParams.get('messagingSenderId'),
  appId: urlParams.get('appId'),
};

// Initialize Firebase App
if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Background message handler
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Parse the payload depending on how your backend constructs it
    const notificationTitle = payload.notification?.title || payload.data?.title || 'New Order Alert';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'A new order has been placed.',
      icon: '/favicon.svg', // Assuming there's a favicon.svg
      data: payload.data, // pass along the data
      // Web Push standard vibrate pattern
      vibrate: [200, 100, 200, 100, 200],
      // Required to wake up the system native OS notifications
      requireInteraction: true
    };

    // 1. Trigger the native system notification
    self.registration.showNotification(notificationTitle, notificationOptions);

    // 2. Broadcast to all open clients (UI threads) to trigger the custom AudioController ringtone
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        // Send a postMessage to wake up the UI thread's AudioController
        client.postMessage({
          type: 'FCM_BACKGROUND_MESSAGE',
          payload: payload
        });
      });
    });
  });
}

// Ensure the SW updates immediately when changed
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  // Focus or open the window when notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
