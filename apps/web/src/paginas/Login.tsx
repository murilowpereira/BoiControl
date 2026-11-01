import { useState, type FormEvent } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
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
    </div>
  );
}
