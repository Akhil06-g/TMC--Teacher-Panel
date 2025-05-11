import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Login function
async function login(email, password) {
    console.log(`Attempting login for: ${email}`);
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Login error:", error);
        throw error;
    }
}

// Register function
async function register(email, password) {
    console.log(`Attempting registration for: ${email}`);
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Registration error:", error);
        throw error;
    }
}

// Logout function
async function logout() {
    console.log("Logging out");
    try {
        await signOut(auth);
        return true;
    } catch (error) {
        console.error("Logout error:", error);
        throw error;
    }
}

// Get current user
function getCurrentUser() {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        }, reject);
    });
}

// Get fresh token
async function getFreshToken(user) {
    if (!user) {
        throw new Error("No user provided for token refresh");
    }
    try {
        const token = await user.getIdToken(true);
        return token;
    } catch (error) {
        console.error("Error refreshing token:", error);
        throw error;
    }
}

export { app, auth, login, register, logout, getCurrentUser, getFreshToken };
