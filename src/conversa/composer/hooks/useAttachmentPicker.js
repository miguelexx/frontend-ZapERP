import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ATTACH_MENU_PORTAL_MQ } from "../utils/composerUtils";

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
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
  const mountedRef = useRef(true);

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
    stopCameraStream();
    if (!mountedRef.current) return;
    setCameraOpen(false);
    setCameraStarting(false);
    setCameraError("");
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

  const openCamera = useCallback(async () => {
    if (!conversaId || sending || !podeEnviar || isRecording) return;
    onBeforeOpenCamera?.();

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
    setCameraOpen(true);
    setCameraStarting(true);
    setCameraError("");
    stopCameraStream();

    try {
      let stream;
      try {
        stream = await mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { exact: "environment" } },
        });
      } catch (error) {
        const name = String(error?.name || "");
        if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError") throw error;
        stream = await mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
      }

      if (!mountedRef.current || generation !== cameraGenerationRef.current) {
        stopStream(stream);
        return;
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
      }
      if (mountedRef.current && generation === cameraGenerationRef.current) setCameraStarting(false);
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
    onBeforeOpenCamera,
    openNativeCameraFallback,
    podeEnviar,
    sending,
    showToast,
    stopCameraStream,
  ]);

  const captureCameraPhoto = useCallback(() => {
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError("A câmera ainda não está pronta.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Não foi possível capturar a foto.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const generation = cameraGenerationRef.current;
    canvas.toBlob((blob) => {
      if (!mountedRef.current || generation !== cameraGenerationRef.current) return;
      if (!blob) {
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
    }, "image/jpeg", 0.92);
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
    closeCamera,
    openGallery,
    openCamera,
    captureCameraPhoto,
  };
}
