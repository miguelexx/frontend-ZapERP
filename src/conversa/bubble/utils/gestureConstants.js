export const LONG_PRESS_MS = 480;
export const LONG_PRESS_MOVE_PX = 14;
export const MEDIA_TAP_MOVE_PX = 12;
export const SKIP_NEXT_MEDIA_TAP_MS = 650;
export const MEDIA_POINTER_OPENED_MS = 500;

// Long-press abre o menu com o dedo AINDA na tela; ao soltar, o navegador dispara um
// clique/mouse "fantasma" na coordenada do toque. Se cair sobre o sheet, aciona um item
// sozinho ("clicando sem eu clicar"); se cair sobre o backdrop, fecha o menu na hora.
// Engolimos esse evento por uma janela curta, restrita à vizinhança do ponto do long-press
// (fora dessa área o toque é intencional e passa normalmente).
export const GHOST_CLICK_MS = 450;
export const GHOST_CLICK_SLOP_PX = 30;

export const LONG_PRESS_IGNORE_SELECTOR =
  '.wa-reactionBtn, .wa-reactionPicker, .wa-msgMenuBtn, .wa-selectChk, .wa-bubble-fileAction, .wa-audioPlayBtn, [role="slider"]';

export const LONG_PRESS_IGNORE_BUTTON_OR_LINK =
  "button:not(.wa-bubble-imgLink):not(.wa-bubble-videoLink), a[href]";
