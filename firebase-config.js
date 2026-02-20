// firebase-config.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

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
export const db = getDatabase(app);
export const auth = getAuth(app);

// Anonymous authentication for multiplayer
export const signInUser = () => signInAnonymously(auth);
