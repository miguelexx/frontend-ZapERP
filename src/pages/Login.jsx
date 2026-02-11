import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../auth/authStore"

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [erro, setErro] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro("")
    setLoading(true)

    try {
      await login(email, senha)

      const raw = localStorage.getItem("zap_erp_auth")
      console.log("✅ zap_erp_auth salvo:", raw)

      navigate("/", { replace: true })
    } catch (err) {
      console.error("ERRO LOGIN:", err)
      setErro(err?.response?.data?.error || err?.message || "Falha no login")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form
        onSubmit={handleSubmit}
        className="login-form"
      >
        <h2 style={{ margin: 0, marginBottom: 12 }}>Zap ERP • Login</h2>

        <label>E-mail</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
        />

        <label>Senha</label>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="••••••••"
        />

        <button type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>

        {erro && <div style={{ marginTop: 10, color: "crimson" }}>{erro}</div>}
      </form>
    </div>
  )
}
