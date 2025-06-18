let audioCtx = null;

export const getAudioContext = () => {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API is not supported in this browser", e);
      return null;
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(err => console.error("Error resuming AudioContext:", err));
  }
  return audioCtx;
};

const playTone = (
    ctx,
    type,
    startFreq,
    endFreq,
    startTime,
    duration,
    volume,
    attackTime = 0.005,
    decayTime 
) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFreq, startTime);
    if (endFreq !== null) {
        oscillator.frequency.linearRampToValueAtTime(endFreq, startTime + duration * 0.8);
    }

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + attackTime);
    
    const actualDecayTime = decayTime !== undefined ? decayTime : duration * 0.9;
    gainNode.gain.setValueAtTime(volume, startTime + attackTime);
    gainNode.gain.linearRampToValueAtTime(0.0001, startTime + Math.max(attackTime, actualDecayTime) + 0.01);


    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.05);
};


export const playPlayerShootSound = (volume = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 'square', 700, 300, ctx.currentTime, 0.08, volume * 0.8, 0.005, 0.07);
};

export const playTeammateShootSound = (volume = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 'square', 600, 250, ctx.currentTime, 0.09, volume * 0.7, 0.005, 0.08);
};

export const playEnemySoldierShootSound = (volume = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 'sawtooth', 500, 200, ctx.currentTime, 0.1, volume * 0.6, 0.005, 0.09);
};

export const playEnemyHeavyShootSound = (volume = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 'sawtooth', 400, 150, ctx.currentTime, 0.12, volume * 0.7, 0.01, 0.11);
};

export const playObjectiveCompleteSound = (volume = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const startTime = ctx.currentTime;
  const noteDuration = 0.1;
  playTone(ctx, 'square', 261.63, null, startTime, noteDuration, volume, 0.01, noteDuration * 0.9); // C4
  playTone(ctx, 'square', 329.63, null, startTime + noteDuration, noteDuration, volume, 0.01, noteDuration * 0.9); // E4
  playTone(ctx, 'square', 392.00, null, startTime + noteDuration * 2, noteDuration * 1.5, volume * 1.2, 0.01, noteDuration * 1.4); // G4
};

export const playIntelCollectedSound = (volume = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 'triangle', 1200, 1500, ctx.currentTime, 0.1, volume, 0.005, 0.08);
};

export const playEnemySightedAlertSound = (baseFrequency, volume = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const startTime = ctx.currentTime;
  const firstToneDuration = 0.075;
  const secondToneDuration = 0.1;
  playTone(ctx, 'square', baseFrequency, null, startTime, firstToneDuration, volume, 0.01, firstToneDuration * 0.9);
  playTone(ctx, 'square', baseFrequency * 1.25, null, startTime + firstToneDuration + 0.02, secondToneDuration, volume, 0.01, secondToneDuration * 0.9);
};
