import { lazy, Suspense } from "react";
import AtendentesModal from "../../atendimento/AtendentesModal";
import ConversaSetorPanel from "./ConversaSetorPanel";
import ConversaTagsPanel from "./ConversaTagsPanel";
import ConversaMessageSearchPanel from "./ConversaMessageSearchPanel";
import { ChatToast } from "../conversaViewIcons";

const ProdutoConsultaPanel = lazy(() => import("../ProdutoConsultaPanel"));
const SidebarCliente = lazy(() => import("../SidebarCliente"));
const ForwardModal = lazy(() => import("./ForwardModal"));
const ShareContactModal = lazy(() => import("./ShareContactModal"));
const ShareLocationModal = lazy(() => import("./ShareLocationModal"));
const PixConfigModal = lazy(() => import("./PixConfigModal"));
const MsgInfoModal = lazy(() => import("./MsgInfoModal"));
const CallModal = lazy(() => import("./CallModal"));
const AddToGroupModal = lazy(() => import("./AddToGroupModal"));
const MediaViewerOverlay = lazy(() => import("./MediaViewerOverlay"));

/**
 * Painéis e modais da conversa (exceto header, thread e composer).
 * Extraído do JSX de ConversaView sem alterar markup/classes.
 */
export default function ConversaViewOverlays({
  toast,
  onToastClose,
  messageSearchOpen,
  conversaId,
  closeMessageSearch,
  handleSelectMessageSearchResult,
  isGroup,
  podeTransferirSetor,
  showTransferirSetor,
  departamentos,
  conversa,
  transferirSetorLoading,
  setShowTransferirSetor,
  handleTransferirSetor,
  handleRemoverSetor,
  atendentesModalOpen,
  atendentesParticipantes,
  podeAdicionarAtendente,
  setAtendentesModalOpen,
  reloadAtendentes,
  podeGerenciarTags,
  tagsOpen,
  allTags,
  tagsLoading,
  selectedTagIds,
  tagMutatingId,
  handleToggleTagPanel,
  handleToggleTag,
  showClienteSide,
  setShowClienteSide,
  tags,
  tempoSemResponder,
  refresh,
  forwardOpen,
  forwardMsgs,
  forwardPreviewLabel,
  forwardQuery,
  setForwardQuery,
  forwardSending,
  forwardSelectedConversaIds,
  forwardMax10Msg,
  forwardMultiProgress,
  forwardColaboradoresLoading,
  forwardColaboradoresFiltered,
  forwardCandidates,
  forwardClientesLoading,
  forwardClientes,
  closeForward,
  confirmForwardToColaborador,
  toggleForwardConversaSelect,
  confirmForwardTo,
  confirmForwardToCliente,
  confirmForwardToMany,
  pixModalOpen,
  pixTipoChave,
  pixChave,
  pixNomeRecebedor,
  pixMensagemPadrao,
  pixConfigSaving,
  pixConfigLoading,
  handleClosePixModal,
  setPixTipoChave,
  setPixChave,
  setPixNomeRecebedor,
  setPixMensagemPadrao,
  handleSalvarPixConfig,
  msgInfoOpen,
  msgInfo,
  handleCloseMsgInfo,
  mediaViewer,
  mediaPdfBlobUrl,
  mediaPdfLoading,
  mediaPdfError,
  mediaPrintLoading,
  mediaViewerImgRef,
  mediaViewerVideoRef,
  closeMediaViewer,
  handleMediaViewerPrint,
  shareContactOpen,
  shareContactQuery,
  setShareContactQuery,
  shareContactList,
  shareContactLoading,
  shareContactSending,
  handleShareContactClose,
  handleShareContactSelect,
  shareLocationOpen,
  shareLocationGeoLoading,
  shareLocationGeoError,
  shareLocationLat,
  shareLocationLng,
  shareLocationNome,
  shareLocationEndereco,
  shareLocationSending,
  handleShareLocationClose,
  setShareLocationLat,
  setShareLocationLng,
  setShareLocationNome,
  setShareLocationEndereco,
  handleEnviarLocalizacao,
  showProdutosPanel,
  canConsultarProdutos,
  setShowProdutosPanel,
  canVerSyncProdutos,
  canSincronizarProdutos,
  showToast,
  queueComposerAppend,
  addToGroupModal,
  addToGroupGrupos,
  addToGroupLoading,
  addToGroupSending,
  closeAddToGroupModal,
  confirmAddToGroup,
  callModalOpen,
  callDuration,
  callSending,
  setCallModalOpen,
  handleCallDurationChange,
  handleCallConfirm,
}) {
  return (
    <>
      <ChatToast toast={toast} onClose={onToastClose} />
      <ConversaMessageSearchPanel
        open={messageSearchOpen}
        conversaId={conversaId}
        onClose={closeMessageSearch}
        onSelectResult={handleSelectMessageSearchResult}
      />
      {!isGroup && podeTransferirSetor && (
        <ConversaSetorPanel
          open={showTransferirSetor}
          departamentos={departamentos}
          conversa={conversa}
          transferirSetorLoading={transferirSetorLoading}
          onClose={() => setShowTransferirSetor(false)}
          onTransfer={handleTransferirSetor}
          onRemove={handleRemoverSetor}
        />
      )}
      {atendentesModalOpen && !isGroup && (
        <AtendentesModal
          conversaId={conversaId}
          participantes={atendentesParticipantes}
          podeAdicionar={podeAdicionarAtendente}
          onClose={() => setAtendentesModalOpen(false)}
          onParticipanteChange={reloadAtendentes}
        />
      )}
      {!isGroup && podeGerenciarTags && (
        <ConversaTagsPanel
          open={tagsOpen}
          allTags={allTags}
          tagsLoading={tagsLoading}
          selectedTagIds={selectedTagIds}
          tagMutatingId={tagMutatingId}
          onClose={handleToggleTagPanel}
          onToggleTag={handleToggleTag}
        />
      )}
      {showClienteSide ? (
        <Suspense fallback={null}>
          <button
            type="button"
            className="wa-floatingSheet-backdrop wa-floatingSheet-backdrop--cliente"
            aria-label="Fechar dados do cliente"
            onClick={() => setShowClienteSide(false)}
          />
          <SidebarCliente
            open
            onClose={() => setShowClienteSide(false)}
            conversa={conversa}
            isGroup={isGroup}
            tags={tags}
            tempoSemResponder={tempoSemResponder}
            onObservacaoSaved={refresh}
          />
        </Suspense>
        ) : null}
      {forwardOpen && forwardMsgs?.length ? (
        <Suspense fallback={null}>
          <ForwardModal
            open={forwardOpen}
            forwardMsgs={forwardMsgs}
            forwardPreviewLabel={forwardPreviewLabel}
            forwardQuery={forwardQuery}
            onForwardQueryChange={setForwardQuery}
            forwardSending={forwardSending}
            forwardSelectedConversaIds={forwardSelectedConversaIds}
            forwardMax10Msg={forwardMax10Msg}
            forwardMultiProgress={forwardMultiProgress}
            forwardColaboradoresLoading={forwardColaboradoresLoading}
            forwardColaboradoresFiltered={forwardColaboradoresFiltered}
            forwardCandidates={forwardCandidates}
            forwardClientesLoading={forwardClientesLoading}
            forwardClientes={forwardClientes}
            onClose={closeForward}
            onConfirmForwardToColaborador={confirmForwardToColaborador}
            onToggleForwardConversaSelect={toggleForwardConversaSelect}
            onConfirmForwardTo={confirmForwardTo}
            onConfirmForwardToCliente={confirmForwardToCliente}
            onConfirmForwardToMany={confirmForwardToMany}
          />
        </Suspense>
      ) : null}
      {pixModalOpen ? (
        <Suspense fallback={null}>
          <PixConfigModal
            open={pixModalOpen}
            tipoChave={pixTipoChave}
            chave={pixChave}
            nomeRecebedor={pixNomeRecebedor}
            mensagemPadrao={pixMensagemPadrao}
            saving={pixConfigSaving}
            loading={pixConfigLoading}
            onClose={handleClosePixModal}
            onTipoChaveChange={setPixTipoChave}
            onChaveChange={setPixChave}
            onNomeRecebedorChange={setPixNomeRecebedor}
            onMensagemPadraoChange={setPixMensagemPadrao}
            onSave={() => handleSalvarPixConfig()}
          />
        </Suspense>
      ) : null}
      {msgInfoOpen && msgInfo ? (
        <Suspense fallback={null}>
          <MsgInfoModal open={msgInfoOpen} msgInfo={msgInfo} onClose={handleCloseMsgInfo} />
        </Suspense>
      ) : null}
      {mediaViewer ? (
        <Suspense fallback={null}>
          <MediaViewerOverlay
            mediaViewer={mediaViewer}
            mediaPdfBlobUrl={mediaPdfBlobUrl}
            mediaPdfLoading={mediaPdfLoading}
            mediaPdfError={mediaPdfError}
            mediaPrintLoading={mediaPrintLoading}
            mediaViewerImgRef={mediaViewerImgRef}
            mediaViewerVideoRef={mediaViewerVideoRef}
            onClose={closeMediaViewer}
            onPrint={handleMediaViewerPrint}
          />
        </Suspense>
      ) : null}
      {shareContactOpen ? (
        <Suspense fallback={null}>
          <ShareContactModal
            open={shareContactOpen}
            query={shareContactQuery}
            onQueryChange={setShareContactQuery}
            list={shareContactList}
            loading={shareContactLoading}
            sending={shareContactSending}
            onClose={handleShareContactClose}
            onSelectContact={handleShareContactSelect}
          />
        </Suspense>
      ) : null}
      {shareLocationOpen ? (
        <Suspense fallback={null}>
          <ShareLocationModal
            open={shareLocationOpen}
            geoLoading={shareLocationGeoLoading}
            geoError={shareLocationGeoError}
            lat={shareLocationLat}
            lng={shareLocationLng}
            nome={shareLocationNome}
            endereco={shareLocationEndereco}
            sending={shareLocationSending}
            onClose={handleShareLocationClose}
            onLatChange={setShareLocationLat}
            onLngChange={setShareLocationLng}
            onNomeChange={setShareLocationNome}
            onEnderecoChange={setShareLocationEndereco}
            onSend={handleEnviarLocalizacao}
          />
        </Suspense>
      ) : null}
      {showProdutosPanel && !isGroup && canConsultarProdutos ? (
        <Suspense fallback={null}>
          <ProdutoConsultaPanel
            open
            onClose={() => setShowProdutosPanel(false)}
            canViewSyncStatus={canVerSyncProdutos}
            canTriggerManualSync={canSincronizarProdutos}
            showToast={showToast}
            onEnviarParaConversa={(template) => queueComposerAppend(template)}
          />
        </Suspense>
      ) : null}
      {addToGroupModal?.open ? (
        <Suspense fallback={null}>
          <AddToGroupModal
            open
            contactNome={addToGroupModal?.nome}
            grupos={addToGroupGrupos}
            loading={addToGroupLoading}
            sending={addToGroupSending}
            onClose={closeAddToGroupModal}
            onSelectGroup={confirmAddToGroup}
          />
        </Suspense>
      ) : null}
      {callModalOpen ? (
        <Suspense fallback={null}>
          <CallModal
            open={callModalOpen}
            duration={callDuration}
            sending={callSending}
            conversaId={conversaId}
            onClose={() => !callSending && setCallModalOpen(false)}
            onDurationChange={handleCallDurationChange}
            onConfirm={handleCallConfirm}
          />
        </Suspense>
      ) : null}
    </>
  );
}
