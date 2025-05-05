import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA05xyAudLNPrSI1vpG_81LCuJwQsrCYfk",
  authDomain: "edutech--teacher-panel.firebaseapp.com",
  projectId: "edutech--teacher-panel",
  storageBucket: "edutech--teacher-panel.firebasestorage.app",
  messagingSenderId: "468672525872",
  appId: "1:468672525872:web:bf68a24225274fc8d75ff5",
  measurementId: "G-2NZ5W8M2D8",
  databaseURL: "https://edutech--teacher-panel-default-rtdb.firebaseio.com"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
console.log("Firebase initialized with project:", firebaseConfig.projectId, "Database URL:", firebaseConfig.databaseURL);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);

// Authentication Functions
export function login(email, password) {
    console.log("Attempting login for:", email);
    return signInWithEmailAndPassword(auth, email, password);
}

export function register(email, password) {
    console.log("Attempting registration for:", email);
    return createUserWithEmailAndPassword(auth, email, password);
}

export function logout() {
    console.log("Logging out");
    return signOut(auth);
}

export async function getFreshToken(user) {
    if (!user) {
        console.error("No user provided for token refresh");
        return null;
    }
    try {
        const token = await user.getIdToken(true); // Force refresh
        console.log("Fresh ID Token (first 10 chars):", token.substring(0, 10) + "...");
        return token;
    } catch (error) {
        console.error("Error refreshing ID token:", error);
        return null;
    }
}

export function onAuthChange(callback) {
    onAuthStateChanged(auth, async user => {
        console.log("Auth state changed:", user ? { uid: user.uid, email: user.email } : null);
        if (user) {
            await getFreshToken(user);
        }
        callback(user);
    });
}