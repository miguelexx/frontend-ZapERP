import { create } from 'zustand'
import { getEmpresa } from '../api/configService'
import { setCompanyTimezone, clearCompanyTimezone } from '../utils/companyTimezone'

/**
 * Store global com dados básicos da empresa logada.
 * Carregado uma vez após autenticação; atualizado quando o admin salva configurações.
 *
 * `empresa.timezone` vem do estado (UF) escolhido em Configurações → Geral e alimenta o
 * formatador único de horários (utils/companyTimezone). Ponto único de propagação: quem
 * atualiza a empresa não precisa saber do fuso.
 */
export const useEmpresaStore = create((set, get) => ({
  empresa: null,
  loaded: false,

  fetchEmpresa: async () => {
    if (get().loaded) return
    try {
      const data = await getEmpresa()
      setCompanyTimezone(data?.timezone)
      set({ empresa: data, loaded: true })
    } catch (_) {
      set({ loaded: true })
    }
  },

  setEmpresa: (empresa) => {
    setCompanyTimezone(empresa?.timezone)
    set({ empresa, loaded: true })
  },

  setLogoUrl: (logo_url) =>
    set((s) => ({
      empresa: s.empresa ? { ...s.empresa, logo_url } : { logo_url },
    })),

  clear: () => {
    // Logout/troca de empresa: o fuso guardado é da empresa anterior.
    clearCompanyTimezone()
    set({ empresa: null, loaded: false })
  },
}))
