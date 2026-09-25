// softie-os-bridge.js — connects the Softie HTML computer to the Three.js sculpture.
// Softie already decides that roughly every 3rd/4th/5th eligible action should
// hesitate and posts latency-start / latency-end messages. This bridge forwards
// those into the CRT effect, so the monitor only "struggles" when the computer
// itself is hesitating. No random glitching.
//
// Usage:
//   import { wireSoftieOS } from './softie-os-bridge.js';
//   const computer = wireSoftieOS({ iframe: screenIframe, controls, crtEffect });
//   computer.enterComputerMode(); // on screen click
//   // Esc inside Softie posts { type:'softie-os', action:'exit-screen' } → exits.

export function wireSoftieOS(options = {}) {
  const { iframe = null, controls = null, crtEffect = null } = options;
  const onEnter = typeof options.onEnter === 'function' ? options.onEnter : null;
  const onExit = typeof options.onExit === 'function' ? options.onExit : null;

  let inComputer = false;

  function setControlsEnabled(enabled) {
    if (!controls) return;
    try {
      if ('enabled' in controls) controls.enabled = enabled;
    } catch {
      // controls are optional — never break the sculpture
    }
  }

  function enterComputerMode() {
    if (inComputer) return;
    inComputer = true;
    setControlsEnabled(false);
    try {
      if (iframe) {
        if (typeof iframe.focus === 'function') iframe.focus({ preventScroll: true });
        iframe.contentWindow?.focus?.();
      }
    } catch {
      // cross-origin focus may throw — safe to ignore
    }
    try {
      onEnter?.();
    } catch {
      // host callback errors must not break computer mode
    }
  }

  function exitComputerMode() {
    if (!inComputer) return;
    inComputer = false;
    setControlsEnabled(true);
    try {
      if (iframe?.blur) iframe.blur();
    } catch {
      // ignore
    }
    try {
      onExit?.();
    } catch {
      // ignore
    }
  }

  function forwardLatencyStart() {
    try {
      if (!crtEffect) return;
      if (typeof crtEffect.triggerLag === 'function') crtEffect.triggerLag();
      else if (typeof crtEffect.latencyStart === 'function') crtEffect.latencyStart();
    } catch {
      // the effect must never break OS input
    }
  }

  function forwardLatencyEnd() {
    try {
      if (!crtEffect) return;
      if (typeof crtEffect.latencyEnd === 'function') crtEffect.latencyEnd();
    } catch {
      // ignore
    }
  }

  function onMessage(event) {
    const m = event?.data;
    if (!m || typeof m !== 'object') return;
    // Backwards compatible with the earlier FrozenOS branding.
    if (m.type !== 'softie-os' && m.type !== 'frozen-os') return;

    if (m.action === 'latency-start') {
      forwardLatencyStart();
    } else if (m.action === 'latency-end') {
      forwardLatencyEnd();
    } else if (m.action === 'exit-screen') {
      exitComputerMode();
    }
  }

  window.addEventListener('message', onMessage);

  // Host-side Esc also steps out, matching Softie's own Esc behavior.
  function onKeyDown(e) {
    if (e.key === 'Escape' && inComputer) exitComputerMode();
  }
  window.addEventListener('keydown', onKeyDown);

  function dispose() {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('keydown', onKeyDown);
  }

  return {
    enterComputerMode,
    exitComputerMode,
    dispose,
    get inComputer() {
      return inComputer;
    },
  };
}
