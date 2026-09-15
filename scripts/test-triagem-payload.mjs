import assert from 'node:assert/strict';
import { buildTriagemPayload } from '../src/ia/triagem/triagemPayload.js';

const everyDay = buildTriagemPayload({ diasSemanaDesativados: [], intervaloEnvioSegundos: 0 });
assert.deepEqual(everyDay.diasSemanaDesativados, []);
assert.equal(everyDay.intervaloEnvioSegundos, 0);
const defaults = buildTriagemPayload({});
assert.deepEqual(defaults.diasSemanaDesativados, [0, 6]);
assert.equal(defaults.intervaloEnvioSegundos, 3);
assert.equal(buildTriagemPayload({ intervaloEnvioSegundos: 'inválido' }).intervaloEnvioSegundos, 3);
assert.equal(buildTriagemPayload({ intervaloEnvioSegundos: 100 }).intervaloEnvioSegundos, 60);
console.log('Triagem: dias de funcionamento e intervalo validados (6 verificações).');
