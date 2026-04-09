#!/usr/bin/env node
/**
 * generate-sounds.mjs
 * Pure Node.js WAV sound effect generator for SsamPin tool sounds.
 * Outputs 16-bit mono 44100 Hz WAV files to public/sounds/
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SAMPLE_RATE = 44100;
const OUT_DIR = join(import.meta.dirname, '..', 'public', 'sounds');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// ── Utilities ──────────────────────────────────────────────

function createWav(samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);

  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);       // chunk size
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits per sample

  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

function seconds(s) { return Math.round(s * SAMPLE_RATE); }

function noise() { return Math.random() * 2 - 1; }

function envelope(t, attack, decay, sustain, release, duration) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < duration - release) return sustain;
  if (t < duration) return sustain * (1 - (t - (duration - release)) / release);
  return 0;
}

function sine(phase) { return Math.sin(2 * Math.PI * phase); }

// ── Sound Generators ───────────────────────────────────────

function drawProgress() {
  // Drum roll: rapid snare-like noise bursts
  const dur = 2.0;
  const n = seconds(dur);
  const samples = new Float64Array(n);
  const rollRate = 25; // hits per second

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Each hit repeats at rollRate Hz
    const hitPhase = (t * rollRate) % 1;
    // Each hit is a short noise burst with fast decay
    const hitEnv = hitPhase < 0.3 ? Math.exp(-hitPhase * 15) : 0;
    // Mix noise with a tonal component (snare body ~200Hz)
    const noiseComp = noise() * 0.7;
    const toneComp = sine(t * 200) * 0.3;
    // Overall crescendo
    const overall = 0.3 + 0.7 * (t / dur);
    samples[i] = (noiseComp + toneComp) * hitEnv * overall * 0.6;
  }
  return samples;
}

function drawResult() {
  // Ascending fanfare: C5-E5-G5-C6
  const notes = [523.25, 659.25, 783.99, 1046.50];
  const noteLen = 0.2;
  const dur = notes.length * noteLen + 0.4;
  const n = seconds(dur);
  const samples = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let val = 0;
    for (let ni = 0; ni < notes.length; ni++) {
      const noteStart = ni * noteLen;
      const noteT = t - noteStart;
      if (noteT < 0) continue;
      const env = envelope(noteT, 0.01, 0.1, 0.6, 0.3, noteLen + 0.4);
      // Rich tone: fundamental + harmonics
      val += env * (
        sine(t * notes[ni]) * 0.5 +
        sine(t * notes[ni] * 2) * 0.25 +
        sine(t * notes[ni] * 3) * 0.12
      );
    }
    samples[i] = val * 0.35;
  }
  return samples;
}

function coinSpin() {
  // Metallic wobble: FM synthesis with descending modulation
  const dur = 1.5;
  const n = seconds(dur);
  const samples = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.01, 0.2, 0.5, 0.5, dur);
    // Wobble rate slows down over time (coin settling)
    const wobbleRate = 20 - 14 * (t / dur);
    const modIndex = 3 * (1 - t / dur);
    const carrier = 2500 - 1000 * (t / dur);
    const modulator = sine(t * wobbleRate) * modIndex;
    const val = sine(t * carrier + modulator) * env;
    // Add metallic harmonics
    const harmonic = sine(t * carrier * 2.76 + modulator * 0.5) * 0.2 * env;
    samples[i] = (val + harmonic) * 0.45;
  }
  return samples;
}

function coinLand() {
  // Short metallic clink
  const dur = 0.3;
  const n = seconds(dur);
  const samples = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 20);
    // Multiple inharmonic partials for metallic character
    const val =
      sine(t * 3200) * 0.4 +
      sine(t * 4100) * 0.3 +
      sine(t * 5800) * 0.2 +
      sine(t * 7300) * 0.1;
    samples[i] = val * env * 0.6;
  }
  return samples;
}

function diceRoll() {
  // Rattling: random bursts with varying amplitude
  const dur = 1.5;
  const n = seconds(dur);
  const samples = new Float64Array(n);
  // Pre-generate random click timings
  const clickRate = 40; // clicks per second initial
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Dice rattle: modulated noise
    const rate = clickRate * (1 - 0.5 * (t / dur));
    phase += rate / SAMPLE_RATE;
    const clickPhase = phase % 1;
    const clickEnv = clickPhase < 0.15 ? Math.exp(-clickPhase * 30) : 0;
    // Mix of hard clicky noise and tonal thud
    const n1 = noise() * 0.8;
    const tone = sine(t * 150 + noise() * 2) * 0.2;
    // Slight amplitude variation for realism
    const variation = 0.7 + 0.3 * sine(t * 7.3);
    const overall = envelope(t, 0.05, 0.3, 0.6, 0.4, dur);
    samples[i] = (n1 + tone) * clickEnv * variation * overall * 0.5;
  }
  return samples;
}

function diceStop() {
  // Low thud + brief noise
  const dur = 0.25;
  const n = seconds(dur);
  const samples = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 25);
    const thud = sine(t * 120) * 0.6 + sine(t * 80) * 0.3;
    const noiseBurst = noise() * 0.3 * Math.exp(-t * 50);
    samples[i] = (thud + noiseBurst) * env * 0.7;
  }
  return samples;
}

function rouletteSpin() {
  // Clicks that gradually slow down
  const dur = 2.5;
  const n = seconds(dur);
  const samples = new Float64Array(n);
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Rate decelerates: fast at start, slow at end
    const progress = t / dur;
    const rate = 30 * Math.pow(1 - progress, 2) + 2;
    phase += rate / SAMPLE_RATE;
    const clickPhase = phase % 1;

    // Each click is a short, bright tick
    if (clickPhase < 0.02) {
      const clickT = clickPhase / 0.02;
      const clickEnv = Math.exp(-clickT * 5);
      samples[i] = (sine(i / SAMPLE_RATE * 4000) * 0.5 + noise() * 0.3) * clickEnv * 0.5;
    } else {
      samples[i] = 0;
    }
  }
  return samples;
}

function rouletteStop() {
  // Single bright click + short bell tone
  const dur = 0.4;
  const n = seconds(dur);
  const samples = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Click
    const click = (noise() * 0.5 + sine(t * 4000) * 0.5) * Math.exp(-t * 80) * 0.4;
    // Bell tone
    const bell = (
      sine(t * 1200) * 0.4 +
      sine(t * 1200 * 2.1) * 0.2 +
      sine(t * 1200 * 3.7) * 0.1
    ) * Math.exp(-t * 8) * 0.5;
    samples[i] = click + bell;
  }
  return samples;
}

function cardShuffle() {
  // Rapid fluttering: rhythmically modulated filtered noise
  const dur = 1.5;
  const n = seconds(dur);
  const samples = new Float64Array(n);
  // Simple one-pole lowpass state
  let lpState = 0;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Flutter rate
    const flutterRate = 35;
    const flutterEnv = Math.abs(sine(t * flutterRate));
    // Each flutter is a short papery noise burst
    const raw = noise();
    // Simple lowpass filter (cutoff ~3000 Hz)
    const alpha = 0.35;
    lpState += alpha * (raw - lpState);
    const overall = envelope(t, 0.05, 0.2, 0.7, 0.3, dur);
    samples[i] = lpState * flutterEnv * overall * 0.55;
  }
  return samples;
}

function cardPlace() {
  // Short snap
  const dur = 0.15;
  const n = seconds(dur);
  const samples = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 40);
    // Quick noise burst with slight tonal content
    const val = noise() * 0.6 + sine(t * 800) * 0.2 + sine(t * 200) * 0.2;
    samples[i] = val * env * 0.7;
  }
  return samples;
}

// ── Traffic light state change ─────────────────────────────

function trafficBeep() {
  // Short bright beep for state transitions (~0.2s)
  const dur = 0.2;
  const n = seconds(dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 20);
    // Bright dual-tone beep
    const val = sine(t * 880) * 0.5 + sine(t * 1320) * 0.3;
    samples[i] = val * env * 0.6;
  }
  return samples;
}

function seatAssign() {
  // Card flip + bright reveal sound (~0.35s)
  const dur = 0.35;
  const n = seconds(dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Quick whoosh (noise burst) for card flip
    const flipEnv = t < 0.08 ? Math.exp(-t * 25) : 0;
    const flip = noise() * flipEnv * 0.3;
    // Bright chime for reveal
    const chimeEnv = t > 0.05 ? Math.exp(-(t - 0.05) * 12) : 0;
    const chime = (sine(t * 1047) * 0.4 + sine(t * 1319) * 0.3 + sine(t * 784) * 0.2) * chimeEnv;
    samples[i] = (flip + chime) * 0.6;
  }
  return samples;
}

function symbolSwitch() {
  // Soft click/pop for symbol changes (~0.15s)
  const dur = 0.15;
  const n = seconds(dur);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 35);
    // Soft pop: low sine + tiny noise
    const val = sine(t * 600) * 0.6 + noise() * 0.15;
    samples[i] = val * env * 0.5;
  }
  return samples;
}

// ── Main ───────────────────────────────────────────────────

const sounds = [
  ['draw-progress.wav', drawProgress],
  ['draw-result.wav', drawResult],
  ['coin-spin.wav', coinSpin],
  ['coin-land.wav', coinLand],
  ['dice-roll.wav', diceRoll],
  ['dice-stop.wav', diceStop],
  ['roulette-spin.wav', rouletteSpin],
  ['roulette-stop.wav', rouletteStop],
  ['seat-assign.wav', seatAssign],
  ['traffic-beep.wav', trafficBeep],
  ['symbol-switch.wav', symbolSwitch],
];

console.log(`Generating ${sounds.length} sound effects to ${OUT_DIR}/\n`);

for (const [filename, generator] of sounds) {
  const samples = generator();
  const wav = createWav(samples);
  const path = join(OUT_DIR, filename);
  writeFileSync(path, wav);
  const sizeKB = (wav.length / 1024).toFixed(1);
  const durSec = (samples.length / SAMPLE_RATE).toFixed(2);
  console.log(`  ✓ ${filename}  (${durSec}s, ${sizeKB} KB)`);
}

console.log('\nDone!');
