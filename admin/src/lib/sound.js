// A short, quiet two-note chime for new notifications. Browsers only allow audio after the person has interacted with
// the page, so the context is created lazily and any failure is swallowed: no sound is better than an error.
let context = null;

export function playChime() {
  try {
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) return;
    context ??= new Ctx();
    if (context.state === "suspended") context.resume?.();
    const start = context.currentTime;
    [[880, 0], [1318.5, 0.11]].forEach(([freq, offset]) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.05, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.28);
      osc.connect(gain).connect(context.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.3);
    });
  } catch { /* ignore */ }
}
