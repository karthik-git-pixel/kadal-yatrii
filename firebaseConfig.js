import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };

