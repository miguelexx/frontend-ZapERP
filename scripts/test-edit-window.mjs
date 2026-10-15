/**
 * Janela de 15 min para EDITAR: o item do menu nao pode congelar no tempo.
 *
 * A REGRA pura (canEditMessage) ja e coberta por test-conversa-bubble.mjs. O que faltava, e
 * que este arquivo trava, e o jeito como ela e CONSUMIDA.
 *
 * Bug encontrado em 14/10/2026: `canEdit` era um `useMemo` cujas dependencias eram so campos
 * da mensagem. O `Date.now()` ficava preso ao ultimo render daquela linha — e o comparador de
 * memo da linha (threadRowPropsAreEqual) existe justamente para EVITAR re-renders. Na pratica,
 * uma mensagem lida aos 3 minutos nunca mais recalculava e, horas depois, o menu ainda oferecia
 * "Editar": o atendente entrava em modo de edicao, redigitava o texto e so no salvar levava
 * 409 EDIT_WINDOW_EXPIRED do backend — perdendo o que escreveu e o rascunho do composer.
 *
 * Correcao em duas camadas, as duas verificadas aqui:
 *   1) o shell avalia canEditMessage na ABERTURA do menu;
 *   2) handleEditAction reconfere antes de entrar em edicao (menu aberto na virada do prazo).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (rel) => readFileSync(join(raiz, rel), "utf8");

let falhas = 0;
const checar = (ok, msg) => {
  if (!ok) {
    falhas++;
    console.error(`FALHOU: ${msg}`);
  }
};

// ---------------------------------------------------------- camada 1: o shell
const shell = ler("src/conversa/bubble/ConversaBubbleShell.jsx");

// O invariante e a AVALIACAO sob menuOpen, nao uma sintaxe especifica: canEditMessage so
// pode ser chamado dentro de um guard de menu aberto.
const iGuard = shell.search(/if\s*\(\s*menuOpen\s*\)/);
const iChamada = shell.indexOf("canEditMessage(");
checar(
  iGuard >= 0 && iChamada > iGuard && iChamada - iGuard < 200,
  "canEditMessage precisa ser avaliado sob `if (menuOpen)` — na abertura do menu, nunca memoizado por campos da mensagem"
);
checar(
  /canEditLatchRef/.test(shell),
  "o valor precisa ficar travado durante a animacao de saida do menu (useMotionPresence mantem o menu montado)"
);
checar(
  !/const canEdit\s*=\s*useMemo\(/.test(shell),
  "canEdit nao pode voltar a ser useMemo: congela o Date.now() do ultimo render da linha"
);

// ------------------------------------------------- camada 2: entrar em edicao
const view = ler("src/conversa/ConversaView.jsx");

checar(
  /EDIT_WINDOW_MS/.test(view) && /parseCriadoEmMs/.test(view),
  "ConversaView precisa importar a janela e o parser de data para reconferir o prazo"
);

const i = view.indexOf("const handleEditAction");
checar(i >= 0, "handleEditAction precisa existir");
if (i >= 0) {
  const corpo = view.slice(i, i + 1800);
  const posGuarda = corpo.indexOf("EDIT_WINDOW_MS");
  const posSetEditing = corpo.indexOf("setEditingMessage(msg)");
  const posSetText = corpo.indexOf("setText");

  checar(
    posGuarda >= 0,
    "handleEditAction deve reconferir a janela antes de entrar em edicao"
  );
  checar(
    posSetEditing < 0 || (posGuarda >= 0 && posGuarda < posSetEditing),
    "a guarda precisa vir ANTES de setEditingMessage, senao o composer ja entrou em modo de edicao"
  );
  checar(
    posSetText < 0 || (posGuarda >= 0 && posGuarda < posSetText),
    "a guarda precisa vir ANTES de sobrescrever o texto do composer (o rascunho do atendente)"
  );
  checar(
    /Prazo de edi/.test(corpo),
    "ao expirar, o atendente precisa ser avisado do motivo, nao so bloqueado em silencio"
  );
  checar(
    /isInternalNoteEditTipo\(msg\)/.test(corpo),
    "nota interna nao vai ao WhatsApp: a janela de 15 min nao se aplica a ela"
  );
}

// -------------------------------------------------- a regra segue exportada
const classify = ler("src/conversa/bubble/utils/bubbleClassify.js");
checar(
  /export const EDIT_WINDOW_MS/.test(classify),
  "EDIT_WINDOW_MS precisa seguir exportado (fonte unica da janela, front e back alinhados)"
);
checar(
  /export function parseCriadoEmMs/.test(classify),
  "parseCriadoEmMs precisa seguir exportado para a guarda do ConversaView"
);

if (falhas) {
  console.error(`edit-window: ${falhas} falha(s)`);
  process.exit(1);
}
console.log("OK — janela de edicao: menu recalcula na abertura e a entrada em edicao reconfere.");
