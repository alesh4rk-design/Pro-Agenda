// Configuração do Firebase — projeto: central-agenda-be7f4
// (Console Firebase > Configurações do projeto > Seus apps > Config)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, orderBy, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCL-OOp1EviNVxblPCHbk6zJV62WVb0Bq8",
  authDomain: "central-agenda-be7f4.firebaseapp.com",
  projectId: "central-agenda-be7f4",
  storageBucket: "central-agenda-be7f4.firebasestorage.app",
  messagingSenderId: "265434071992",
  appId: "1:265434071992:web:851a80f7d9d5e0f17c454d"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

try { await enableIndexedDbPersistence(db); } catch (e) { /* múltiplas abas ou navegador sem suporte: ok ignorar */ }

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy
};
