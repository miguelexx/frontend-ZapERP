/**
 * Compara a entrega dos MESMOS arquivos por dois hostnames.
 *
 * Serve para confirmar (ou refutar) o ganho do CDN do achado 1 com os arquivos reais do
 * ZapERP, em vez de comparar com sites de terceiros — que foi a limitacao da primeira
 * medicao: ela provava so' que um edge em GRU esta' perto de voce, nao o ganho ponta a
 * ponta dos seus assets.
 *
 * Uso:
 *   node scripts/medir-cdn.mjs zaperp.wmsistemas.inf.br zaperp.b-cdn.net
 *   node scripts/medir-cdn.mjs <origem> <cdn> --repeticoes 8
 *
 * O segundo hostname e' o do CDN. Nao precisa mexer em DNS: as pull zones dao um hostname
 * proprio (`algo.b-cdn.net`, `algo.netlify.app`, ...) apontando para a origem atual, o que
 * torna este teste reversivel por apagar a zona.
 *
 * LEIA A SAIDA ASSIM:
 *   - "1a vez" no CDN pode ser PIOR que a origem: e' cache MISS, o edge vai buscar a Boston
 *     e ainda acrescenta um salto. O numero que interessa e' o de cache HIT.
 *   - A coluna `cache` mostra o que o CDN diz (HIT/MISS). Se nunca aparecer HIT, o ganho
 *     nao existe — e' o cenario que este teste serve para detectar.
 */

import https from 'node:https'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const [origem, cdn] = args.filter((a) => !a.startsWith('--'))
const iR = args.indexOf('--repeticoes')
const REPETICOES = iR > -1 ? Number(args[iR + 1]) || 6 : 6

if (!origem || !cdn) {
  console.error('uso: node scripts/medir-cdn.mjs <hostname-origem> <hostname-cdn> [--repeticoes N]')
  process.exit(2)
}

/** Caminhos do boot, lidos do index.html construido — sao os que decidem a entrada no app. */
function caminhosDoBoot() {
  try {
    const html = readFileSync(join(raiz, 'dist', 'index.html'), 'utf8')
    const refs = [...new Set([...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map((m) => m[0]))]
    if (refs.length) return ['/', ...refs]
  } catch (_) {}
  // sem dist: cai para o maior chunk que existir
  try {
    const maior = readdirSync(join(raiz, 'dist', 'assets')).filter((f) => f.endsWith('.js'))[0]
    if (maior) return ['/', `/assets/${maior}`]
  } catch (_) {}
  return ['/']
}

function buscar(host, path, agent) {
  return new Promise((resolve) => {
    const t = process.hrtime.bigint()
    const req = https.request(
      { host, path, agent, method: 'GET', timeout: 25000, headers: { 'Accept-Encoding': 'br, zstd, gzip' } },
      (res) => {
        let ttfb = null
        let bytes = 0
        res.on('data', (c) => {
          if (ttfb === null) ttfb = Number(process.hrtime.bigint() - t) / 1e6
          bytes += c.length
        })
        res.on('end', () =>
          resolve({
            total: Number(process.hrtime.bigint() - t) / 1e6,
            ttfb: ttfb ?? Number(process.hrtime.bigint() - t) / 1e6,
            bytes,
            status: res.statusCode,
            enc: res.headers['content-encoding'] || '-',
            cache: (res.headers['cf-cache-status'] || res.headers['x-cache'] || res.headers['cdn-cache'] || '-')
              .toString()
              .toUpperCase()
              .slice(0, 8),
            pop: (res.headers['cf-ray'] || res.headers['x-served-by'] || res.headers['server'] || '')
              .toString()
              .slice(-6),
          })
        )
      }
    )
    req.on('error', (e) => resolve({ erro: e.code || e.message }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ erro: 'timeout' })
    })
    req.end()
  })
}

const mediana = (ns) => {
  const b = ns.filter((n) => Number.isFinite(n)).sort((x, y) => x - y)
  return b.length ? b[Math.floor(b.length / 2)] : NaN
}
const ms = (n) => (Number.isFinite(n) ? `${n.toFixed(0)}ms` : '  -  ')

async function medirHost(host, caminhos) {
  // Conexao nova para o "a frio" (DNS + TCP + TLS entram na conta, como na 1a visita),
  // depois conexao reusada, que e' o regime de quem ja' esta' no app.
  const frioAgent = new https.Agent({ keepAlive: false })
  const quenteAgent = new https.Agent({ keepAlive: true, maxSockets: 1 })
  const linhas = []
  for (const path of caminhos) {
    const frio = await buscar(host, path, frioAgent)
    const reps = []
    for (let i = 0; i < REPETICOES; i++) reps.push(await buscar(host, path, quenteAgent))
    const ok = reps.filter((r) => !r.erro)
    linhas.push({
      path,
      erro: frio.erro || (ok.length ? null : 'todas falharam'),
      status: frio.status,
      bytes: frio.bytes,
      enc: frio.enc,
      cacheFrio: frio.cache,
      cacheQuente: [...new Set(ok.map((r) => r.cache))].join('/'),
      pop: frio.pop,
      frioTotal: frio.total,
      frioTtfb: frio.ttfb,
      medTotal: mediana(ok.map((r) => r.total)),
      medTtfb: mediana(ok.map((r) => r.ttfb)),
    })
  }
  quenteAgent.destroy()
  return linhas
}

const caminhos = caminhosDoBoot()
console.log(`\ncomparando ${caminhos.length} caminho(s) do boot, ${REPETICOES} repeticoes cada\n`)

const [a, b] = [await medirHost(origem, caminhos), await medirHost(cdn, caminhos)]

const nome = (h) => (h.length > 30 ? h.slice(0, 29) + '…' : h)
console.log(`${'caminho'.padEnd(34)} ${'origem: ' + nome(origem)}`)
console.log(`${''.padEnd(34)} ${'cdn:    ' + nome(cdn)}\n`)
console.log(
  `${'caminho'.padEnd(34)} ${'kB'.padStart(4)}  ${'frio o'.padStart(7)} ${'frio c'.padStart(7)}  ` +
    `${'reuso o'.padStart(7)} ${'reuso c'.padStart(7)}  ganho   cache(cdn)`
)
console.log('-'.repeat(104))

let somaOrigem = 0
let somaCdn = 0
let houveHit = false
for (let i = 0; i < caminhos.length; i++) {
  const o = a[i]
  const c = b[i]
  if (o.erro || c.erro) {
    console.log(`${o.path.padEnd(34)} ERRO origem=${o.erro || '-'} cdn=${c.erro || '-'}`)
    continue
  }
  if (c.status !== o.status) {
    console.log(`${o.path.padEnd(34)} ATENCAO status diferente: origem ${o.status} x cdn ${c.status}`)
  }
  somaOrigem += o.medTotal
  somaCdn += c.medTotal
  if ((c.cacheQuente || '').includes('HIT')) houveHit = true
  const ganho = o.medTotal / c.medTotal
  console.log(
    `${o.path.slice(0, 34).padEnd(34)} ${(o.bytes / 1024).toFixed(0).padStart(4)}  ` +
      `${ms(o.frioTotal).padStart(7)} ${ms(c.frioTotal).padStart(7)}  ` +
      `${ms(o.medTotal).padStart(7)} ${ms(c.medTotal).padStart(7)}  ` +
      `${(Number.isFinite(ganho) ? ganho.toFixed(1) + '×' : '-').padStart(5)}   ${c.cacheQuente || '-'}`
  )
}

console.log('-'.repeat(104))
console.log(
  `soma do reuso: origem ${ms(somaOrigem)}  cdn ${ms(somaCdn)}  ` +
    `-> ${somaCdn < somaOrigem ? 'CDN mais rapido' : 'CDN NAO ajudou'} ` +
    `(${(somaOrigem - somaCdn).toFixed(0)}ms de diferenca)`
)
if (!houveHit) {
  console.log(
    '\nATENCAO: o CDN nunca respondeu HIT. Ou nao ha cabecalho de cache (verifique o painel),\n' +
      'ou tudo foi MISS — e nesse caso o ganho medido aqui nao representa o regime real.\n' +
      'Rode outra vez: a 2a passagem deve mostrar HIT.'
  )
}
console.log('')
