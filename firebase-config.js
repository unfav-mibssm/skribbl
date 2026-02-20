import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, remove, onDisconnect, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAY7hSDaaBh71z3k2PXj3s93uxk3AF3Mvs",
    authDomain: "mini-skribbl.firebaseapp.com",
    databaseURL: "https://mini-skribbl-default-rtdb.firebaseio.com",
    projectId: "mini-skribbl",
    storageBucket: "mini-skribbl.firebasestorage.app",
    messagingSenderId: "423970942237",
    appId: "1:423970942237:web:ac3853dab889c0fe3305f4"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export function initAuth() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                resolve(user);
            } else {
                signInAnonymously(auth)
                    .then((userCredential) => resolve(userCredential.user))
                    .catch((error) => reject(error));
            }
        });
    });
}

export { db, auth, ref, set, onValue, push, update, remove, onDisconnect, serverTimestamp, get };
