"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = exports.storage = exports.db = void 0;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const app_1 = require("firebase/app");
const auth_1 = require("firebase/auth");
const firestore_1 = require("firebase/firestore");
const storage_1 = require("firebase/storage");
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
const app = (0, app_1.initializeApp)(firebaseConfig);
// Ensure auth persists across app restarts (AsyncStorage)
let auth;
try {
    // Dynamically require to avoid type issues if the RN entrypoint isn't typed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initializeAuth, getReactNativePersistence } = require("firebase/auth");
    exports.auth = auth = initializeAuth(app, {
        persistence: getReactNativePersistence(async_storage_1.default),
    });
}
catch (e) {
    // If already initialized (hot reload), fallback to getAuth
    exports.auth = auth = (0, auth_1.getAuth)(app);
}
exports.db = (0, firestore_1.getFirestore)(app);
exports.storage = (0, storage_1.getStorage)(app);
