import { signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { loginIdentifierToEmail } from "@rondas/shared";
import { auth, firebaseConfigured } from "../lib/firebase";
import { useOnline } from "../lib/hooks";

export function authErrorMessage(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "Login ou senha incorretos.";
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
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, loginIdentifierToEmail(login), senha);
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
        <p className="muted">Entre com o login fornecido pelo administrador da empresa.</p>
        {!firebaseConfigured && (
          <p className="alert alert-warn">Firebase não configurado. Veja apps/web/.env.example.</p>
        )}
        {!online && <p className="alert alert-warn">Sem conexão. É preciso internet para entrar.</p>}
        <label>
          Login do posto ou e-mail
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <p className="alert alert-error" role="alert">{erro}</p>}
        <button className="btn btn-primary btn-lg" disabled={enviando || !login || !senha}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        <Link to="/recuperar-senha" className="link-center">Esqueci minha senha</Link>
        <p className="muted small center">Acesso do posto: a senha é definida pelo administrador da empresa.</p>
      </form>
    </main>
  );
}
