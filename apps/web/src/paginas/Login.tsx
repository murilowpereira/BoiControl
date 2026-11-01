import { useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { auth } from "../firebase";

export function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Mensagem única: não revelar se o e-mail existe (seção 9.1).
      setErro(
        code === "auth/too-many-requests"
          ? "Muitas tentativas. Aguarde alguns minutos."
          : code === "auth/network-request-failed"
            ? "Sem conexão. O primeiro acesso precisa de internet."
            : "E-mail ou senha incorretos.",
      );
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Login com a conta Google. O acesso continua dependendo do vínculo com a propriedade
   * (criado pelo ADMIN com scripts/adicionar-membro.ts usando o mesmo e-mail).
   */
  async function entrarComGoogle() {
    setErro("");
    setAviso("");
    setEnviando(true);
    const provedor = new GoogleAuthProvider();
    provedor.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provedor);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-environment") {
        // Aparelhos que bloqueiam a janela do Google: troca a página inteira.
        await signInWithRedirect(auth, provedor);
        return;
      }
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setErro(
          code === "auth/network-request-failed"
            ? "Sem conexão. O primeiro acesso precisa de internet."
            : code === "auth/account-exists-with-different-credential"
              ? "Este e-mail já entra com senha. Use o e-mail e a senha acima."
              : "Não foi possível entrar com o Google. Tente novamente.",
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  async function recuperar() {
    setErro("");
    if (!email.trim()) {
      setErro("Informe o e-mail para recuperar o acesso.");
      return;
    }
    await sendPasswordResetEmail(auth, email.trim()).catch(() => undefined);
    setAviso("Se o e-mail estiver cadastrado, você receberá as instruções.");
  }

  return (
    <div className="login">
      <h1>BoiControl</h1>
      <form onSubmit={entrar} className="cartao">
        <label>
          E-mail
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>
        {erro && <p className="erro">{erro}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
        <button className="primario" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        <button type="button" className="link" onClick={recuperar}>
          Esqueci minha senha
        </button>
      </form>
      <div className="cartao">
        <button type="button" className="google" onClick={entrarComGoogle} disabled={enviando}>
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
            <path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Entrar com Google
        </button>
      </div>
    </div>
  );
}
