import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconX, IconCheck, IconClipboardText, IconUserOff } from "@tabler/icons-react";
import { getClientesComTotal } from "../api/configService";
import "./contatosPicker.css";

const PAGE = 25;
const CHIPS_VISIVEIS = 12;

function soDigitos(s) {
  return String(s || "").replace(/\D/g, "");
}

// Iniciais do nome — evitamos carregar foto_perfil (URLs do WhatsApp/Facebook expiram e
// devolvem 403, enchendo o console de erro e mostrando imagem quebrada numa lista grande).
function iniciais(nome, telefone) {
  const base = String(nome || "").trim();
  if (base) {
    const p = base.split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }
  const d = soDigitos(telefone);
  return d.slice(-2) || "#";
}
// Tom do avatar estável por contato (6 tons), para a lista não virar um bloco de uma cor só.
function tomAvatar(chave) {
  const s = String(chave || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 6;
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
 * `showSelectedChips` mostra os escolhidos como chips removíveis acima da lista.
 */
export default function ContatosPicker({ onPhonesChange, alreadyIn, maxHeight = 260, showSelectedChips = false }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(() => new Map()); // id -> { id, nome, telefone, foto }
  const [paste, setPaste] = useState("");
  const [showAllChips, setShowAllChips] = useState(false);
  const seqRef = useRef(0);
  const listRef = useRef(null);

  const jaSet = useMemo(() => (alreadyIn instanceof Set ? alreadyIn : new Set()), [alreadyIn]);

  // Busca debounced: só a palavra "assentada" (query) dispara GET. Antes, montar a tela e cada
  // busca com página ≠ 1 disparavam DOIS GETs iguais (efeito da página + efeito do debounce).
  useEffect(() => {
    if (search === query) return undefined;
    const t = setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search, query]);

  const fetchPage = useCallback(async (palavra, pg) => {
    const reqId = ++seqRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const { clientes, total: t } = await getClientesComTotal({ palavra: palavra || undefined, page: pg, limit: PAGE });
      if (reqId !== seqRef.current) return;
      setRows(Array.isArray(clientes) ? clientes : []);
      setTotal(Number(t) || 0);
    } catch {
      if (reqId !== seqRef.current) return;
      setRows([]); setTotal(0); setFailed(true);
    } finally {
      if (reqId === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(query, page);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query, page, fetchPage]);

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

  const selecionavel = useCallback(
    (c) => Boolean(soDigitos(c?.telefone)) && !jaSet.has(soDigitos(c?.telefone)),
    [jaSet]
  );

  function toggle(c) {
    if (!selecionavel(c) && !selected.has(c.id)) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, { id: c.id, nome: c.nome, telefone: c.telefone, foto: c.foto_perfil });
      return next;
    });
  }
  function remover(id) {
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }
  const selecionaveisDaPagina = rows.filter(selecionavel);
  const paginaToda = selecionaveisDaPagina.length > 0 && selecionaveisDaPagina.every((c) => selected.has(c.id));
  function alternarPagina() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (paginaToda) {
        for (const c of selecionaveisDaPagina) next.delete(c.id);
      } else {
        for (const c of selecionaveisDaPagina) {
          if (!next.has(c.id)) next.set(c.id, { id: c.id, nome: c.nome, telefone: c.telefone, foto: c.foto_perfil });
        }
      }
      return next;
    });
  }
  function limpar() { setSelected(new Map()); setPaste(""); setShowAllChips(false); }

  const escolhidos = [...selected.values()];
  const chips = showAllChips ? escolhidos : escolhidos.slice(0, CHIPS_VISIVEIS);
  const ocultos = escolhidos.length - chips.length;

  let corpo;
  if (loading && !rows.length) {
    corpo = (
      <div className="cp-skeleton" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="cp-skelRow">
            <span className="cp-skelDot" />
            <span className="cp-skelLines"><span /><span /></span>
          </div>
        ))}
      </div>
    );
  } else if (failed) {
    corpo = (
      <div className="cp-empty">
        <span>Não foi possível carregar os contatos.</span>
        <button type="button" className="cp-link" onClick={() => fetchPage(query, page)}>Tentar de novo</button>
      </div>
    );
  } else if (!rows.length) {
    corpo = (
      <div className="cp-empty">
        <IconUserOff size={22} stroke={1.5} aria-hidden="true" />
        <span>{query ? `Nenhum contato para “${query}”.` : "Nenhum contato na sua base ainda."}</span>
        {query ? <span className="cp-emptyHint">Dica: cole os números abaixo.</span> : null}
      </div>
    );
  } else {
    corpo = rows.map((c) => {
      const d = soDigitos(c.telefone);
      const ja = jaSet.has(d);
      const semTel = !d;
      const desabilitado = ja || semTel;
      const checked = selected.has(c.id);
      return (
        <label
          key={c.id}
          className={`cp-row${desabilitado ? " is-disabled" : ""}${checked ? " is-selected" : ""}`}
        >
          <input
            type="checkbox"
            className="cp-check"
            checked={checked}
            disabled={desabilitado && !checked}
            onChange={() => toggle(c)}
          />
          <span className="cp-avatar" data-tone={tomAvatar(c.id ?? d)}>
            {checked ? <IconCheck size={16} stroke={2.4} aria-hidden="true" /> : iniciais(c.nome, c.telefone)}
          </span>
          <span className="cp-rowMeta">
            <span className="cp-rowName">{c.nome || maskPhone(c.telefone) || "Sem nome"}</span>
            <span className="cp-rowSub">
              {semTel ? "Sem telefone cadastrado" : maskPhone(c.telefone)}
              {ja ? " · já no grupo" : ""}
            </span>
          </span>
        </label>
      );
    });
  }

  return (
    <div className="cp-wrap">
      {showSelectedChips && (escolhidos.length > 0 || colados.length > 0) ? (
        <div className="cp-chips" aria-label="Participantes escolhidos">
          {chips.map((c) => (
            <span key={c.id} className="cp-chip">
              <span className="cp-chipAvatar" data-tone={tomAvatar(c.id)}>{iniciais(c.nome, c.telefone)}</span>
              <span className="cp-chipName">{c.nome || maskPhone(c.telefone)}</span>
              <button
                type="button"
                className="cp-chipX"
                onClick={() => remover(c.id)}
                aria-label={`Remover ${c.nome || maskPhone(c.telefone)}`}
              >
                <IconX size={12} stroke={2.2} />
              </button>
            </span>
          ))}
          {ocultos > 0 ? (
            <button type="button" className="cp-chip cp-chip--more" onClick={() => setShowAllChips(true)}>
              +{ocultos}
            </button>
          ) : null}
          {colados.length > 0 ? (
            <span className="cp-chip cp-chip--paste">
              <IconClipboardText size={13} stroke={1.8} aria-hidden="true" />
              {colados.length} colado{colados.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="cp-searchRow">
        <label className="cp-search">
          <IconSearch size={16} stroke={1.8} className="cp-searchIcon" aria-hidden="true" />
          <input
            className="cp-input"
            type="search"
            placeholder="Buscar contato"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar contato"
            enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          />
          {search ? (
            <button type="button" className="cp-searchClear" onClick={() => setSearch("")} aria-label="Limpar busca">
              <IconX size={14} stroke={2} />
            </button>
          ) : null}
        </label>
        <button type="button" className="cp-link" onClick={alternarPagina} disabled={!selecionaveisDaPagina.length}>
          {paginaToda ? "Desmarcar página" : "Selecionar página"}
        </button>
      </div>

      <div
        ref={listRef}
        className={`cp-list${loading && rows.length ? " is-loading" : ""}`}
        style={{ maxHeight }}
        aria-busy={loading || undefined}
      >
        {corpo}
      </div>

      {total > PAGE ? (
        <div className="cp-pager">
          <button type="button" className="cp-link" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Anterior</button>
          <span className="cp-pageInfo">Página {page} de {totalPages} · {total} contatos</span>
          <button type="button" className="cp-link" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima →</button>
        </div>
      ) : null}

      <details className="cp-paste">
        <summary>Colar números em massa</summary>
        <textarea
          className="cp-textarea"
          placeholder={"Um por linha, com DDD\n5511999999999\n5511888888888"}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <span className="cp-hint">
          {paste.trim()
            ? `${colados.length} número(s) válido(s) reconhecido(s).`
            : "Aceita vírgula, ponto e vírgula ou quebra de linha."}
        </span>
      </details>

      <div className="cp-foot">
        <span className="cp-count"><b>{phones.length}</b> {phones.length === 1 ? "participante selecionado" : "participantes selecionados"}</span>
        {phones.length ? <button type="button" className="cp-clear" onClick={limpar}><IconX size={14} /> Limpar</button> : null}
      </div>
    </div>
  );
}
