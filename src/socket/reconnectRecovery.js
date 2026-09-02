/** Agrupa reconexões sem sobrepor recuperações nem descartar a última solicitação. */
export function createReconnectRecovery({ recover, delayMs = 600, minIntervalMs = 2500 }) {
  let timer = null;
  let running = false;
  let pending = false;
  let online = false;
  let stopped = false;
  let lastStartedAt = -Infinity;

  function schedule() {
    if (stopped || !online || !pending || running || timer != null) return;
    const wait = Math.max(delayMs, minIntervalMs - (Date.now() - lastStartedAt));
    // Janela fixa: conexões sucessivas não adiam a recuperação indefinidamente.
    timer = setTimeout(run, wait);
  }

  async function run() {
    timer = null;
    if (stopped || !online || !pending || running) return;
    pending = false;
    running = true;
    lastStartedAt = Date.now();
    try {
      await recover();
    } catch {
      // Os fetches mantêm seus tratamentos de erro; uma reconexão nova continua válida.
    } finally {
      running = false;
      schedule();
    }
  }

  return {
    request() {
      if (stopped) return;
      online = true;
      pending = true;
      schedule();
    },
    suspend() {
      online = false;
      clearTimeout(timer);
      timer = null;
    },
    stop() {
      stopped = true;
      pending = false;
      this.suspend();
    },
  };
}
