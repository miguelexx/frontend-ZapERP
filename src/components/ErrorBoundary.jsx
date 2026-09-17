import { Component } from "react";
import { FLUSH_COMPOSER_DRAFT_EVENT } from "../conversa/composerDraftStore";

function flushComposerDraft() {
  try {
    window.dispatchEvent(new Event(FLUSH_COMPOSER_DRAFT_EVENT));
  } catch (_) {
    /* ignore */
  }
}

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    flushComposerDraft();
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary:", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert" aria-live="assertive">
          <div className="error-boundary-content">
            <h1>Algo deu errado</h1>
            <p>Ocorreu um erro inesperado. Tente recarregar a página.</p>
            <button
              type="button"
              className="error-boundary-button"
              onClick={() => {
                flushComposerDraft();
                window.location.reload();
              }}
              aria-label="Recarregar a página"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
