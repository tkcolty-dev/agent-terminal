// window.SFX hooks consumed by game.js: hit(intensity), wall(), score(), win()
(() => {
  let ctx;
  function audioCtx(){
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function beep({freq = 440, dur = 0.08, type = 'square', gain = 0.15, slideTo = null}){
    const c = audioCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  window.SFX = {
    hit(intensity = 0.5){
      beep({ freq: 220 + intensity * 380, dur: 0.06, type: 'square', gain: 0.14 });
    },
    wall(){
      beep({ freq: 180, dur: 0.05, type: 'triangle', gain: 0.1 });
    },
    score(){
      beep({ freq: 140, dur: 0.3, type: 'sawtooth', gain: 0.16, slideTo: 60 });
    },
    win(){
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => beep({ freq: f, dur: 0.18, type: 'square', gain: 0.15 }), i * 90);
      });
    },
  };
})();
