import { BrowserRouter, Route, Routes } from "react-router";
import { ProvedorDados, useDados } from "./dados";
import { Layout } from "./componentes/Layout";
import { Login } from "./paginas/Login";
import { Painel } from "./paginas/Painel";
import { Animais } from "./paginas/Animais";
import { Ficha } from "./paginas/Ficha";
import { NovoAnimal } from "./paginas/NovoAnimal";
import { Pesar } from "./paginas/Pesar";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";

function Portao() {
  const { usuario, vinculo, carregando } = useDados();
  if (usuario === null) return <Login />;
  if (carregando) return <p className="carregando">Carregando…</p>;
  if (!vinculo || !vinculo.ativo) {
    // RF-01: usuário sem vínculo ou inativo não acessa dados.
    return (
      <div className="login">
        <p className="erro">
          {vinculo ? "Sua conta está desativada nesta propriedade." : "Sua conta não está vinculada a nenhuma propriedade."}
        </p>
        <button className="link" onClick={() => signOut(auth)}>
          Sair
        </button>
      </div>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Painel />} />
        <Route path="animais" element={<Animais />} />
        <Route path="animais/novo" element={<NovoAnimal />} />
        <Route path="animais/:id" element={<Ficha />} />
        <Route path="pesar" element={<Pesar />} />
        <Route path="*" element={<Painel />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ProvedorDados>
        <Portao />
      </ProvedorDados>
    </BrowserRouter>
  );
}
