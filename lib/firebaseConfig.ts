import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDl9SRvdos7LWpXwo9B8ENcwiaZgH3-7jk",
  authDomain: "zonerunner-e6cd8.firebaseapp.com",
  projectId: "zonerunner-e6cd8",
  // Use the appspot bucket domain for Firebase Storage
  storageBucket: "zonerunner-e6cd8.appspot.com",
  messagingSenderId: "74145313966",
  appId: "1:74145313966:web:5f64c454a7051924f8e93f",
  measurementId: "G-CLRYWWPX1Q"
};

const app = initializeApp(firebaseConfig);

// Ensure auth persists across app restarts (AsyncStorage)
let auth: Auth;
try {
  // Dynamically require to avoid type issues if the RN entrypoint isn't typed
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { initializeAuth, getReactNativePersistence } = require("firebase/auth");
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // If already initialized (hot reload), fallback to getAuth
  auth = getAuth(app);
}

export const db = getFirestore(app);
export const storage = getStorage(app);
export { auth };
