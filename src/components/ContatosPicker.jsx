import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconUsers, IconX } from "@tabler/icons-react";
import { getClientesComTotal } from "../api/configService";
import "./contatosPicker.css";

const PAGE = 25;

function soDigitos(s) {
  return String(s || "").replace(/\D/g, "");
}
function parseNumeros(texto) {
  return String(texto || "")
    .split(/[\s,;]+/)
    .map((s) => soDigitos(s))
    .filter((d) => d.length >= 10);
}
function maskPhone(tel) {
  const d = soDigitos(tel);
  if (d.length === 13) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return tel;
}

/**
 * Seletor de contatos da base (busca + paginação + seleção que sobrevive à paginação)
 * e colagem de números em massa. Emite onPhonesChange(phones[], { contatos, colados }).
 * `alreadyIn` (Set de dígitos) marca quem já está no grupo.
 */
export default function ContatosPicker({ onPhonesChange, alreadyIn, maxHeight = 260 }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(() => new Map()); // id -> { id, nome, telefone, foto }
  const [paste, setPaste] = useState("");
  const debounceRef = useRef(null);
  const seqRef = useRef(0);

  const jaSet = useMemo(() => (alreadyIn instanceof Set ? alreadyIn : new Set()), [alreadyIn]);

  const fetchPage = useCallback(async (palavra, pg) => {
    const reqId = ++seqRef.current;
    setLoading(true);
    try {
      const { clientes, total: t } = await getClientesComTotal({ palavra: palavra || undefined, page: pg, limit: PAGE });
      if (reqId !== seqRef.current) return;
      setRows(Array.isArray(clientes) ? clientes : []);
      setTotal(Number(t) || 0);
    } catch {
      if (reqId !== seqRef.current) return;
      setRows([]); setTotal(0);
    } finally {
      if (reqId === seqRef.current) setLoading(false);
    }
  }, []);

  // busca debounced ao digitar; reseta página
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetchPage(search, 1); }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [search, fetchPage]);

  useEffect(() => { fetchPage(search, page); /* eslint-disable-next-line */ }, [page]);

  // números finais = telefones selecionados + colados, dedup por dígitos
  const colados = useMemo(() => parseNumeros(paste), [paste]);
  const phones = useMemo(() => {
    const set = new Set();
    for (const c of selected.values()) { const d = soDigitos(c.telefone); if (d) set.add(d); }
    for (const d of colados) set.add(d);
    return [...set];
  }, [selected, colados]);

  useEffect(() => {
    onPhonesChange?.(phones, { contatos: [...selected.values()], colados });
  }, [phones]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  function toggle(c) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, { id: c.id, nome: c.nome, telefone: c.telefone, foto: c.foto_perfil });
      return next;
    });
  }
  function selecionarPagina() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of rows) {
        const d = soDigitos(c.telefone);
        if (!c.telefone || jaSet.has(d)) continue;
        if (!next.has(c.id)) next.set(c.id, { id: c.id, nome: c.nome, telefone: c.telefone, foto: c.foto_perfil });
      }
      return next;
    });
  }
  function limpar() { setSelected(new Map()); setPaste(""); }

  return (
    <div className="cp-wrap">
      <div className="cp-searchRow">
        <span className="cp-searchIcon"><IconSearch size={16} /></span>
        <input
          className="cp-input"
          placeholder="Buscar contato por nome ou telefone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="cp-link" onClick={selecionarPagina} disabled={!rows.length}>Selecionar página</button>
      </div>

      <div className="cp-list" style={{ maxHeight }}>
        {loading ? (
          <div className="cp-empty">Carregando…</div>
        ) : !rows.length ? (
          <div className="cp-empty">Nenhum contato encontrado.</div>
        ) : rows.map((c) => {
          const d = soDigitos(c.telefone);
          const ja = jaSet.has(d);
          const checked = selected.has(c.id);
          return (
            <label key={c.id} className={`cp-row ${ja ? "is-disabled" : ""}`}>
              <input type="checkbox" className="cp-check" checked={checked} disabled={ja} onChange={() => toggle(c)} />
              <span className="cp-avatar">
                {c.foto_perfil ? <img src={c.foto_perfil} alt="" /> : <IconUsers size={16} />}
              </span>
              <span className="cp-rowMeta">
                <span className="cp-rowName">{c.nome || maskPhone(c.telefone)}</span>
                <span className="cp-rowSub">{maskPhone(c.telefone)}{ja ? " · já no grupo" : ""}</span>
              </span>
            </label>
          );
        })}
      </div>

      {total > PAGE ? (
        <div className="cp-pager">
          <button type="button" className="cp-link" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Anterior</button>
          <span className="cp-pageInfo">Página {page} de {totalPages} · {total} contatos</span>
          <button type="button" className="cp-link" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima →</button>
        </div>
      ) : null}

      <details className="cp-paste">
        <summary>Ou colar números em massa (um por linha)</summary>
        <textarea
          className="cp-textarea"
          placeholder={"5511999999999\n5511888888888"}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <span className="cp-hint">{colados.length} número(s) colado(s) válido(s).</span>
      </details>

      <div className="cp-foot">
        <span className="cp-count"><b>{phones.length}</b> destinatário(s) selecionado(s)</span>
        {phones.length ? <button type="button" className="cp-clear" onClick={limpar}><IconX size={14} /> Limpar</button> : null}
      </div>
    </div>
  );
}
