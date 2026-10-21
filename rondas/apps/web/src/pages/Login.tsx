import { signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { auth, firebaseConfigured } from "../lib/firebase";
import { useOnline } from "../lib/hooks";

export function authErrorMessage(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "E-mail ou senha incorretos.";
    case "auth/user-disabled":
      return "Seu acesso está bloqueado. Procure o administrador.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "auth/network-request-failed":
      return "Sem conexão com a internet.";
    default:
      return "Não foi possível entrar. Tente novamente.";
  }
}

export function LoginPage({ systemName }: { systemName: string }) {
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
    } catch (err) {
      setErro(authErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={entrar} noValidate>
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>{systemName}</h1>
        <p className="muted">Acesso individual. Não compartilhe sua senha.</p>
        {!firebaseConfigured && (
          <p className="alert alert-warn">Firebase não configurado. Veja apps/web/.env.example.</p>
        )}
        {!online && <p className="alert alert-warn">Sem conexão. É preciso internet para entrar.</p>}
        <label>
          E-mail
          <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <p className="alert alert-error" role="alert">{erro}</p>}
        <button className="btn btn-primary btn-lg" disabled={enviando || !email || !senha}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        <Link to="/recuperar-senha" className="link-center">Esqueci minha senha</Link>
      </form>
    </main>
  );
}
