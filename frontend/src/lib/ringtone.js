/**
 * Web Audio API ringtone synthesizer.
 * Produces short, pleasant tones entirely in-browser — no MP3/CDN dependency.
 *
 * Each "ringtone" is a small envelope program: a sequence of (freq, duration, type, gain) steps.
 * Volume is the linear 0..1 master.
 */

const ENVELOPES = {
  chime: [
    { f: 880, t: 0.08, type: "sine", g: 1.0 },
    { f: 1318.5, t: 0.18, type: "sine", g: 0.9 },
  ],
  bell: [
    { f: 1046.5, t: 0.07, type: "triangle", g: 1.0 },
    { f: 1568, t: 0.22, type: "triangle", g: 0.85, decay: true },
  ],
  ding: [
    { f: 1760, t: 0.16, type: "sine", g: 1.0, decay: true },
  ],
  pop: [
    { f: 660, t: 0.05, type: "square", g: 0.7 },
    { f: 990, t: 0.05, type: "square", g: 0.7 },
  ],
  soft: [
    { f: 523.25, t: 0.16, type: "sine", g: 0.8 },
    { f: 783.99, t: 0.18, type: "sine", g: 0.7, decay: true },
  ],
  alert: [
    { f: 740, t: 0.1, type: "sawtooth", g: 0.9 },
    { f: 587.33, t: 0.1, type: "sawtooth", g: 0.9 },
    { f: 740, t: 0.12, type: "sawtooth", g: 0.9, decay: true },
  ],
};

let _audioCtx = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

/**
 * Play a named ringtone.
 * @param {string} name  one of ENVELOPES keys or "none"
 * @param {number} volume 0..1
 */
export function playRingtone(name = "chime", volume = 0.6) {
  if (!name || name === "none") return;
  const env = ENVELOPES[name] || ENVELOPES.chime;
  const ctx = getCtx();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(ctx.destination);
  let t = ctx.currentTime + 0.01;
  for (const step of env) {
    const osc = ctx.createOscillator();
    osc.type = step.type || "sine";
    osc.frequency.value = step.f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((step.g ?? 1.0) * 0.9, t + 0.01);
    if (step.decay) {
      g.gain.exponentialRampToValueAtTime(0.0001, t + step.t);
    } else {
      g.gain.setValueAtTime((step.g ?? 1.0) * 0.9, t + step.t - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step.t);
    }
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + step.t + 0.02);
    t += step.t;
  }
  // tidy
  setTimeout(() => {
    try { master.disconnect(); } catch {}
  }, 2000);
}

export const RINGTONE_NAMES = Object.keys(ENVELOPES);

/** Preview a ringtone (alias kept for clarity). */
export function previewRingtone(name, volume = 0.6) {
  playRingtone(name, volume);
}
