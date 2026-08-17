// Camada genérica de acesso ao Firestore, sempre escopada em users/{uid}/{colecao}
import {
  db, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy
} from "./firebase.js";
import { getUsuario } from "./auth.js";

function refColecao(nome) {
  const user = getUsuario();
  if (!user) throw new Error("Usuário não autenticado.");
  return collection(db, "users", user.uid, nome);
}

export async function listarTudo(nome, campoOrdem = "criadoEm") {
  const q = query(refColecao(nome), orderBy(campoOrdem, "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function buscarPorId(nome, id) {
  const snap = await getDoc(doc(db, ...caminho(nome, id)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function criar(nome, dados) {
  const agora = new Date().toISOString();
  const ref = await addDoc(refColecao(nome), { ...dados, criadoEm: agora, atualizadoEm: agora });
  return ref.id;
}

export async function atualizar(nome, id, dados) {
  await updateDoc(doc(db, ...caminho(nome, id)), { ...dados, atualizadoEm: new Date().toISOString() });
}

export async function remover(nome, id) {
  await deleteDoc(doc(db, ...caminho(nome, id)));
}

function caminho(nome, id) {
  const user = getUsuario();
  return ["users", user.uid, nome, id];
}
