// Call ringtone: a monophonic melody played with the Web Audio API plus a
// spoken announcement ("Вам звонит водитель"), so the callee knows who calls.
let audioCtx = null;
let loopTimer = null;
let speakTimer = null;

// A short cheerful monophonic phrase, repeated while the call is ringing
const NOTES = [
  [659, 0.16], [587, 0.16], [370, 0.32], [415, 0.32],
  [554, 0.16], [494, 0.16], [294, 0.32], [330, 0.32],
  [494, 0.16], [440, 0.16], [277, 0.32], [330, 0.32],
  [440, 0.5],
];

const getCtx = () => {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
};

const playPhrase = () => {
  const ctx = getCtx();
  if (!ctx) return;
  let at = ctx.currentTime;
  for (const [freq, dur] of NOTES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    at += dur;
  }
};

// Repeats the melody and periodically repeats the spoken announcement
export const startRingtone = (whoLabel) => {
  stopRingtone();
  const announce = () => {
    if (!window.speechSynthesis) return;
    const text = whoLabel === "driver" ? "Вам звонит водитель" : "Вам звонит пассажир";
    const say = new SpeechSynthesisUtterance(text);
    say.lang = "ru-RU";
    say.rate = 0.95;
    window.speechSynthesis.speak(say);
  };
  playPhrase();
  loopTimer = setInterval(playPhrase, 3200);
  announce();
  speakTimer = setInterval(announce, 5200);
};

export const stopRingtone = () => {
  if (loopTimer) clearInterval(loopTimer);
  if (speakTimer) clearInterval(speakTimer);
  loopTimer = null;
  speakTimer = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {}
};

// Short tones for the caller while the phone is ringing
export const playDialTone = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 425;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1);
};
