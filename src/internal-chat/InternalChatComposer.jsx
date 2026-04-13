import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileAudio, Image, MapPin, Mic, Paperclip, SendHorizontal, Smile, User, Video } from "lucide-react";

/**
 * @typedef {{ kind: 'text'; content: string }} PayloadText
 * @typedef {{ kind: 'media'; file: File; fieldName?: string; messageType?: string; caption?: string }} PayloadMedia
 * @typedef {{ kind: 'location'; latitude: number; longitude: number; address?: string; caption?: string }} PayloadLoc
 * @typedef {{ kind: 'contact'; name: string; phone: string; organization?: string; caption?: string }} PayloadContact
 * @typedef {PayloadText | PayloadMedia | PayloadLoc | PayloadContact} ComposerPayload
 */

/** @param {{ onSend: (p: ComposerPayload) => Promise<void>; disabled?: boolean; sendError?: string | null; uploadProgress?: number | null }} props */
export default function InternalChatComposer({ onSend, disabled = false, sendError = null, uploadProgress = null }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const fileAnyRef = useRef(null);
  const fileImageGalleryRef = useRef(null);
  const fileImageCameraRef = useRef(null);
  const fileVideoRef = useRef(null);
  const fileAudioRef = useRef(null);
  const fileStickerRef = useRef(null);

  const [locOpen, setLocOpen] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [addr, setAddr] = useState("");
  const [locCaption, setLocCaption] = useState("");

  const [contactOpen, setContactOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cOrg, setCOrg] = useState("");
  const [cCaption, setCCaption] = useState("");

  const [pendingMedia, setPendingMedia] = useState(
    /** @type {{ file: File; messageType?: string; fieldName: string; previewUrl?: string | null } | null} */ (null)
  );
  const [pendingCaption, setPendingCaption] = useState("");

  const [recording, setRecording] = useState(false);
  const recRef = useRef(/** @type {MediaRecorder | null} */ (null));
  const chunksRef = useRef(/** @type {BlobPart[]} */ ([]));
  const streamRef = useRef(/** @type {MediaStream | null} */ (null));

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    const url = pendingMedia?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pendingMedia?.previewUrl]);

  useEffect(
    () => () => {
      stopStream();
    },
    []
  );

  const openFilePicker = (ref) => {
    ref.current?.click();
  };

  const handleFileChosen = useCallback(
    (e, opts) => {
      const input = e.target;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const { messageType, fieldName = "file" } = opts;
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      const previewUrl = isImage || isVideo ? URL.createObjectURL(file) : null;
      setPendingCaption("");
      setPendingMedia({ file, messageType, fieldName, previewUrl });
    },
    []
  );

  async function handleSendText() {
    const text = draft.trim();
    if (!text || disabled) return;
    try {
      await onSend({ kind: "text", content: text });
      setDraft("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function confirmPendingMedia() {
    if (!pendingMedia || disabled) return;
    const { file, messageType, fieldName } = pendingMedia;
    try {
      await onSend({
        kind: "media",
        file,
        fieldName,
        messageType,
        caption: pendingCaption.trim() || undefined,
      });
      if (pendingMedia.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
      setPendingMedia(null);
      setPendingCaption("");
    } catch {
      /* erro exibido pelo pai */
    }
  }

  function cancelPendingMedia() {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
    setPendingCaption("");
  }

  async function startRecording() {
    if (disabled || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      recRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      mr.start(200);
      setRecording(true);
    } catch {
      setRecording(false);
      stopStream();
    }
  }

  async function stopRecordingAndSend() {
    const mr = recRef.current;
    if (!mr || mr.state === "inactive") {
      setRecording(false);
      stopStream();
      return;
    }
    await new Promise((resolve) => {
      mr.onstop = resolve;
      mr.stop();
    });
    stopStream();
    recRef.current = null;
    setRecording(false);
    const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
    chunksRef.current = [];
    const ext = blob.type.includes("webm") ? "webm" : "ogg";
    const file = new File([blob], `audio.${ext}`, { type: blob.type || "audio/webm" });
    try {
      await onSend({ kind: "media", file, fieldName: "audio", caption: undefined });
    } catch {
      /* */
    }
  }

  async function submitLocation() {
    const la = Number(String(lat).replace(",", "."));
    const ln = Number(String(lng).replace(",", "."));
    if (Number.isNaN(la) || Number.isNaN(ln)) return;
    try {
      await onSend({
        kind: "location",
        latitude: la,
        longitude: ln,
        address: addr.trim() || undefined,
        caption: locCaption.trim() || undefined,
      });
      setLocOpen(false);
      setLat("");
      setLng("");
      setAddr("");
      setLocCaption("");
    } catch {
      /* */
    }
  }

  async function submitContact() {
    if (!cName.trim() || !cPhone.trim()) return;
    try {
      await onSend({
        kind: "contact",
        name: cName.trim(),
        phone: cPhone.trim(),
        organization: cOrg.trim() || undefined,
        caption: cCaption.trim() || undefined,
      });
      setContactOpen(false);
      setCName("");
      setCPhone("");
      setCOrg("");
      setCCaption("");
    } catch {
      /* */
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendText();
    }
  }

  const canRecord = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  return (
    <div className="ic-composer-root">
      {uploadProgress != null && uploadProgress < 1 ? (
        <div className="ic-upload-bar" role="progressbar" aria-valuenow={Math.round(uploadProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="ic-upload-bar-fill" style={{ width: `${Math.min(100, uploadProgress * 100)}%` }} />
        </div>
      ) : null}

      {pendingMedia ? (
        <div className="ic-pending-media">
          {pendingMedia.previewUrl && pendingMedia.file.type.startsWith("image/") ? (
            <img src={pendingMedia.previewUrl} alt="" className="ic-pending-thumb" />
          ) : null}
          {pendingMedia.previewUrl && pendingMedia.file.type.startsWith("video/") ? (
            <video src={pendingMedia.previewUrl} className="ic-pending-thumb" controls muted playsInline />
          ) : null}
          {!pendingMedia.previewUrl ? (
            <div className="ic-pending-file">
              <span className="ic-pending-name">{pendingMedia.file.name}</span>
              <span className="ic-pending-meta">{(pendingMedia.file.size / 1024).toFixed(0)} KB</span>
            </div>
          ) : null}
          <label className="visually-hidden" htmlFor="ic-pending-caption">
            Legenda
          </label>
          <input
            id="ic-pending-caption"
            className="ic-pending-caption"
            placeholder="Legenda opcional…"
            value={pendingCaption}
            onChange={(e) => setPendingCaption(e.target.value)}
          />
          <div className="ic-pending-actions">
            <button type="button" className="ic-pending-btn ic-pending-btn--ghost" onClick={cancelPendingMedia}>
              Cancelar
            </button>
            <button type="button" className="ic-pending-btn ic-pending-btn--primary" disabled={disabled} onClick={() => void confirmPendingMedia()}>
              Enviar
            </button>
          </div>
        </div>
      ) : null}

      <div className="ic-thread-toolbar" role="toolbar" aria-label="Anexos e ações">
        <button
          type="button"
          className="ic-toolbar-btn"
          aria-label="Anexar arquivo"
          disabled={disabled}
          onClick={() => openFilePicker(fileAnyRef)}
        >
          <Paperclip size={18} strokeWidth={2} />
        </button>
        <input
          ref={fileAnyRef}
          type="file"
          className="ic-file-input-hidden"
          onChange={(e) => handleFileChosen(e, { fieldName: "attachment" })}
        />

        <button type="button" className="ic-toolbar-btn" aria-label="Galeria de imagens" disabled={disabled} onClick={() => openFilePicker(fileImageGalleryRef)}>
          <Image size={18} strokeWidth={2} />
        </button>
        <input
          ref={fileImageGalleryRef}
          type="file"
          accept="image/*"
          className="ic-file-input-hidden"
          onChange={(e) => handleFileChosen(e, { fieldName: "file" })}
        />

        <button type="button" className="ic-toolbar-btn" aria-label="Câmera" disabled={disabled} onClick={() => openFilePicker(fileImageCameraRef)}>
          <Camera size={18} strokeWidth={2} />
        </button>
        <input
          ref={fileImageCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="ic-file-input-hidden"
          onChange={(e) => handleFileChosen(e, { fieldName: "file" })}
        />

        <button type="button" className="ic-toolbar-btn" aria-label="Vídeo" disabled={disabled} onClick={() => openFilePicker(fileVideoRef)}>
          <Video size={18} strokeWidth={2} />
        </button>
        <input
          ref={fileVideoRef}
          type="file"
          accept="video/*"
          className="ic-file-input-hidden"
          onChange={(e) => handleFileChosen(e, { fieldName: "file" })}
        />

        <button type="button" className="ic-toolbar-btn" aria-label="Áudio do dispositivo" disabled={disabled} onClick={() => openFilePicker(fileAudioRef)}>
          <FileAudio size={18} strokeWidth={2} />
        </button>
        <input
          ref={fileAudioRef}
          type="file"
          accept="audio/*"
          className="ic-file-input-hidden"
          onChange={async (e) => {
            const input = e.target;
            const file = input.files?.[0];
            input.value = "";
            if (!file) return;
            try {
              await onSend({ kind: "media", file, fieldName: "audio" });
            } catch {
              /* */
            }
          }}
        />

        <button
          type="button"
          className={`ic-toolbar-btn${recording ? " ic-toolbar-btn--rec" : ""}`}
          aria-label={recording ? "Parar gravação e enviar" : "Gravar áudio"}
          disabled={disabled || !canRecord}
          onClick={() => (recording ? void stopRecordingAndSend() : void startRecording())}
        >
          <Mic size={18} strokeWidth={2} />
        </button>

        <button type="button" className="ic-toolbar-btn" aria-label="Localização" disabled={disabled} onClick={() => setLocOpen(true)}>
          <MapPin size={18} strokeWidth={2} />
        </button>

        <button type="button" className="ic-toolbar-btn" aria-label="Contato" disabled={disabled} onClick={() => setContactOpen(true)}>
          <User size={18} strokeWidth={2} />
        </button>

        <button type="button" className="ic-toolbar-btn" aria-label="Figurinha" disabled={disabled} onClick={() => openFilePicker(fileStickerRef)}>
          <Smile size={18} strokeWidth={2} />
        </button>
        <input
          ref={fileStickerRef}
          type="file"
          accept="image/*"
          className="ic-file-input-hidden"
          onChange={(e) => handleFileChosen(e, { fieldName: "file", messageType: "sticker" })}
        />
      </div>

      <div className="ic-thread-composer">
        <textarea
          ref={inputRef}
          className="ic-thread-input"
          rows={2}
          placeholder="Mensagem… (emoji e Shift+Enter)"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Mensagem"
        />
        <button
          type="button"
          className="ic-thread-send"
          disabled={disabled || !draft.trim()}
          aria-label="Enviar"
          onClick={() => void handleSendText()}
        >
          <SendHorizontal size={22} strokeWidth={2} />
        </button>
      </div>

      {sendError ? (
        <div className="ic-thread-send-err ic-thread-send-err--below" role="status">
          {sendError}
        </div>
      ) : null}

      {locOpen ? (
        <dialog
          className="ic-dialog"
          open
          onClick={(e) => {
            if (e.target === e.currentTarget) setLocOpen(false);
          }}
        >
          <div className="ic-dialog-panel" role="document" onClick={(e) => e.stopPropagation()}>
            <h3 className="ic-dialog-title">Enviar localização</h3>
            <div className="ic-dialog-fields">
              <label>
                Latitude
                <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.5" />
              </label>
              <label>
                Longitude
                <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.6" />
              </label>
              <label>
                Endereço (opcional)
                <input value={addr} onChange={(e) => setAddr(e.target.value)} />
              </label>
              <label>
                Legenda (opcional)
                <input value={locCaption} onChange={(e) => setLocCaption(e.target.value)} />
              </label>
            </div>
            <div className="ic-dialog-actions">
              <button type="button" className="ic-dialog-btn" onClick={() => setLocOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="ic-dialog-btn ic-dialog-btn--primary" disabled={disabled} onClick={() => void submitLocation()}>
                Enviar
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {contactOpen ? (
        <dialog
          className="ic-dialog"
          open
          onClick={(e) => {
            if (e.target === e.currentTarget) setContactOpen(false);
          }}
        >
          <div className="ic-dialog-panel" role="document" onClick={(e) => e.stopPropagation()}>
            <h3 className="ic-dialog-title">Compartilhar contato</h3>
            <div className="ic-dialog-fields">
              <label>
                Nome *
                <input value={cName} onChange={(e) => setCName(e.target.value)} />
              </label>
              <label>
                Telefone *
                <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+55…" />
              </label>
              <label>
                Organização (opcional)
                <input value={cOrg} onChange={(e) => setCOrg(e.target.value)} />
              </label>
              <label>
                Legenda (opcional)
                <input value={cCaption} onChange={(e) => setCCaption(e.target.value)} />
              </label>
            </div>
            <div className="ic-dialog-actions">
              <button type="button" className="ic-dialog-btn" onClick={() => setContactOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="ic-dialog-btn ic-dialog-btn--primary" disabled={disabled || !cName.trim() || !cPhone.trim()} onClick={() => void submitContact()}>
                Enviar
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
