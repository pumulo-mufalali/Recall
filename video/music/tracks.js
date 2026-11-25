/**
 * Background music for the demo video, composed in code with Tone.js and rendered offline.
 * Every track layers drums, bass, chords, a pad, a melody and texture, with a sidechain-style
 * pump, an intro that builds and an ending that resolves. render(name, seconds) returns WAV
 * bytes (as base64) for the page driver (render.cjs).
 */
/* global Tone */

const NOTE = (n) => Tone.Frequency(n).toFrequency();

/** Shared building blocks, all routed to `out`. */
function kit(out) {
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.045, octaves: 7, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 } }).connect(out);
  const snareNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } });
  const snareFilter = new Tone.Filter(1900, 'bandpass', -12).connect(out);
  snareNoise.connect(snareFilter);
  const snareBody = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).connect(out);
  const hatFilter = new Tone.Filter(7500, 'highpass').connect(out);
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 } }).connect(hatFilter);
  const openHat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.22, sustain: 0 } }).connect(hatFilter);
  const shakerFilter = new Tone.Filter(5200, 'bandpass', -12).connect(out);
  const shaker = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.004, decay: 0.05, sustain: 0 } }).connect(shakerFilter);
  const clapFilter = new Tone.Filter(1300, 'bandpass').connect(out);
  const clap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.09, sustain: 0 } }).connect(clapFilter);
  const rim = new Tone.MembraneSynth({ pitchDecay: 0.005, octaves: 1, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).connect(out);
  return {
    kick: (t, v = 1) => kick.triggerAttackRelease('C1', '8n', t, v),
    snare: (t, v = 1) => { snareNoise.triggerAttackRelease('16n', t, 0.55 * v); snareBody.triggerAttackRelease('G2', '32n', t, 0.5 * v); },
    hat: (t, v = 1) => hat.triggerAttackRelease('32n', t, 0.35 * v),
    openHat: (t, v = 1) => openHat.triggerAttackRelease('8n', t, 0.3 * v),
    shaker: (t, v = 1) => shaker.triggerAttackRelease('32n', t, 0.3 * v),
    clap: (t, v = 1) => { [0, 0.011, 0.024].forEach((d, i) => clap.triggerAttackRelease('32n', t + d, (i === 2 ? 0.6 : 0.35) * v)); },
    rim: (t, v = 1) => rim.triggerAttackRelease('E4', '64n', t, 0.4 * v),
  };
}

/** A pump: the bus dips on every beat and swells back, as if ducked by the kick. */
function pump(bus, times, depth = 0.55, back = 0.32) {
  for (const t of times) {
    bus.gain.setValueAtTime(1 - depth, t);
    bus.gain.linearRampToValueAtTime(1, t + back);
  }
}

/** Fades the master in and out, so every sample starts and ends cleanly. */
function fades(master, seconds, fadeIn = 1.2, fadeOut = 2.5) {
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(1, fadeIn);
  master.gain.setValueAtTime(1, seconds - fadeOut);
  master.gain.linearRampToValueAtTime(0, seconds - 0.05);
}

const TRACKS = {
  /** Lo-fi study beat: dusty swung drums, Rhodes-like keys, warm sub, vinyl, a lazy pluck melody. */
  lofi: { bpm: 82, build(ctx) {
    const { out, seconds, beat, bars } = ctx;
    const drums = new Tone.Filter(5200, 'lowpass').connect(out);
    const k = kit(drums);
    const keysBus = new Tone.Gain(1).connect(out);
    const verb = new Tone.Reverb({ decay: 3.2, wet: 0.35 }).connect(keysBus);
    const keys = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3, modulationIndex: 2.2, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.01, decay: 1.4, sustain: 0.25, release: 1.6 }, modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 0.8 } });
    const trem = new Tone.Tremolo(3.2, 0.25).start();
    keys.chain(trem, new Tone.Filter(2600, 'lowpass'), verb);
    keys.volume.value = -9;
    const bass = new Tone.MonoSynth({ oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.8, release: 0.4 }, filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, baseFrequency: 180, octaves: 1.5 } }).connect(keysBus);
    bass.volume.value = -7;
    const pluckDelay = new Tone.FeedbackDelay('8n.', 0.32).connect(verb);
    const pluck = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.35, sustain: 0, release: 0.3 } }).connect(pluckDelay);
    pluck.volume.value = -14;
    const vinyl = new Tone.Noise('brown').connect(new Tone.Filter(900, 'lowpass').connect(out));
    vinyl.volume.value = -36;
    vinyl.start(0).stop(seconds);
    const crackle = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.01, sustain: 0 } }).connect(new Tone.Filter(3000, 'highpass').connect(out));
    crackle.volume.value = -30;
    for (let t = 0.3; t < seconds; t += 0.07 + Math.random() * 0.4) crackle.triggerAttackRelease('64n', t, Math.random());

    const chords = [['F3', 'A3', 'C4', 'E4'], ['E3', 'G3', 'B3', 'D4'], ['D3', 'F3', 'A3', 'C4'], ['C3', 'E3', 'G3', 'B3', 'D4']];
    const roots = ['F1', 'E1', 'D1', 'C1'];
    const melody = [['A4', 0, 1], ['C5', 1.5, 0.5], ['E5', 2, 1], ['D5', 3.5, 0.5], ['G4', 4, 1.5], ['B4', 6, 1], ['A4', 8, 1], ['F4', 9.5, 1], ['E4', 12, 2], ['G4', 14.5, 1]];
    const swing = beat / 4 * 0.18;
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * 4 * beat;
      const c = bar % 4;
      keys.triggerAttackRelease(chords[c], beat * 3.6, t0 + 0.02, 0.55);
      if (bar >= 1) {
        bass.triggerAttackRelease(roots[c], beat * 1.4, t0, 0.9);
        bass.triggerAttackRelease(roots[c], beat * 0.4, t0 + beat * 2.5, 0.6);
        bass.triggerAttackRelease(Tone.Frequency(roots[c]).transpose(7).toNote(), beat * 0.9, t0 + beat * 3, 0.6);
      }
      if (bar >= 2) {
        // Kick on 1 and the "and" of 2, snare on 2 and 4, swung hats.
        [0, 1.5, 2.75].forEach((b, i) => k.kick(t0 + b * beat, i ? 0.75 : 1));
        [1, 3].forEach((b) => k.snare(t0 + b * beat, 0.85));
        for (let s = 0; s < 8; s++) k.hat(t0 + s * beat / 2 + (s % 2 ? swing * 2 : 0), s % 2 ? 0.55 : 0.85);
      }
      if (bar >= 4 && bar < bars - 1) {
        const phrase = Math.floor((bar - 4) / 4) % 2;
        for (const [n, b, d] of melody) if (Math.floor(b / 4) === (bar % 4) && (phrase === 0 || b % 2 === 0)) pluck.triggerAttackRelease(n, d * beat, t0 + (b % 4) * beat, 0.6);
      }
    }
    pump(keysBus, Array.from({ length: bars * 4 }, (_, i) => i * beat).filter((t) => t >= 8 * beat), 0.25, 0.4);
  } },

  /** Bright tech: punchy four-on-the-floor, claps, pumping supersaw chords, a sparkling arpeggio. */
  bright: { bpm: 108, build(ctx) {
    const { out, seconds, beat, bars } = ctx;
    const k = kit(out);
    const synthBus = new Tone.Gain(1).connect(out);
    const verb = new Tone.Reverb({ decay: 2.6, wet: 0.3 }).connect(synthBus);
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 28 }, envelope: { attack: 0.04, decay: 0.3, sustain: 0.7, release: 0.9 } });
    const padFilter = new Tone.Filter(1800, 'lowpass', -24);
    pad.chain(padFilter, verb);
    pad.volume.value = -19;
    const arpDelay = new Tone.PingPongDelay('16n', 0.28).connect(verb);
    const arp = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 } }).connect(new Tone.Filter(3800, 'lowpass').connect(arpDelay));
    arp.volume.value = -22;
    const bass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { Q: 2, type: 'lowpass' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.15 }, filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.3, baseFrequency: 120, octaves: 2.5 } }).connect(synthBus);
    bass.volume.value = -12;
    const bell = new Tone.FMSynth({ harmonicity: 3.01, modulationIndex: 12, envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.8 } }).connect(verb);
    bell.volume.value = -22;

    const chords = [['C4', 'E4', 'G4', 'B4'], ['G3', 'B3', 'D4', 'F#4'], ['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4']];
    const roots = ['C2', 'G1', 'A1', 'F1'];
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * 4 * beat;
      const c = bar % 4;
      const full = bar >= 4 && bar < bars - 2;
      // Chords stab on the offbeats of each beat, pumping against the kick.
      for (let b = 0; b < 4; b++) pad.triggerAttackRelease(chords[c], beat * 0.9, t0 + b * beat + 0.01, b === 0 ? 0.7 : 0.5);
      // The filter opens over the intro: a build into the groove.
      if (bar < 4) padFilter.frequency.linearRampToValueAtTime(800 + bar * 450, t0 + 4 * beat);
      if (bar >= 2) for (let s = 0; s < 16; s++) arp.triggerAttackRelease(chords[c][[0, 2, 1, 3, 2, 0, 3, 1][s % 8]].replace(/\d/, (o) => String(+o + 1)), '32n', t0 + s * beat / 4, s % 4 === 0 ? 0.8 : 0.5);
      if (bar >= 4) for (let b = 0; b < 4; b++) {
        bass.triggerAttackRelease(roots[c], beat * 0.35, t0 + b * beat + beat / 2, 0.9);
        bass.triggerAttackRelease(Tone.Frequency(roots[c]).transpose(12).toNote(), beat * 0.2, t0 + b * beat + beat * 0.75, 0.5);
      }
      if (bar >= 2) for (let b = 0; b < 4; b++) k.kick(t0 + b * beat, 1);
      if (full) {
        [1, 3].forEach((b) => k.clap(t0 + b * beat, 0.9));
        for (let b = 0; b < 4; b++) k.openHat(t0 + b * beat + beat / 2, 0.7);
        for (let s = 0; s < 16; s++) if (s % 2) k.shaker(t0 + s * beat / 4, 0.6);
        if (bar % 2 === 1) bell.triggerAttackRelease(['E5', 'D5', 'C5', 'B4'][c], '8n', t0 + 3.5 * beat, 0.5);
      }
      if (bar === 3) for (let s = 0; s < 8; s++) k.snare(t0 + 2 * beat + s * beat / 4, 0.3 + s * 0.08); // a roll into the drop
    }
    pump(synthBus, Array.from({ length: bars * 4 }, (_, i) => i * beat).filter((t) => t >= 8 * beat), 0.6, beat * 0.8);
  } },

  /** Chill house: deep rolling bass, organ-like stabs, airy pad, shakers and open hats. */
  house: { bpm: 120, build(ctx) {
    const { out, beat, bars } = ctx;
    const k = kit(out);
    const bus = new Tone.Gain(1).connect(out);
    const verb = new Tone.Reverb({ decay: 4, wet: 0.4 }).connect(bus);
    const stab = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsquare', count: 2, spread: 12 }, envelope: { attack: 0.005, decay: 0.18, sustain: 0.1, release: 0.25 } });
    stab.chain(new Tone.Filter(2200, 'lowpass'), new Tone.FeedbackDelay('8n.', 0.25), verb);
    stab.volume.value = -20;
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fattriangle', count: 3, spread: 40 }, envelope: { attack: 1.2, decay: 0.5, sustain: 0.8, release: 2.5 } }).connect(verb);
    pad.volume.value = -20;
    const bass = new Tone.MonoSynth({ oscillator: { type: 'square' }, filter: { Q: 3, type: 'lowpass' }, envelope: { attack: 0.005, decay: 0.25, sustain: 0.4, release: 0.1 }, filterEnvelope: { attack: 0.005, decay: 0.18, sustain: 0.2, baseFrequency: 90, octaves: 2.2 } }).connect(bus);
    bass.volume.value = -12;
    const lead = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.6 } }).connect(new Tone.FeedbackDelay('4n', 0.3).connect(verb));
    lead.volume.value = -17;

    const chords = [['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4'], ['C4', 'E4', 'G4', 'B4'], ['G3', 'B3', 'D4', 'F#4']];
    const roots = ['A1', 'F1', 'C2', 'G1'];
    const hook = [['E5', 0], ['G5', 0.75], ['A5', 1.5], ['G5', 2.5], ['E5', 3]];
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * 4 * beat;
      const c = bar % 4;
      pad.triggerAttackRelease(chords[c], beat * 4, t0, 0.4);
      if (bar >= 2) [0.5, 1.75, 2.5, 3.75].forEach((b) => stab.triggerAttackRelease(chords[c], '16n', t0 + b * beat, 0.6));
      if (bar >= 1) for (let s = 0; s < 16; s++) if ([2, 3, 6, 10, 11, 14].includes(s)) bass.triggerAttackRelease(s % 4 === 3 ? Tone.Frequency(roots[c]).transpose(12).toNote() : roots[c], '16n', t0 + s * beat / 4, 0.8);
      for (let b = 0; b < 4; b++) {
        if (bar >= 1) k.kick(t0 + b * beat, 1);
        if (bar >= 2) k.openHat(t0 + b * beat + beat / 2, 0.6);
      }
      if (bar >= 4) {
        [1, 3].forEach((b) => k.clap(t0 + b * beat, 0.7));
        for (let s = 0; s < 16; s++) k.shaker(t0 + s * beat / 4, s % 2 ? 0.7 : 0.4);
        if (bar % 2 === 0 && bar < bars - 2) for (const [n, b] of hook) lead.triggerAttackRelease(n, '8n', t0 + b * beat, 0.55);
      }
    }
    pump(bus, Array.from({ length: bars * 4 }, (_, i) => i * beat).filter((t) => t >= 4 * beat), 0.45, beat * 0.7);
  } },

  /** Cinematic pulse: a ticking synth pulse, warm pads, piano-like bell motif, toms and rims. */
  cinematic: { bpm: 96, build(ctx) {
    const { out, beat, bars } = ctx;
    const k = kit(out);
    const bus = new Tone.Gain(1).connect(out);
    const verb = new Tone.Reverb({ decay: 5, wet: 0.45 }).connect(bus);
    const pulse = new Tone.Synth({ oscillator: { type: 'pulse', width: 0.3 }, envelope: { attack: 0.003, decay: 0.12, sustain: 0, release: 0.08 } }).connect(new Tone.Filter(1600, 'lowpass').connect(verb));
    pulse.volume.value = -19;
    const pad = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 1.5, envelope: { attack: 1.5, decay: 1, sustain: 0.8, release: 3 } }).connect(verb);
    pad.volume.value = -17;
    const piano = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 2, modulationIndex: 3, envelope: { attack: 0.002, decay: 1.6, sustain: 0.05, release: 1.2 }, modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.5 } }).connect(verb);
    piano.volume.value = -13;
    const tom = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3, envelope: { attack: 0.001, decay: 0.5, sustain: 0 } }).connect(verb);
    tom.volume.value = -8;
    const sub = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.05, decay: 0.5, sustain: 0.8, release: 0.8 } }).connect(bus);
    sub.volume.value = -9;

    const chords = [['D3', 'F#3', 'A3', 'C#4'], ['B2', 'D3', 'F#3', 'A3'], ['G2', 'B2', 'D3', 'F#3'], ['A2', 'C#3', 'E3', 'G3']];
    const roots = ['D1', 'B0', 'G1', 'A1'];
    const motif = ['F#5', 'A5', 'E5', 'C#5', 'D5', 'B4', 'A4', 'E5'];
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * 4 * beat;
      const c = bar % 4;
      pad.triggerAttackRelease(chords[c], beat * 4, t0, 0.45);
      for (let s = 0; s < 8; s++) pulse.triggerAttackRelease(chords[c][s % 4].replace(/\d/, (o) => String(+o + 1)), '16n', t0 + s * beat / 2, bar < 2 ? 0.3 + bar * 0.2 : 0.7);
      if (bar >= 2) sub.triggerAttackRelease(roots[c], beat * 3.8, t0, 0.8);
      if (bar >= 2) {
        k.kick(t0, 1);
        k.kick(t0 + 2.5 * beat, 0.7);
        [1, 3].forEach((b) => k.rim(t0 + b * beat, 0.9));
        for (let s = 0; s < 16; s++) k.shaker(t0 + s * beat / 4, s % 4 === 2 ? 0.8 : 0.35);
      }
      if (bar >= 4 && bar < bars - 1) {
        [0, 1.5, 3].forEach((b, i) => piano.triggerAttackRelease(motif[(bar * 2 + i) % motif.length], beat * 1.2, t0 + b * beat, 0.6));
        if (bar % 4 === 3) [2, 2.5, 3, 3.5].forEach((b, i) => tom.triggerAttackRelease(['G2', 'E2', 'D2', 'A1'][i], '8n', t0 + b * beat, 0.8));
      }
    }
    pump(bus, Array.from({ length: bars * 2 }, (_, i) => i * 2 * beat).filter((t) => t >= 8 * beat), 0.3, beat);
  } },
};

/** Renders a track: WAV bytes, base64. */
async function render(name, seconds = 32) {
  const track = TRACKS[name];
  const beat = 60 / track.bpm;
  const bars = Math.ceil(seconds / (4 * beat));
  const buffer = await Tone.Offline(async () => {
    const limiter = new Tone.Limiter(-1).toDestination();
    const comp = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.2 }).connect(limiter);
    const master = new Tone.Gain(0).connect(comp);
    const out = new Tone.Gain(0.8).connect(master);
    fades(master, seconds);
    track.build({ out, seconds, beat, bars });
    await Tone.loaded();
    // Reverbs generate their impulse responses asynchronously.
    await new Promise((r) => setTimeout(r, 300));
  }, seconds, 2, 44100);
  return toWavBase64(buffer.get());
}

function toWavBase64(audio) {
  const ch = audio.numberOfChannels, n = audio.length, rate = audio.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const text = (at, s) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); text(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => audio.getChannelData(c));
  for (let i = 0, p = 44; i < n; i++) for (let c = 0; c < ch; c++, p += 2) out.setInt16(p, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true);
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

window.renderTrack = render;
window.TRACK_NAMES = Object.keys(TRACKS);
