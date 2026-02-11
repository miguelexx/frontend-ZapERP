import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { criarComunidade } from "../chats/chatService";

export default function NovaComunidade() {
  const [nome, setNome] = useState("");
  const navigate = useNavigate();

  async function salvar(e) {
    e.preventDefault();

    await criarComunidade(nome);

    navigate("/atendimento");
  }

  return (
    <div className="page">
      <h2>Nova comunidade</h2>

      <form onSubmit={salvar}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da comunidade"
        />
        <button>Criar</button>
      </form>
    </div>
  );
}
