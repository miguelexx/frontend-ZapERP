/** Uma consulta absoluta por rajada; replays de socket não somam mensagens novamente. */
export function createUnreadSnapshotSync({ fetchSnapshot, getStore, onApplied = () => {}, delayMs = 180, retryMs = 2000 }) {
  let stopped = false
  let timer = null
  let controller = null
  let version = 0
  let pending = false
  let retryDelay = retryMs

  function schedule(delay) {
    if (stopped || timer != null || controller) return
    timer = setTimeout(() => { timer = null; void run() }, delay)
  }

  async function run() {
    if (stopped || controller || !pending) return
    pending = false
    const requestVersion = version
    const revision = getStore().unreadRevision
    const active = new AbortController()
    controller = active
    let nextDelay = delayMs
    try {
      const snapshot = await fetchSnapshot({ signal: active.signal })
      retryDelay = retryMs
      if (stopped || active.signal.aborted) return
      const appliedWithoutLocalChanges = getStore().applyUnreadSnapshot(snapshot.unread_by_id, revision)
      // Requests são serializados. Uma nova mensagem durante o GET pede outro
      // snapshot, mas não paralisa todos os contadores enquanto houver tráfego.
      if (requestVersion !== version || !appliedWithoutLocalChanges) pending = true
      onApplied()
    } catch (_) {
      if (!stopped) {
        pending = true
        nextDelay = retryDelay
        retryDelay = Math.min(30_000, retryDelay * 2)
      }
    } finally {
      controller = null
      if (pending) schedule(nextDelay)
    }
  }

  return {
    request({ immediate = false } = {}) {
      if (stopped) return
      version += 1
      pending = true
      if (immediate && timer != null) { clearTimeout(timer); timer = null }
      // Janela fixa desde o primeiro evento: rajadas não adiam o GET indefinidamente.
      schedule(immediate ? 0 : delayMs)
    },
    stop() {
      stopped = true
      pending = false
      clearTimeout(timer)
      controller?.abort()
    },
  }
}
