// src/api/chatService.js

import {
  fetchChats,
  fetchChatById,
  enviarMensagem,
  aplicarTag,
  removerTag
} from "../chats/chatService";

import * as conversaService from "../conversa/conversaService";

const chatService = {
  listar: fetchChats,
  detalhar: fetchChatById,
  enviarMensagem,
  aplicarTag,
  removerTag,

  puxarChatFila: conversaService.puxarChatFila,
  getChatById: conversaService.getChatById,
  fetchConversa: conversaService.fetchConversa,
  assumirChat: conversaService.assumirChat,
  encerrarChat: conversaService.encerrarChat,
  reabrirChat: conversaService.reabrirChat,
  transferirChat: conversaService.transferirChat,
  marcarAguardandoClienteChat: conversaService.marcarAguardandoClienteChat,
  retomarAtendimentoChat: conversaService.retomarAtendimentoChat,
  listarAtendimentos: conversaService.listarAtendimentos,
  adicionarTagConversa: conversaService.adicionarTagConversa,
  removerTagConversa: conversaService.removerTagConversa,
  
};

export default chatService;
