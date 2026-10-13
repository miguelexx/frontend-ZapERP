/**
 * Guarda do ZOOM AUTOMATICO DO iOS ao focar um campo.
 *
 * O Safari/Chrome do iPhone dao zoom na pagina inteira quando o campo focado tem font-size
 * COMPUTADO abaixo de 16px, e sair do zoom depois exige pinca. Em 13/10/2026 isto foi MEDIDO
 * com o CSS real do projeto (16 campos de telas diferentes, viewport emulada):
 *
 *   375px toque  ->  7 de 16 campos davam zoom (todos select/textarea com classe)
 *   600px toque  -> 16 de 16
 *   768px toque  -> 16 de 16
 *
 * Duas causas, as duas cobertas por este teste:
 *   1) a regra valia so ate `max-width: 480px`, deixando de fora celular DEITADO e tablet;
 *   2) `textarea`/`select` "nus" valem (0,0,1) e perdiam para qualquer `.classe select`
 *      (0,1,1). O `input` escapava por acidente: a cadeia de `:not([type=...])` lhe da (0,5,1).
 *
 * Por isso a regra precisa de `pointer: coarse` (nao de um breakpoint de largura) e de
 * `!important` (para nao depender de aritmetica de especificidade contra cada componente).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(raiz, "src/styles/app.css"), "utf8");

let falhas = 0;
const checar = (ok, msg) => {
  if (!ok) {
    falhas++;
    console.error(`FALHOU: ${msg}`);
  }
};

// Isola o bloco @media que contem a guarda.
const i = css.indexOf("@media (pointer: coarse)");
checar(i >= 0, "a guarda de zoom precisa estar sob @media (pointer: coarse) — um breakpoint de largura deixa de fora celular deitado e tablet");

if (i >= 0) {
  // Fecha o bloco contando chaves a partir da abertura.
  const abre = css.indexOf("{", i);
  let saldo = 0;
  let fim = abre;
  for (let k = abre; k < css.length; k++) {
    if (css[k] === "{") saldo++;
    else if (css[k] === "}") {
      saldo--;
      if (saldo === 0) {
        fim = k;
        break;
      }
    }
  }
  const bloco = css.slice(i, fim + 1);

  for (const alvo of ["input", "textarea", "select"]) {
    checar(
      new RegExp(`(^|[\\s,])${alvo}(\\s|,|:|\\[)`, "m").test(bloco),
      `${alvo} precisa estar na guarda — sem ele o campo cai abaixo de 16px e o iOS da zoom`
    );
  }

  checar(
    /font-size:\s*max\(\s*16px/.test(bloco),
    "a guarda precisa garantir no minimo 16px (max(16px, 1em) preserva campos intencionalmente maiores)"
  );

  checar(
    /!important/.test(bloco),
    "sem !important a regra perde para `.classe select` / `.classe textarea` (0,1,1) — foi exatamente o bug medido"
  );

  // Tipos que nao sofrem zoom e nao devem ser inchados.
  for (const tipo of ["checkbox", "radio"]) {
    checar(
      bloco.includes(`:not([type="${tipo}"])`),
      `a guarda deve excluir [type="${tipo}"] — nao recebe texto e so distorceria o controle`
    );
  }
}

// O breakpoint antigo nao pode voltar sozinho: se existir um @media de largura cuidando
// de zoom de campo, ele nao substitui a guarda por pointer.
const blocoAntigo = /@media \(max-width: 480px\)[\s\S]{0,400}?font-size:\s*max\(\s*16px/.test(css);
checar(
  !blocoAntigo || i >= 0,
  "voltou a guarda so por largura (max-width: 480px): celular deitado e tablet ficam sem protecao"
);

if (falhas) {
  console.error(`mobile-input-zoom: ${falhas} falha(s)`);
  process.exit(1);
}
console.log("OK — guarda de zoom iOS: pointer coarse, input/textarea/select, 16px, !important.");
