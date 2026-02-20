// firebase-config.js - Firebase configuration for Skribbl.io
// Using compat SDK to match the HTML script tags

const firebaseConfig = {
    apiKey: "AIzaSyAY7hSDaaBh71z3k2PXj3s93uxk3AF3Mvs",
    authDomain: "mini-skribbl.firebaseapp.com",
    databaseURL: "https://mini-skribbl-default-rtdb.firebaseio.com",
    projectId: "mini-skribbl",
    storageBucket: "mini-skribbl.firebasestorage.app",
    messagingSenderId: "423970942237",
    appId: "1:423970942237:web:ac3853dab889c0fe3305f4"
};

// Initialize Firebase (compat version - no import needed)
firebase.initializeApp(firebaseConfig);

// Get database reference for global use
const database = firebase.database();

// Console log to confirm connection
console.log("🔥 Firebase connected successfully!");
