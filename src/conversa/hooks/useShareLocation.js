import { useCallback, useRef, useState } from "react";
import { useLazyHookImpl } from "./lazyHookImpl";

const loadImpl = () => import("./useShareLocation.impl");

/**
 * Compartilhamento de localização na conversa (modal + geolocalização).
 * UI em ShareLocationModal; lógica concentrada neste hook.
 *
 * Casca: abrir o modal e pedir `getCurrentPosition` ficam aqui, SÍNCRONOS no clique —
 * o pedido de geolocalização precisa nascer do gesto do usuário (iOS/Safari só mostra
 * o prompt de permissão assim). O envio (`useShareLocation.impl.js`) desce em paralelo
 * com o chunk do ShareLocationModal.
 */
export function useShareLocation({ conversaId, showToast, composerRef }) {
  const [shareLocationOpen, setShareLocationOpen] = useState(false);
  const [shareLocationGeoLoading, setShareLocationGeoLoading] = useState(false);
  const [shareLocationGeoError, setShareLocationGeoError] = useState(null);
  const [shareLocationLat, setShareLocationLat] = useState("");
  const [shareLocationLng, setShareLocationLng] = useState("");
  const [shareLocationNome, setShareLocationNome] = useState("");
  const [shareLocationEndereco, setShareLocationEndereco] = useState("");
  const [shareLocationSending, setShareLocationSending] = useState(false);
  const { ensureImpl, withImpl } = useLazyHookImpl(loadImpl, { showToast, label: "Localização" });

  const ctxRef = useRef(null);
  ctxRef.current = {
    conversaId,
    showToast,
    shareLocationSending,
    shareLocationLat,
    shareLocationLng,
    shareLocationNome,
    shareLocationEndereco,
    setShareLocationOpen,
    setShareLocationGeoError,
    setShareLocationSending,
  };

  const openShareLocation = useCallback(() => {
    composerRef.current?.closePanels?.();
    setShareLocationGeoError(null);
    setShareLocationNome("");
    setShareLocationEndereco("");
    setShareLocationLat("");
    setShareLocationLng("");
    setShareLocationOpen(true);
    setShareLocationGeoLoading(true);
    ensureImpl();
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setShareLocationGeoLoading(false);
      setShareLocationGeoError("Geolocalização indisponível neste navegador. Informe latitude e longitude abaixo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setShareLocationLat(String(pos.coords.latitude));
        setShareLocationLng(String(pos.coords.longitude));
        setShareLocationGeoLoading(false);
      },
      () => {
        setShareLocationGeoLoading(false);
        setShareLocationGeoError(
          "Não foi possível obter sua posição. Permita o acesso à localização ou informe latitude e longitude manualmente."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [composerRef, ensureImpl]);

  const handleShareLocationClose = useCallback(() => {
    if (shareLocationSending) return;
    setShareLocationOpen(false);
  }, [shareLocationSending]);

  const handleEnviarLocalizacao = useCallback(() => {
    const ctx = ctxRef.current;
    return withImpl((impl) => impl.handleEnviarLocalizacao(ctx));
  }, [withImpl]);

  return {
    shareLocationOpen,
    setShareLocationOpen,
    shareLocationGeoLoading,
    shareLocationGeoError,
    shareLocationLat,
    setShareLocationLat,
    shareLocationLng,
    setShareLocationLng,
    shareLocationNome,
    setShareLocationNome,
    shareLocationEndereco,
    setShareLocationEndereco,
    shareLocationSending,
    openShareLocation,
    handleEnviarLocalizacao,
    handleShareLocationClose,
  };
}
