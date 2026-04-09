import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA0NwZrmkfcSSFOHx8-YYcOA-QkTWnFQwI",
  authDomain: "kadal-yatrii.firebaseapp.com",
  databaseURL: "https://kadal-yatrii-default-rtdb.firebaseio.com",
  projectId: "kadal-yatrii",
  storageBucket: "kadal-yatrii.firebasestorage.app",
  messagingSenderId: "1051381852163",
  appId: "1:1051381852163:web:ab1ab08459f8b1be98c636",
  measurementId: "G-6JVDLJWHM1"
};

// Initialize Firebase (SSR safe)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Analytics if supported (client-side only)
if (typeof window !== "undefined") {
  isSupported().then((supported: boolean) => {
    if (supported) {
      getAnalytics(app);
    }
  });
}

export { app, db };
