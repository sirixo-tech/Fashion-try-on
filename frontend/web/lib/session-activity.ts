export type SessionTiming = {
  sessionId?: string;
  serverTime: string;
  reauthDueAt: string;
  hardExpiresAt: string;
  expiresAt: string;
  idleTimeoutSeconds: number;
};

// User activity is reported separately from API traffic and token refresh.
export function watchSessionActivity(
  initial: SessionTiming,
  request: (activity: boolean) => Promise<SessionTiming>,
  expire: () => void,
) {
  let timing = initial;
  let offset = Date.parse(initial.serverTime) - Date.now();
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  let pending = false;
  let queuedActivity = false;
  let lastReport = 0;
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel("selfx-human-session");

  function update(next: SessionTiming) {
    if (stopped || Date.parse(next.serverTime) < Date.parse(timing.serverTime))
      return;
    timing = next;
    offset = Date.parse(next.serverTime) - Date.now();
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(
      () => void check(false),
      Math.max(0, Date.parse(timing.expiresAt) - Date.now() - offset),
    );
  }
  async function check(activity: boolean) {
    if (stopped) return;
    if (pending) {
      if (activity) queuedActivity = true;
      return;
    }
    pending = true;
    try {
      const next = await request(activity);
      if (stopped) return;
      update(next);
      // Ask sibling tabs to revalidate; never accept client-authored deadlines.
      if (activity)
        channel?.postMessage({ type: "activity", sessionId: timing.sessionId });
    } catch (error) {
      const terminal =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        (error.status === 401 || error.status === 403);
      if (
        !stopped &&
        (terminal || Date.now() + offset >= Date.parse(timing.expiresAt))
      ) {
        if (terminal)
          channel?.postMessage({ type: "ended", sessionId: timing.sessionId });
        stop();
        expire();
      }
    } finally {
      pending = false;
      if (queuedActivity && !stopped) {
        queuedActivity = false;
        void check(true);
      } else if (!stopped) {
        clearTimeout(timer);
        timer = setTimeout(
          () => void check(false),
          Math.max(1000, Date.parse(timing.expiresAt) - Date.now() - offset),
        );
      }
    }
  }
  function activity(event: Event) {
    if (!event.isTrusted || document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastReport < Math.min(30000, timing.idleTimeoutSeconds * 250))
      return;
    lastReport = now;
    // The server validates the old deadline before accepting new activity.
    void check(true);
  }
  function resume() {
    if (document.visibilityState === "visible") void check(false);
  }
  function message(event: MessageEvent) {
    if (!timing.sessionId || event.data?.sessionId !== timing.sessionId) return;
    if (event.data.type === "ended") {
      stop();
      expire();
    } else if (event.data.type === "activity") void check(false);
  }
  const events = [
    "pointerdown",
    "keydown",
    "input",
    "change",
    "submit",
    "wheel",
  ];
  for (const event of events) document.addEventListener(event, activity, true);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  channel?.addEventListener("message", message);
  schedule();
  function stop() {
    stopped = true;
    clearTimeout(timer);
    for (const event of events)
      document.removeEventListener(event, activity, true);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("focus", resume);
    channel?.close();
  }
  return { update, stop };
}
