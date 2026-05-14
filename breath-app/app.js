/* ============================================================
   Дыхание — 5/5 breathing metronome
   Pure JS, no storage, audio gated on user gesture.
   ============================================================ */

(function () {
  "use strict";

  // ---------- Config ----------
  const INHALE_MS = 5000;
  const EXHALE_MS = 5000;
  const TICK_HZ = 30; // animation/update tick
  const RING_C = 2 * Math.PI * 104; // circumference of ring (r=104)

  // ---------- State ----------
  const state = {
    running: false,
    phase: null, // 'inhale' | 'exhale' | null
    phaseStart: 0, // performance.now() when current phase began
    pausedAtPhaseProgressMs: 0, // ms already elapsed in phase when paused
    cycles: 0, // each completed inhale+exhale = 1 cycle
    sessionMs: 0,
    sessionStart: 0,
    sound: false,
    vibe: false,
    audioCtx: null,
    audioReady: false,
    masterGain: null,
    rafId: 0,
  };

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const vibrationSupported =
    "vibrate" in navigator && typeof navigator.vibrate === "function";

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const app = $(".app");
  const phaseEl = $("#phase");
  const countEl = $("#count");
  const hintEl = $("#hint");
  const cyclesEl = $("#cycles");
  const elapsedEl = $("#elapsed");
  const ringEl = $("#ringProgress");
  const btnPrimary = $("#btnPrimary");
  const btnPrimaryLabel = $("#btnPrimaryLabel");
  const btnReset = $("#btnReset");
  const btnSound = $("#btnSound");
  const btnVibe = $("#btnVibe");
  const vibeSub = $("#vibeSub");

  // Init ring
  ringEl.setAttribute("stroke-dasharray", RING_C.toFixed(2));
  ringEl.setAttribute("stroke-dashoffset", RING_C.toFixed(2));

  // Vibration availability
  if (!vibrationSupported) {
    btnVibe.setAttribute("aria-disabled", "true");
    btnVibe.disabled = true;
    vibeSub.textContent = "Не поддерживается на этом устройстве";
  }

  // ---------- Audio ----------
  // Soft sine chime, gentle attack/release, low volume.
  function ensureAudio() {
    if (state.audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    state.audioCtx = new Ctx();
    state.masterGain = state.audioCtx.createGain();
    state.masterGain.gain.value = 0.0001;
    state.masterGain.connect(state.audioCtx.destination);
  }

  function unlockAudio() {
    ensureAudio();
    if (!state.audioCtx) return false;
    if (state.audioCtx.state === "suspended") {
      state.audioCtx.resume().catch(() => {});
    }
    // A near-silent ping primes the iOS audio pipeline
    try {
      const o = state.audioCtx.createOscillator();
      const g = state.audioCtx.createGain();
      g.gain.value = 0.0001;
      o.frequency.value = 440;
      o.connect(g).connect(state.audioCtx.destination);
      const now = state.audioCtx.currentTime;
      o.start(now);
      o.stop(now + 0.02);
    } catch (e) {
      /* ignore */
    }
    state.audioReady = true;
    return true;
  }

  function playTone(phase) {
    if (!state.sound || !state.audioReady || !state.audioCtx) return;
    const ctx = state.audioCtx;
    // Two soft pitches: inhale = brighter, exhale = lower/warmer.
    const f1 = phase === "inhale" ? 528 : 392;
    const f2 = phase === "inhale" ? 660 : 494;

    const now = ctx.currentTime;
    const dur = 1.2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    g.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(f1, now);
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(f2, now);

    // soft lowpass for warmth
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    lp.Q.value = 0.4;

    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);

    o1.start(now);
    o2.start(now);
    o1.stop(now + dur + 0.05);
    o2.stop(now + dur + 0.05);
  }

  // ---------- Vibration ----------
  function vibrate(pattern) {
    if (!state.vibe || !vibrationSupported) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- Helpers ----------
  function phaseDuration(phase) {
    return phase === "inhale" ? INHALE_MS : EXHALE_MS;
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function setHint(text) {
    hintEl.textContent = text || "";
  }

  function setPhase(phase) {
    state.phase = phase;
    state.phaseStart = performance.now();
    state.pausedAtPhaseProgressMs = 0;
    app.setAttribute("data-phase", phase);
    phaseEl.textContent = phase === "inhale" ? "Вдох" : "Выдох";
    // Initial count display = full duration in seconds
    const total = Math.round(phaseDuration(phase) / 1000);
    countEl.textContent = String(total);
    // Reset ring (will animate as phase progresses)
    ringEl.style.transition = "none";
    ringEl.setAttribute("stroke-dashoffset", String(RING_C));
    // Force reflow so transition restarts
    void ringEl.getBoundingClientRect();
    ringEl.style.transition = "";

    // cues
    playTone(phase);
    vibrate(phase === "inhale" ? [22] : [16]);
  }

  function startBreathing() {
    state.running = true;
    app.setAttribute("data-running", "true");
    state.sessionStart = performance.now() - state.sessionMs;
    if (!state.phase) {
      setPhase("inhale");
    } else {
      // resume current phase, adjust phaseStart so progress continues
      state.phaseStart = performance.now() - state.pausedAtPhaseProgressMs;
    }
    btnPrimaryLabel.textContent = "Пауза";
    btnPrimary.setAttribute("aria-label", "Пауза");
    setIconPause();
    setHint(" ");
    loop();
  }

  function pauseBreathing() {
    if (!state.running) return;
    state.running = false;
    app.setAttribute("data-running", "false");
    state.pausedAtPhaseProgressMs = performance.now() - state.phaseStart;
    state.sessionMs = performance.now() - state.sessionStart;
    btnPrimaryLabel.textContent = "Продолжить";
    btnPrimary.setAttribute("aria-label", "Продолжить");
    setIconPlay();
    setHint("Пауза");
    cancelAnimationFrame(state.rafId);
  }

  function resetSession() {
    state.running = false;
    state.phase = null;
    state.phaseStart = 0;
    state.pausedAtPhaseProgressMs = 0;
    state.cycles = 0;
    state.sessionMs = 0;
    state.sessionStart = 0;
    app.setAttribute("data-running", "false");
    app.removeAttribute("data-phase");
    phaseEl.textContent = "Готово";
    countEl.textContent = "5";
    cyclesEl.textContent = "0";
    elapsedEl.textContent = "00:00";
    btnPrimaryLabel.textContent = "Начать";
    btnPrimary.setAttribute("aria-label", "Начать");
    setIconPlay();
    setHint("Нажмите «Начать»");
    ringEl.style.transition = "none";
    ringEl.setAttribute("stroke-dashoffset", String(RING_C));
    void ringEl.getBoundingClientRect();
    ringEl.style.transition = "";
    cancelAnimationFrame(state.rafId);
  }

  function setIconPlay() {
    btnPrimary.querySelector(".btn-icon").innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  }
  function setIconPause() {
    btnPrimary.querySelector(".btn-icon").innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>';
  }

  // ---------- Animation loop ----------
  function loop() {
    if (!state.running) return;
    const now = performance.now();
    const dur = phaseDuration(state.phase);
    const elapsedInPhase = now - state.phaseStart;
    const progress = Math.min(1, elapsedInPhase / dur);

    // Countdown 5..1
    const remainingSec = Math.max(1, Math.ceil((dur - elapsedInPhase) / 1000));
    if (countEl.textContent !== String(remainingSec)) {
      countEl.textContent = String(remainingSec);
    }

    // Update ring (fills as phase progresses)
    const offset = RING_C * (1 - progress);
    // Use direct attribute writes (cheap, smooth enough at 30Hz throttling)
    ringEl.setAttribute("stroke-dashoffset", offset.toFixed(2));

    // Update session elapsed
    state.sessionMs = now - state.sessionStart;
    elapsedEl.textContent = fmtTime(state.sessionMs);

    // Phase complete?
    if (elapsedInPhase >= dur) {
      if (state.phase === "exhale") {
        state.cycles += 1;
        cyclesEl.textContent = String(state.cycles);
      }
      const next = state.phase === "inhale" ? "exhale" : "inhale";
      setPhase(next);
    }

    state.rafId = requestAnimationFrame(loop);
  }

  // ---------- Events ----------
  btnPrimary.addEventListener("click", () => {
    // Always try to ensure audio context is alive on every press (some
    // mobile browsers suspend it). Doesn't enable sound unless toggled.
    if (state.sound) unlockAudio();
    if (state.running) {
      pauseBreathing();
    } else {
      startBreathing();
    }
  });

  btnReset.addEventListener("click", () => {
    resetSession();
  });

  btnSound.addEventListener("click", () => {
    const next = !state.sound;
    if (next) {
      const ok = unlockAudio();
      if (!ok) {
        setHint("Звук недоступен в этом браузере");
        return;
      }
    }
    state.sound = next;
    btnSound.setAttribute("aria-pressed", String(next));
    const title = btnSound.querySelector(".toggle-title");
    title.textContent = next ? "Звук включён" : "Включить звук";
  });

  btnVibe.addEventListener("click", () => {
    if (!vibrationSupported) return;
    const next = !state.vibe;
    state.vibe = next;
    btnVibe.setAttribute("aria-pressed", String(next));
    const title = btnVibe.querySelector(".toggle-title");
    title.textContent = next ? "Вибрация включена" : "Вибрация";
    if (next) {
      // tiny confirmation tap
      vibrate([12]);
    }
  });

  // Pause if tab hidden, to keep timing honest
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) {
      pauseBreathing();
    }
  });

  // Keyboard: Space toggles play/pause, R resets
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.code === "Space") {
      e.preventDefault();
      btnPrimary.click();
    } else if (e.key === "r" || e.key === "R") {
      btnReset.click();
    }
  });
})();
