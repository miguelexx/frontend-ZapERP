import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { criarContato } from "../chats/chatService";

export default function NovoContato() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const navigate = useNavigate();

  async function salvar(e) {
    e.preventDefault();
    await criarContato(nome, telefone);
    navigate("/atendimento");
  }

  return (
    <div className="page">

      <div className="card">

        {/* botão fechar */}
        <button
          type="button"
          className="close-btn"
          onClick={() => navigate(-1)}
        >
          ×
        </button>

        <h2>Novo contato</h2>

        <form onSubmit={salvar}>
          <input
            placeholder="Nome"
            value={nome}
            onChange={e => setNome(e.target.value)}
          />

          <input
            placeholder="Telefone"
            value={telefone}
            onChange={e => setTelefone(e.target.value)}
          />

          <button>Criar</button>
        </form>

      </div>
    </div>
  );
}
