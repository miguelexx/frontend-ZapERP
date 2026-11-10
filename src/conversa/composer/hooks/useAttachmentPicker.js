import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ATTACH_MENU_PORTAL_MQ } from "../utils/composerUtils";

/** Qualidade do JPEG tirado da câmera. Único encode do caminho sem edição. */
const CAMERA_CAPTURE_QUALITY = 0.88;
/** Resolução pedida ao dispositivo: 1080p abre mais rápido que o modo máximo. */
const CAMERA_IDEAL_WIDTH = 1920;
const CAMERA_IDEAL_HEIGHT = 1080;
/** Teto de espera pelo primeiro frame antes de liberar o disparador. */
const CAMERA_READY_TIMEOUT_MS = 2500;
/** Lente padrão. Abrir SEMPRE na traseira é o comportamento original — virar
 *  vale só enquanto a câmera está aberta, não vira preferência guardada. */
const CAMERA_DEFAULT_FACING = "environment";

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

function buzz(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

/**
 * Espera o primeiro frame. Sem isso o disparador ficava clicável antes de
 * `videoWidth` existir e o toque respondia "A câmera ainda não está pronta".
 */
function waitFirstFrame(video) {
  if (!video) return Promise.resolve();
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", finish);
      video.removeEventListener("loadeddata", finish);
      video.removeEventListener("canplay", finish);
      resolve();
    };
    const timer = setTimeout(finish, CAMERA_READY_TIMEOUT_MS);
    video.addEventListener("loadedmetadata", finish);
    video.addEventListener("loadeddata", finish);
    video.addEventListener("canplay", finish);
  });
}

/**
 * Carrega antes da hora o que a foto vai precisar logo depois do disparo: o
 * chunk do editor e o módulo do pipeline de imagem. Assim o preview abre no
 * ato em vez de esperar um round-trip de rede DEPOIS da foto pronta.
 */
function prefetchPhotoPipeline() {
  try {
    import("../../utils/imageCropExport.js");
    import("../../ImageSendPreviewMobile.jsx");
  } catch {
    /* ignore */
  }
}

export function useAttachmentPicker({
  conversaId,
  sending,
  podeEnviar,
  isRecording,
  showToast,
  onBeforeOpenCamera,
  onCameraCaptureFile,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPortal, setMenuPortal] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(ATTACH_MENU_PORTAL_MQ).matches;
  });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraCanFlip, setCameraCanFlip] = useState(false);
  const [cameraTorchAvailable, setCameraTorchAvailable] = useState(false);
  const [cameraTorchOn, setCameraTorchOn] = useState(false);
  const [cameraFlash, setCameraFlash] = useState(false);
  const menuRef = useRef(null);
  const menuPanelRef = useRef(null);
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const audioInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const stickerInputRef = useRef(null);
  const cameraGenerationRef = useRef(0);
  const cameraFacingRef = useRef(CAMERA_DEFAULT_FACING);
  const capturingRef = useRef(false);
  const mountedRef = useRef(true);
  // Ref: o Shell passa uma arrow inline nova a cada render; se ela ficasse nas deps de
  // openCamera, onOpenCamera mudava a cada tecla e quebrava o memo do AttachmentMenu.
  const onBeforeOpenCameraRef = useRef(onBeforeOpenCamera);
  onBeforeOpenCameraRef.current = onBeforeOpenCamera;

  const stopCameraStream = useCallback(() => {
    const stream = cameraStreamRef.current;
    cameraStreamRef.current = null;
    stopStream(stream);
    if (cameraVideoRef.current) {
      try {
        cameraVideoRef.current.srcObject = null;
      } catch {
        /* ignore */
      }
    }
  }, []);

  const closeCamera = useCallback(() => {
    cameraGenerationRef.current += 1;
    capturingRef.current = false;
    stopCameraStream();
    if (!mountedRef.current) return;
    setCameraOpen(false);
    setCameraStarting(false);
    setCameraError("");
    setCameraTorchOn(false);
    setCameraTorchAvailable(false);
    setCameraFlash(false);
  }, [stopCameraStream]);

  const openNativeCameraFallback = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const openGallery = useCallback(() => {
    const input = galleryInputRef.current;
    if (!input) return;
    input.removeAttribute("capture");
    input.value = "";
    input.click();
  }, []);

  /**
   * Liga o stream e deixa o disparador pronto. `exact` primeiro preserva a
   * garantia da câmera traseira no celular; o fallback `ideal` só roda em
   * aparelho que não tem a lente pedida (notebook), onde o custo é irrelevante.
   */
  const startStream = useCallback(
    async (mediaDevices, facing, generation) => {
      const videoBase = {
        width: { ideal: CAMERA_IDEAL_WIDTH },
        height: { ideal: CAMERA_IDEAL_HEIGHT },
      };
      // Solta a lente ANTES de pedir a próxima (ordem do código original): há
      // Android que recusa a frontal com a traseira ainda aberta.
      stopCameraStream();
      let stream;
      try {
        stream = await mediaDevices.getUserMedia({
          audio: false,
          video: { ...videoBase, facingMode: { exact: facing } },
        });
      } catch (error) {
        const name = String(error?.name || "");
        if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError") throw error;
        stream = await mediaDevices.getUserMedia({
          audio: false,
          video: { ...videoBase, facingMode: { ideal: facing } },
        });
      }

      if (!mountedRef.current || generation !== cameraGenerationRef.current) {
        stopStream(stream);
        return null;
      }

      cameraStreamRef.current = stream;

      const video = cameraVideoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          /* Chrome Android às vezes inicia após o primeiro frame. */
        }
        await waitFirstFrame(video);
      }
      if (!mountedRef.current || generation !== cameraGenerationRef.current) {
        stopStream(stream);
        return null;
      }

      const track = stream.getVideoTracks?.()[0] || null;
      let torch = false;
      try {
        torch = Boolean(track?.getCapabilities?.().torch);
      } catch {
        torch = false;
      }
      setCameraTorchAvailable(torch && facing === "environment");
      setCameraTorchOn(false);
      setCameraStarting(false);
      setCameraError("");
      return stream;
    },
    [stopCameraStream]
  );

  const openCamera = useCallback(async () => {
    if (!conversaId || sending || !podeEnviar || isRecording) return;
    onBeforeOpenCameraRef.current?.();
    // Editor + pipeline carregam enquanto o atendente enquadra a foto.
    prefetchPhotoPipeline();

    const mediaDevices =
      typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
        ? navigator.mediaDevices
        : null;

    if (!mediaDevices || (typeof window !== "undefined" && !window.isSecureContext)) {
      openNativeCameraFallback();
      if (!mediaDevices) {
        showToast?.({
          type: "warning",
          title: "Câmera",
          message: "Este navegador não oferece câmera direta. Tentando abrir a câmera do sistema.",
        });
      }
      return;
    }

    const generation = cameraGenerationRef.current + 1;
    cameraGenerationRef.current = generation;
    capturingRef.current = false;
    // Abre sempre na traseira, como antes.
    cameraFacingRef.current = CAMERA_DEFAULT_FACING;
    setCameraOpen(true);
    setCameraStarting(true);
    setCameraError("");
    setCameraFlash(false);

    try {
      await startStream(mediaDevices, CAMERA_DEFAULT_FACING, generation);
      // Só DEPOIS do stream: enumerar dispositivos antes atrasaria a abertura,
      // que é exatamente o que esta mudança está tentando encurtar.
      mediaDevices
        .enumerateDevices?.()
        .then((devices) => {
          if (!mountedRef.current || generation !== cameraGenerationRef.current) return;
          const cams = (devices || []).filter((d) => d.kind === "videoinput");
          setCameraCanFlip(cams.length > 1);
        })
        .catch(() => {
          /* sem lista de dispositivos: esconde o botão de virar */
        });
    } catch (error) {
      if (!mountedRef.current || generation !== cameraGenerationRef.current) return;
      stopCameraStream();
      setCameraOpen(false);
      setCameraStarting(false);
      const name = String(error?.name || "");
      const message =
        name === "NotAllowedError"
          ? "Permissão negada. Toque no cadeado do navegador e permita a câmera para este site."
          : name === "NotFoundError"
            ? "Nenhuma câmera foi encontrada neste dispositivo."
            : "Não foi possível acessar a câmera. Verifique as permissões do navegador.";
      showToast?.({ type: "error", title: "Câmera", message });
    }
  }, [
    conversaId,
    isRecording,
    openNativeCameraFallback,
    podeEnviar,
    sending,
    showToast,
    startStream,
    stopCameraStream,
  ]);

  /** Alterna traseira/frontal reaproveitando o modal já aberto. */
  const flipCamera = useCallback(async () => {
    if (!cameraOpen || capturingRef.current) return;
    const mediaDevices =
      typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
        ? navigator.mediaDevices
        : null;
    if (!mediaDevices) return;
    const next = cameraFacingRef.current === "environment" ? "user" : "environment";
    const generation = cameraGenerationRef.current + 1;
    cameraGenerationRef.current = generation;
    cameraFacingRef.current = next;
    setCameraStarting(true);
    setCameraError("");
    try {
      await startStream(mediaDevices, next, generation);
    } catch {
      if (!mountedRef.current || generation !== cameraGenerationRef.current) return;
      setCameraStarting(false);
      setCameraError("Não foi possível trocar de câmera.");
    }
  }, [cameraOpen, startStream]);

  /** Lanterna (só existe na traseira e só em quem expõe a capability). */
  const toggleCameraTorch = useCallback(async () => {
    const track = cameraStreamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    const next = !cameraTorchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      if (mountedRef.current) setCameraTorchOn(next);
    } catch {
      if (mountedRef.current) {
        setCameraTorchAvailable(false);
        setCameraTorchOn(false);
      }
    }
  }, [cameraTorchOn]);

  const captureCameraPhoto = useCallback(() => {
    if (capturingRef.current) return;
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError("A câmera ainda não está pronta.");
      return;
    }
    capturingRef.current = true;
    // Resposta física no mesmo toque: vibra e pisca antes de qualquer encode.
    buzz(14);
    setCameraFlash(true);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      capturingRef.current = false;
      setCameraFlash(false);
      setCameraError("Não foi possível capturar a foto.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const generation = cameraGenerationRef.current;
    canvas.toBlob(
      (blob) => {
        if (!mountedRef.current || generation !== cameraGenerationRef.current) return;
        if (!blob) {
          capturingRef.current = false;
          setCameraFlash(false);
          setCameraError("Não foi possível capturar a foto.");
          return;
        }
        const now = Date.now();
        const file = new File([blob], `camera-${now}.jpg`, {
          type: "image/jpeg",
          lastModified: now,
        });
        closeCamera();
        onCameraCaptureFile?.(file);
      },
      "image/jpeg",
      CAMERA_CAPTURE_QUALITY
    );
  }, [closeCamera, onCameraCaptureFile]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia(ATTACH_MENU_PORTAL_MQ);
    const sync = () => setMenuPortal(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocumentPointer = (event) => {
      const wrapper = menuRef.current;
      const panel = menuPanelRef.current;
      if ((wrapper && wrapper.contains(event.target)) || (panel && panel.contains(event.target))) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocumentPointer);
    document.addEventListener("touchstart", onDocumentPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDocumentPointer);
      document.removeEventListener("touchstart", onDocumentPointer);
    };
  }, [menuOpen]);

  /** Menu de anexos aberto = foto/galeria é o próximo toque provável. */
  useEffect(() => {
    if (!menuOpen) return;
    prefetchPhotoPipeline();
  }, [menuOpen]);

  /** O flash é só visual: apaga sozinho sem segurar o disparo. */
  useEffect(() => {
    if (!cameraFlash) return undefined;
    const timer = setTimeout(() => {
      if (mountedRef.current) setCameraFlash(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [cameraFlash]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cameraGenerationRef.current += 1;
      stopCameraStream();
    };
  }, [stopCameraStream]);

  return {
    menuOpen,
    setMenuOpen,
    menuPortal,
    menuRef,
    menuPanelRef,
    fileInputRef,
    galleryInputRef,
    cameraInputRef,
    cameraVideoRef,
    cameraCanvasRef,
    audioInputRef,
    documentInputRef,
    stickerInputRef,
    cameraOpen,
    cameraStarting,
    cameraError,
    cameraCanFlip,
    cameraTorchAvailable,
    cameraTorchOn,
    cameraFlash,
    closeCamera,
    openGallery,
    openCamera,
    flipCamera,
    toggleCameraTorch,
    captureCameraPhoto,
  };
}
