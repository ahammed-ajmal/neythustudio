// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Your web app's Firebase configuration
// REPLACE these values with your actual Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyC-I7S3qj1mT9DH418ik4t71hft12QsmQ4",
    authDomain: "neythu-studio.firebaseapp.com",
    projectId: "neythu-studio",
    storageBucket: "neythu-studio.firebasestorage.app",
    messagingSenderId: "709706100513",
    appId: "1:709706100513:web:9a001e06316e51054d5860",
    measurementId: "G-FRC377LN47"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
