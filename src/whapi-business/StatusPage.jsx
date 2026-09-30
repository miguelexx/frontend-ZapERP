import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  IconAlertTriangle,
  IconClock,
  IconPhoto,
  IconRefresh,
  IconSend,
  IconTextCaption,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import {
  apiErrorMessage,
  enviarMidiaStatusWhatsapp,
  excluirStatusWhatsapp,
  listarStatusWhatsapp,
  publicarStatusWhatsapp,
} from "../api/whapiBusinessService";
import { useNotificationStore } from "../notifications/notificationStore";
import { whapiInstanceName } from "./WhapiBusinessLayout";

const CAPTION_MAX = 700;
const MAX_MEDIA_BYTES = 64 * 1024 * 1024; // 64 MB (imagem/vídeo do status)

// Cores de fundo (ARGB "#AARRGGBB" enviado à Whapi; css usa o RGB para a prévia).
const BACKGROUND_COLORS = [
  { css: "#128C7E", argb: "#FF128C7E", label: "Verde WhatsApp" },
  { css: "#0EA5E9", argb: "#FF0EA5E9", label: "Azul" },
  { css: "#6D28D9", argb: "#FF6D28D9", label: "Roxo" },
  { css: "#DB2777", argb: "#FFDB2777", label: "Rosa" },
  { css: "#DC2626", argb: "#FFDC2626", label: "Vermelho" },
  { css: "#EA580C", argb: "#FFEA580C", label: "Laranja" },
  { css: "#CA8A04", argb: "#FFCA8A04", label: "Âmbar" },
  { css: "#059669", argb: "#FF059669", label: "Esmeralda" },
  { css: "#0F172A", argb: "#FF0F172A", label: "Grafite" },
];

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|3gp|m4v)(\?|#|$)/i;

function mimeFromUrl(url) {
  const u = String(url || "").trim();
  if (IMAGE_EXT.test(u)) {
    const ext = u.match(IMAGE_EXT)?.[1]?.toLowerCase();
    if (ext === "jpg") return "image/jpeg";
    return `image/${ext}`;
  }
  if (VIDEO_EXT.test(u)) {
    const ext = u.match(VIDEO_EXT)?.[1]?.toLowerCase();
    return ext === "mov" ? "video/quicktime" : `video/${ext}`;
  }
  return "";
}

function isHttpUrl(value) {
  const v = String(value || "").trim();
  return /^https?:\/\//i.test(v);
}

/** Normaliza um item de status devolvido pela Whapi (formato varia por tipo). */
function normalizeStory(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const id = String(s.id || s.message_id || s.key?.id || "").trim();
  const ts = Number(s.timestamp || s.t || s.created_at || 0);
  const type = String(s.type || (s.image ? "image" : s.video ? "video" : "text")).toLowerCase();
  const caption =
    s.caption ||
    (typeof s.text === "string" ? s.text : s.text?.body) ||
    s.image?.caption ||
    s.video?.caption ||
    "";
  const image = s.image?.preview || s.image?.link || s.thumbnail || (type === "image" ? s.media?.link : "") || "";
  const video = s.video?.link || (type === "video" ? s.media?.link : "") || "";
  const bg = s.background_color || s.background || "";
  return { id, ts, type, caption: String(caption || ""), image: String(image || ""), video: String(video || ""), bg: String(bg || "") };
}

/** "#FF128C7E" ou 0xFF128C7E → "#128C7E" para uso em CSS. */
function argbToCss(argb) {
  const v = String(argb || "").trim();
  if (!v) return "";
  const hex = v.replace(/^#/, "").replace(/^0x/i, "");
  if (hex.length === 8) return `#${hex.slice(2)}`;
  if (hex.length === 6) return `#${hex}`;
  return isHttpUrl(v) ? "" : v;
}

function formatWhen(ts) {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  try {
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toLocaleString();
  }
}

function EmptyWhapiState({ loading }) {
  return (
    <div className="wb-empty-state">
      <span className="wb-empty-state__icon"><IconPhoto size={30} /></span>
      <h2>{loading ? "Buscando seus canais…" : "Conecte um canal Whapi"}</h2>
      <p>{loading ? "Isso leva apenas alguns segundos." : "O Status é exclusivo para instâncias Whapi cadastradas na empresa."}</p>
      {!loading ? <a href="/configuracoes?tab=whapi">Configurar Whapi</a> : null}
    </div>
  );
}

export default function StatusPage() {
  const { selectedId, selectedInstance, loadingInstances } = useOutletContext();
  const showToast = useNotificationStore((state) => state.showToast);

  const [mode, setMode] = useState("text");
  const [caption, setCaption] = useState("");
  const [bg, setBg] = useState(BACKGROUND_COLORS[0]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFilePreview, setMediaFilePreview] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const [stories, setStories] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const channelName = whapiInstanceName(selectedInstance);

  const loadStories = useCallback(
    async (signal) => {
      if (!selectedId) return;
      setLoadingList(true);
      setListError("");
      try {
        const list = await listarStatusWhatsapp(selectedId, { signal, silent: true });
        setStories(list.map(normalizeStory).sort((a, b) => (b.ts || 0) - (a.ts || 0)));
      } catch (requestError) {
        if (requestError?.name === "CanceledError" || requestError?.code === "ERR_CANCELED") return;
        setListError(apiErrorMessage(requestError, "Não foi possível carregar seus status."));
      } finally {
        if (!signal?.aborted) setLoadingList(false);
      }
    },
    [selectedId]
  );

  useEffect(() => {
    if (!selectedId) {
      setStories([]);
      return undefined;
    }
    const controller = new AbortController();
    loadStories(controller.signal);
    return () => controller.abort();
  }, [selectedId, loadStories]);

  // Revoga o object URL da prévia ao trocar/desmontar (evita vazamento de memória).
  useEffect(() => {
    return () => {
      if (mediaFilePreview) {
        try { URL.revokeObjectURL(mediaFilePreview); } catch {}
      }
    };
  }, [mediaFilePreview]);

  const previewIsImage = mediaFile
    ? String(mediaFile.type || "").startsWith("image/")
    : IMAGE_EXT.test(mediaUrl.trim());
  const previewSrc = mediaFile ? mediaFilePreview : mediaUrl.trim();

  function clearFile() {
    setMediaFile(null);
    setMediaFilePreview((current) => {
      if (current) { try { URL.revokeObjectURL(current); } catch {} }
      return "";
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const mime = String(file.type || "").toLowerCase();
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
      setError("Escolha uma imagem ou um vídeo.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setError("Arquivo muito grande (máx. 64 MB).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setError("");
    setMediaUrl("");
    setMediaFile(file);
    setMediaFilePreview((current) => {
      if (current) { try { URL.revokeObjectURL(current); } catch {} }
      return URL.createObjectURL(file);
    });
  }

  function resetComposer() {
    setCaption("");
    setMediaUrl("");
    clearFile();
    setError("");
  }

  async function handlePublish(event) {
    event.preventDefault();
    if (!selectedId || publishing) return;
    setError("");

    const text = caption.trim();
    const url = mediaUrl.trim();

    if (mode === "text" && !text) {
      setError("Escreva um texto para o status.");
      return;
    }
    if (mode === "media" && !mediaFile && !isHttpUrl(url)) {
      setError("Envie um arquivo ou informe a URL da imagem/vídeo (http:// ou https://).");
      return;
    }

    setPublishing(true);
    try {
      let payload;
      if (mode === "text") {
        payload = { caption: text, background_color: bg.argb, caption_color: "#FFFFFFFF" };
      } else if (mediaFile) {
        // 1) sobe o arquivo → referência de mídia da Whapi; 2) publica o status com ela.
        const uploaded = await enviarMidiaStatusWhatsapp(selectedId, mediaFile);
        payload = { media: uploaded.media };
        if (uploaded.mime_type) payload.mime_type = uploaded.mime_type;
        if (text) payload.caption = text;
      } else {
        payload = { media: url };
        if (text) payload.caption = text;
        const mime = mimeFromUrl(url);
        if (mime) payload.mime_type = mime;
      }

      await publicarStatusWhatsapp(selectedId, payload);
      showToast({
        type: "success",
        title: "Status publicado",
        message: "Seu status foi publicado no WhatsApp e some em 24 horas.",
      });
      resetComposer();
      // Dá um instante para a Whapi indexar o novo status antes de recarregar.
      setTimeout(() => loadStories(), 1200);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Não foi possível publicar o status."));
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete(story) {
    if (!selectedId || !story?.id || deletingId) return;
    if (!window.confirm("Remover este status do WhatsApp? Esta ação não pode ser desfeita.")) return;
    setDeletingId(story.id);
    try {
      await excluirStatusWhatsapp(selectedId, story.id);
      setStories((current) => current.filter((item) => item.id !== story.id));
      showToast({ type: "success", title: "Status removido", message: "O status foi removido do WhatsApp." });
    } catch (requestError) {
      showToast({
        type: "error",
        title: "Falha ao remover",
        message: apiErrorMessage(requestError, "Não foi possível remover o status."),
      });
    } finally {
      setDeletingId("");
    }
  }

  if (!selectedId) return <EmptyWhapiState loading={loadingInstances} />;

  const previewBg = bg.css;
  const captionCount = `${caption.length}/${CAPTION_MAX}`;

  return (
    <div className="wb-status-grid">
      <form className="wb-card wb-status-form" onSubmit={handlePublish}>
        <div className="wb-card-heading">
          <div>
            <span className="wb-section-kicker">Publicar status</span>
            <h2>Novo status</h2>
            <p>Publique no status do canal <strong>{channelName}</strong>. Todo status some após 24 horas.</p>
          </div>
        </div>

        <div className="wb-status-modes" role="tablist" aria-label="Tipo de status">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "text"}
            className={`wb-status-mode${mode === "text" ? " is-active" : ""}`}
            onClick={() => { setMode("text"); setError(""); }}
            disabled={publishing}
          >
            <IconTextCaption size={17} /> Texto
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "media"}
            className={`wb-status-mode${mode === "media" ? " is-active" : ""}`}
            onClick={() => { setMode("media"); setError(""); }}
            disabled={publishing}
          >
            <IconPhoto size={17} /> Imagem / Vídeo
          </button>
        </div>

        {error ? (
          <div className="wb-inline-alert wb-inline-alert--error" role="alert">
            <IconAlertTriangle size={16} /> <span>{error}</span>
          </div>
        ) : null}

        {mode === "media" ? (
          <div className="wb-field wb-field--full">
            <span className="wb-status-media-label"><IconPhoto size={16} /> Imagem ou vídeo</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={onFileChange}
              disabled={publishing}
              hidden
            />
            {mediaFile ? (
              <div className="wb-status-file">
                <IconPhoto size={16} />
                <span className="wb-status-file__name" title={mediaFile.name}>{mediaFile.name}</span>
                <button type="button" className="wb-icon-button" onClick={clearFile} disabled={publishing} aria-label="Remover arquivo" title="Remover">
                  <IconX size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="wb-status-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={publishing}
              >
                <IconUpload size={17} /> Enviar do computador
              </button>
            )}
            <div className="wb-status-or"><span>ou cole uma URL pública</span></div>
            <input
              type="url"
              value={mediaUrl}
              onChange={(event) => { setMediaUrl(event.target.value); if (event.target.value) clearFile(); }}
              placeholder="https://..."
              disabled={publishing || Boolean(mediaFile)}
            />
            <small>Imagem (JPG, PNG, WebP) ou vídeo (MP4). Máx. 64 MB no upload.</small>
          </div>
        ) : null}

        <label className="wb-field wb-field--full">
          <span><IconTextCaption size={16} /> {mode === "text" ? "Texto do status" : "Legenda (opcional)"}</span>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value.slice(0, CAPTION_MAX))}
            rows={mode === "text" ? 5 : 3}
            maxLength={CAPTION_MAX}
            placeholder={mode === "text" ? "Escreva algo para o seu status…" : "Escreva uma legenda para a mídia…"}
            disabled={publishing}
          />
          <small>{captionCount}</small>
        </label>

        {mode === "text" ? (
          <div className="wb-status-colors" role="radiogroup" aria-label="Cor de fundo">
            {BACKGROUND_COLORS.map((color) => (
              <button
                type="button"
                key={color.argb}
                role="radio"
                aria-checked={bg.argb === color.argb}
                aria-label={color.label}
                title={color.label}
                className={`wb-status-color${bg.argb === color.argb ? " is-active" : ""}`}
                style={{ background: color.css }}
                onClick={() => setBg(color)}
                disabled={publishing}
              />
            ))}
          </div>
        ) : null}

        <div className="wb-form-actions">
          <span>Publicado como status do seu número — visível para seus contatos.</span>
          <button type="submit" className="wb-primary-button" disabled={publishing}>
            {publishing ? <span className="wb-button-spinner" /> : <IconSend size={18} />}
            {publishing ? "Publicando…" : "Publicar status"}
          </button>
        </div>
      </form>

      <aside className="wb-status-side">
        <div className="wb-status-preview-wrap">
          <div className="wb-preview-label"><span>Prévia</span><i>Ao vivo</i></div>
          <div className="wb-status-preview">
            {mode === "text" ? (
              <div className="wb-status-preview__text" style={{ background: previewBg }}>
                <p>{caption.trim() || "Seu texto aparece aqui"}</p>
              </div>
            ) : previewSrc && previewIsImage ? (
              <div className="wb-status-preview__media">
                <img src={previewSrc} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                {caption.trim() ? <span className="wb-status-preview__caption">{caption.trim()}</span> : null}
              </div>
            ) : previewSrc ? (
              <div className="wb-status-preview__placeholder">
                <IconPhoto size={30} />
                <span>Vídeo pronto para publicar</span>
              </div>
            ) : (
              <div className="wb-status-preview__placeholder">
                <IconPhoto size={30} />
                <span>Adicione uma imagem ou vídeo</span>
              </div>
            )}
          </div>
        </div>

        <div className="wb-card wb-status-list">
          <div className="wb-card-heading">
            <div>
              <span className="wb-section-kicker">Ativos agora</span>
              <h3>Seus status (24h)</h3>
            </div>
            <button
              type="button"
              className="wb-icon-button"
              onClick={() => loadStories()}
              disabled={loadingList}
              aria-label="Atualizar status"
              title="Atualizar"
            >
              <IconRefresh className={loadingList ? "wb-spin" : ""} size={18} />
            </button>
          </div>

          {listError ? (
            <div className="wb-inline-alert wb-inline-alert--error" role="alert">
              <span>{listError}</span>
              <button type="button" onClick={() => loadStories()}>Tentar novamente</button>
            </div>
          ) : null}

          {loadingList && stories.length === 0 ? (
            <div className="wb-form-skeleton" aria-label="Carregando status" />
          ) : null}

          {!loadingList && !listError && stories.length === 0 ? (
            <p className="wb-status-empty">Nenhum status ativo. Publique o primeiro acima.</p>
          ) : null}

          {stories.length > 0 ? (
            <ul className="wb-status-items">
              {stories.map((story) => {
                const cssBg = argbToCss(story.bg) || "#128C7E";
                return (
                  <li key={story.id || `${story.ts}-${story.type}`} className="wb-status-item">
                    <div className="wb-status-item__thumb">
                      {story.image ? (
                        <img src={story.image} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      ) : story.type === "video" ? (
                        <span className="wb-status-item__badge" style={{ background: "#0F172A" }}><IconPhoto size={16} /></span>
                      ) : (
                        <span className="wb-status-item__badge" style={{ background: cssBg }}>
                          <IconTextCaption size={16} />
                        </span>
                      )}
                    </div>
                    <div className="wb-status-item__body">
                      <p className="wb-status-item__caption">
                        {story.caption || (story.type === "image" ? "Imagem" : story.type === "video" ? "Vídeo" : "Status de texto")}
                      </p>
                      <span className="wb-status-item__meta"><IconClock size={13} /> {formatWhen(story.ts) || "Ativo"}</span>
                    </div>
                    {story.id ? (
                      <button
                        type="button"
                        className="wb-icon-button wb-icon-button--danger"
                        onClick={() => handleDelete(story)}
                        disabled={deletingId === story.id}
                        aria-label="Remover status"
                        title="Remover status"
                      >
                        {deletingId === story.id ? <span className="wb-button-spinner" /> : <IconTrash size={16} />}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
