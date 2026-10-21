import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const env = import.meta.env;

export const firebaseConfigured = !!env.VITE_FIREBASE_PROJECT_ID && !!env.VITE_FIREBASE_API_KEY;

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "nao-configurado",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || "nao-configurado",
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
auth.languageCode = "pt-BR";

// Cache local persistente: permite consultar dados já carregados sem conexão.
// Escritas não passam por aqui (são feitas pelo backend).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
