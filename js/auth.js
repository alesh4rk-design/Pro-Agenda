import {
  auth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "./firebase.js";

let usuarioAtual = null;
const ouvintes = [];

export function aoMudarAuth(cb) {
  ouvintes.push(cb);
  if (usuarioAtual !== undefined) cb(usuarioAtual);
}

onAuthStateChanged(auth, (user) => {
  usuarioAtual = user;
  ouvintes.forEach((cb) => cb(user));
});

export function getUsuario() {
  return usuarioAtual;
}

export async function entrar(email, senha) {
  await signInWithEmailAndPassword(auth, email, senha);
}

export async function criarConta(email, senha) {
  await createUserWithEmailAndPassword(auth, email, senha);
}

export async function sair() {
  await signOut(auth);
}
