import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { criarGrupo } from "../chats/chatService";

export default function NovoGrupo() {
  const [nome, setNome] = useState("");
  const navigate = useNavigate();

  async function salvar(e) {
    e.preventDefault();

    await criarGrupo(nome);

    // voltar pra lista
    navigate("/atendimento");
  }

  return (
    <div className="page">
      <h2>Novo grupo</h2>

      <form onSubmit={salvar}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do grupo"
        />
        <button>Criar</button>
      </form>
    </div>
  );
}
