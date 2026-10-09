(() => {
  // Only event types and timing leave this script. Never inspect editor contents.
  if (window.top !== window) return;
  const COMPOSER = 'textarea, [contenteditable="true"][role="textbox"], [contenteditable="plaintext-only"][role="textbox"], [contenteditable="true"].ProseMirror';
  const PULSE_MS = 5000;
  let enabled = false, quietSeconds = 60, stopped = false, timer = null;
  let lastActivity = null, lastComposed = null, lastAttempt = null;
  let foregroundSince = null;
  let configRequest = 0;
  const visible = () => document.visibilityState === 'visible' && document.hasFocus();
  const element = target => target?.nodeType === 1 ? target : target?.parentElement;
  const composer = target => {
    const node = element(target)?.closest(COMPOSER);
    return node && !node.disabled && !node.readOnly && node.getAttribute('aria-disabled') !== 'true' ? node : null;
  };
  function clearTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  function stop() {
    stopped = true;
    enabled = false;
    clearTimer();
  }
  async function send(message) {
    if (stopped) return null;
    try { return await chrome.runtime.sendMessage(message); }
    catch { stop(); return null; } // An extension update invalidates existing scripts.
  }
  function mode(now) {
    if (lastComposed !== null && now - lastComposed < 15000) return 'composing';
    const reference = lastActivity ?? foregroundSince;
    return reference !== null && now - reference < quietSeconds * 1000 ? 'interacting' : 'quiet';
  }
  function pulse(prompt = false) {
    if (!stopped && enabled && visible()) {
      void send({type:'insightPulse', mode:mode(Date.now()), prompt});
    }
  }
  function syncTimer() {
    clearTimer();
    if (!stopped && enabled && visible()) {
      if (foregroundSince === null) {
        foregroundSince = Date.now();
        lastActivity = lastComposed = null;
      }
      pulse();
      timer = setInterval(pulse, PULSE_MS);
    }
  }
  function boundary() {
    clearTimer();
    foregroundSince = lastActivity = lastComposed = null;
    if (!stopped && enabled) void send({type:'insightBoundary'});
  }
  async function refreshConfig() {
    const request = ++configRequest;
    const response = await send({type:'insightConfig'});
    if (stopped || request !== configRequest) return;
    const config = response?.ok ? response.data : null;
    const nextEnabled = config?.enabled === true;
    if (nextEnabled !== enabled) foregroundSince = lastActivity = lastComposed = lastAttempt = null;
    enabled = nextEnabled;
    quietSeconds = Number.isFinite(config?.quietSeconds) ? Math.max(15, Math.min(600, config.quietSeconds)) : 60;
    syncTimer();
  }
  function activeEvent(event) {
    return !stopped && enabled && visible() && event.isTrusted;
  }
  function activity(event) {
    if (activeEvent(event)) lastActivity = Date.now();
  }
  function input(event) {
    if (!activeEvent(event) || !composer(event.target)) return;
    lastActivity = lastComposed = Date.now();
  }
  function attempt() {
    const now = Date.now();
    if (lastAttempt !== null && now - lastAttempt < 1500) return;
    lastAttempt = lastActivity = now;
    lastComposed = null;
    // This is a send attempt, not proof that Claude accepted or answered it.
    pulse(true);
  }
  function keydown(event) {
    if (!activeEvent(event)) return;
    lastActivity = Date.now();
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey &&
        !event.isComposing && !event.repeat && event.keyCode !== 229 && composer(event.target)) attempt();
  }
  function click(event) {
    if (!activeEvent(event)) return;
    const button = element(event.target)?.closest('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    const label = (button.getAttribute('aria-label') || '').trim().toLowerCase();
    const testId = button.getAttribute('data-testid');
    if (!['send', 'send message', 'send prompt'].includes(label) && testId !== 'send-button') return;
    const scope = button.closest('form') || document;
    if (scope.querySelector(COMPOSER)) attempt();
  }
  document.addEventListener('input', input, true);
  document.addEventListener('keydown', keydown, true);
  document.addEventListener('click', click, true);
  document.addEventListener('pointerdown', activity, {capture:true, passive:true});
  // Claude can scroll its own responses; only direct input counts as interaction.
  document.addEventListener('wheel', activity, {capture:true, passive:true});
  document.addEventListener('touchmove', activity, {capture:true, passive:true});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') boundary();
    else syncTimer();
  });
  window.addEventListener('focus', () => {
    foregroundSince = lastActivity = lastComposed = null;
    void refreshConfig();
  });
  window.addEventListener('blur', boundary);
  window.addEventListener('pagehide', boundary);
  window.addEventListener('pageshow', refreshConfig);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.insightConfig) void refreshConfig();
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'insightConfigChanged') void refreshConfig();
  });
  void refreshConfig();
})();
