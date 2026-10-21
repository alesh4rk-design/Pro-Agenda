import { sendPasswordResetEmail } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/firebase";

export function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setEnviado(true);
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : "";
      if (code === "auth/user-not-found") setEnviado(true); // não revela se o e-mail existe
      else if (code === "auth/network-request-failed") setErro("Sem conexão com a internet.");
      else if (code === "auth/invalid-email") setErro("E-mail inválido.");
      else setErro("Não foi possível enviar agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={enviar}>
        <h1>Recuperar senha</h1>
        {enviado ? (
          <p className="alert alert-ok">
            Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Verifique também a caixa de spam.
          </p>
        ) : (
          <>
            <p className="muted">Informe o e-mail usado no acesso. Enviaremos um link para definir uma nova senha.</p>
            <label>
              E-mail
              <input type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {erro && <p className="alert alert-error" role="alert">{erro}</p>}
            <button className="btn btn-primary btn-lg" disabled={enviando || !email}>
              {enviando ? "Enviando…" : "Enviar link"}
            </button>
          </>
        )}
        <Link to="/" className="link-center">Voltar ao login</Link>
      </form>
    </main>
  );
}
