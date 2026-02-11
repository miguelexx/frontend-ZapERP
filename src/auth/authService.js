import http from "../api/http"

// LOGIN
export async function login(email, senha) {
  const { data } = await http.post("/usuarios/login", {
    email,
    senha,
  })

  return data // { token, usuario }
}
