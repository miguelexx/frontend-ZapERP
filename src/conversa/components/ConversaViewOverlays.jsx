import { Suspense, memo } from "react";
import { lazyWithRetry as lazy } from "../../runtime/lazyWithRetry";
import AtendentesModal from "../../atendimento/AtendentesModal";
import ConversaSetorPanel from "./ConversaSetorPanel";
import ConversaTagsPanel from "./ConversaTagsPanel";
import ConversaMessageSearchPanel from "./ConversaMessageSearchPanel";
import { ChatToast } from "../conversaViewIcons";

const ProdutoConsultaPanel = lazy(() => import("../ProdutoConsultaPanel"));
/**
 * Orçamento WM (doc 36, D8): componente próprio, irmão do painel de produtos. `lazy` pelo mesmo
 * motivo dos vizinhos — é um fluxo que a maioria dos atendimentos não abre, e o chunk só desce
 * quando o módulo está ligado e alguém clica.
 */
const OrcamentoDrawer = lazy(() => import("../orcamento/OrcamentoDrawer"));
const SidebarCliente = lazy(() => import("../SidebarCliente"));
const ForwardModal = lazy(() => import("./ForwardModal"));
const ShareContactModal = lazy(() => import("./ShareContactModal"));
const ShareLocationModal = lazy(() => import("./ShareLocationModal"));
const SendPollModal = lazy(() => import("./SendPollModal"));
const PixConfigModal = lazy(() => import("./PixConfigModal"));
const MsgInfoModal = lazy(() => import("./MsgInfoModal"));
const CallModal = lazy(() => import("./CallModal"));
const AddToGroupModal = lazy(() => import("./AddToGroupModal"));
const MediaViewerOverlay = lazy(() => import("./MediaViewerOverlay"));

/**
 * Painéis e modais da conversa (exceto header, thread e composer).
 * Extraído do JSX de ConversaView sem alterar markup/classes.
 * `memo` (compare raso padrão): com o SidebarCliente aberto, cada render do coordenador
 * (mensagem nova, envio) re-renderizava este subtree pesado mesmo sem prop alterada.
 */
function ConversaViewOverlays({
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
  openMediaViewer,
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
  forwardSelectedClienteIds,
  forwardMax10Msg,
  forwardMultiProgress,
  forwardColaboradoresLoading,
  forwardColaboradoresFiltered,
  forwardCandidates,
  forwardGrupos,
  forwardGruposLoading,
  forwardClientesLoading,
  forwardClientes,
  closeForward,
  confirmForwardToColaborador,
  toggleForwardConversaSelect,
  toggleForwardClienteSelect,
  confirmForwardTo,
  confirmForwardToCliente,
  confirmForwardToMany,
  confirmForwardToSelected,
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
  mediaDownloadLoading,
  mediaViewerImgRef,
  mediaViewerVideoRef,
  closeMediaViewer,
  handleMediaViewerPrint,
  handleMediaViewerDownload,
  onForwardMedia,
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
  pollOpen,
  pollTitle,
  pollOptions,
  pollMulti,
  pollSending,
  pollMaxOptions,
  closePoll,
  setPollTitle,
  setOptionAt,
  addOption,
  removeOption,
  setPollMulti,
  handleSendPoll,
  showProdutosPanel,
  canConsultarProdutos,
  setShowProdutosPanel,
  showOrcamentoDrawer,
  canCriarOrcamentoWm,
  setShowOrcamentoDrawer,
  orcamentoCompanyId,
  orcamentoUserId,
  orcamentoClienteNomeSugerido,
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
  whatsappInstanceProvider,
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
            onOpenAvatar={openMediaViewer}
            onStartWhatsappCall={handleCallConfirm}
            callSending={callSending}
            whatsappInstanceProvider={whatsappInstanceProvider}
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
            forwardSelectedClienteIds={forwardSelectedClienteIds}
            forwardMax10Msg={forwardMax10Msg}
            forwardMultiProgress={forwardMultiProgress}
            forwardColaboradoresLoading={forwardColaboradoresLoading}
            forwardColaboradoresFiltered={forwardColaboradoresFiltered}
            forwardCandidates={forwardCandidates}
            forwardGrupos={forwardGrupos}
            forwardGruposLoading={forwardGruposLoading}
            forwardClientesLoading={forwardClientesLoading}
            forwardClientes={forwardClientes}
            onClose={closeForward}
            onConfirmForwardToColaborador={confirmForwardToColaborador}
            onToggleForwardConversaSelect={toggleForwardConversaSelect}
            onToggleForwardClienteSelect={toggleForwardClienteSelect}
            onConfirmForwardToSelected={confirmForwardToSelected}
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
            mediaDownloadLoading={mediaDownloadLoading}
            mediaViewerImgRef={mediaViewerImgRef}
            mediaViewerVideoRef={mediaViewerVideoRef}
            onClose={closeMediaViewer}
            onPrint={handleMediaViewerPrint}
            onDownload={handleMediaViewerDownload}
            onForward={onForwardMedia}
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
      {pollOpen ? (
        <Suspense fallback={null}>
          <SendPollModal
            open={pollOpen}
            title={pollTitle}
            options={pollOptions}
            multi={pollMulti}
            sending={pollSending}
            maxOptions={pollMaxOptions}
            onClose={closePoll}
            onTitleChange={setPollTitle}
            onOptionChange={setOptionAt}
            onAddOption={addOption}
            onRemoveOption={removeOption}
            onMultiChange={setPollMulti}
            onSend={handleSendPoll}
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
      {/*
        Montado DEPOIS do painel de produtos de propósito: os dois são portais com o mesmo
        `wa-modalOverlay`, então o último no DOM empilha por cima — e é essa ordem que a cadeia
        de Escape reflete (`orcamentoDrawer` antes de `produtosPanel` em
        `utils/conversationEscapeOrder.js`). Guardas repetidos aqui porque montar um overlay é
        a última chance de barrar: `conversaId` (o backend revalida a conversa), `!isGroup`
        (orçamento tem UM comprador) e o gate de módulo+permissão.
      */}
      {showOrcamentoDrawer && conversaId && !isGroup && canCriarOrcamentoWm ? (
        <Suspense fallback={null}>
          <OrcamentoDrawer
            open
            onClose={() => setShowOrcamentoDrawer(false)}
            conversaId={conversaId}
            companyId={orcamentoCompanyId}
            userId={orcamentoUserId}
            clienteNomeSugerido={orcamentoClienteNomeSugerido}
            /*
              "Enviar ao cliente" usa o MESMO caminho do painel de produtos: o texto vai para o
              composer e o atendente envia como qualquer mensagem. O drawer nunca chama a API
              de envio — e, por isso, falha de envio não tem como mexer no orçamento criado.
            */
            onEnviarAoCliente={(texto) => queueComposerAppend(texto)}
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

export default memo(ConversaViewOverlays);
