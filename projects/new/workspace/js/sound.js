// Tiny synthesized sound effects via Web Audio API — no audio files needed.
// API: Sound.mine(), Sound.place(), Sound.jump(), Sound.damage()

const Sound = (function () {
  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // A short blip: frequency slide from f0 to f1 over `dur` seconds, with a quick decay envelope.
  function blip(f0, f1, dur, type = 'square', gain = 0.08) {
    const c = getCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  function mine() { blip(180, 90, 0.08, 'square', 0.06); }
  function place() { blip(220, 320, 0.07, 'square', 0.06); }
  function jump() { blip(300, 500, 0.12, 'triangle', 0.07); }
  function damage() { blip(180, 60, 0.25, 'sawtooth', 0.09); }

  return { mine, place, jump, damage };
})();
