/**
 * 阁楼的声音(Web Audio 合成,没有音频文件):
 *   - 扫描仪:开机两声"嘀",扫描时一个旋转马达的嗡嗡声(锯齿波 + 低通 + 颤音),
 *             频率随扫描进度往上爬,扫完一声提示音;
 *   - 楼梯:  木板受力的"吱呀"(带通噪声,中心频率快速下滑)+ 一声闷闷的脚步。
 * 一个页面只建一个 AudioContext,所有场景共用。
 */

let shared: AudioContext | undefined;
function ctx(): AudioContext | undefined {
  if (shared) { void shared.resume(); return shared; }
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return undefined;
  shared = new AC();
  return shared;
}

function noiseBuffer(c: AudioContext, sec: number): AudioBuffer {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function beep(c: AudioContext, freq: number, at: number, dur = 0.08, vol = 0.12): void {
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
}

/** 木楼梯 n 步。每步 = 一声闷响 + 一声吱呀(不是每步都响,随机) */
export function playStairs(steps: number, interval: number): void {
  const c = ctx(); if (!c) return;
  const buf = noiseBuffer(c, 0.6);
  for (let i = 0; i < steps; i++) {
    const at = c.currentTime + 0.05 + i * interval;
    /* 脚步:低通噪声,很短 */
    const s = c.createBufferSource(); s.buffer = buf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.5, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    s.connect(lp).connect(g).connect(c.destination);
    s.start(at, Math.random() * 0.4, 0.15);
    if (Math.random() < 0.6) {
      /* 吱呀:窄带通,中心频率从高往下滑 */
      const s2 = c.createBufferSource(); s2.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 18;
      const f0 = 500 + Math.random() * 500;
      bp.frequency.setValueAtTime(f0, at + 0.03);
      bp.frequency.exponentialRampToValueAtTime(f0 * 0.55, at + 0.3);
      const g2 = c.createGain();
      g2.gain.setValueAtTime(0, at + 0.03);
      g2.gain.linearRampToValueAtTime(0.9, at + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
      s2.connect(bp).connect(g2).connect(c.destination);
      s2.start(at + 0.03, Math.random() * 0.2, 0.35);
    }
  }
}

/** 扫描仪:start() 开机 → setProgress(0..1) 每帧 → finish() */
export class ScannerSound {
  private c?: AudioContext;
  private osc?: OscillatorNode;
  private lp?: BiquadFilterNode;
  private g?: GainNode;

  start(): void {
    const c = ctx(); if (!c) return;
    this.c = c;
    const t = c.currentTime;
    beep(c, 1320, t); beep(c, 1760, t + 0.14);
    this.osc = c.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 70;
    /* 颤音:马达转动的"嗡—嗡—" */
    const lfo = c.createOscillator(); lfo.frequency.value = 9;
    const lfoG = c.createGain(); lfoG.gain.value = 6;
    lfo.connect(lfoG).connect(this.osc.frequency);
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 400;
    this.g = c.createGain(); this.g.gain.value = 0;
    this.g.gain.setTargetAtTime(0.06, t + 0.3, 0.3);
    this.osc.connect(this.lp).connect(this.g).connect(c.destination);
    this.osc.start(t + 0.3); lfo.start(t + 0.3);
  }

  setProgress(p: number): void {
    if (!this.c || !this.osc) return;
    const t = this.c.currentTime;
    this.osc.frequency.setTargetAtTime(70 + p * 90, t, 0.2);
    this.lp!.frequency.setTargetAtTime(400 + p * 1400, t, 0.2);
  }

  finish(): void {
    if (!this.c || !this.g) return;
    const t = this.c.currentTime;
    this.g.gain.setTargetAtTime(0, t, 0.25);
    beep(this.c, 1760, t + 0.1, 0.1); beep(this.c, 2350, t + 0.24, 0.18);
    const o = this.osc;
    setTimeout(() => o?.stop(), 1500);
    this.osc = undefined;
  }

  stop(): void {
    if (!this.c || !this.g) return;
    this.g.gain.setTargetAtTime(0, this.c.currentTime, 0.1);
    const o = this.osc;
    setTimeout(() => o?.stop(), 600);
    this.osc = undefined;
  }
}

/**
 * 木门的吱呀:几段带通噪声首尾相接,中心频率一边抖一边往下滑 ——
 * 铰链生锈的门转动时就是这种断断续续、越来越低的声音。strength 0..1。
 */
export function playDoorCreak(strength = 1): void {
  const c = ctx(); if (!c) return;
  const buf = noiseBuffer(c, 2);
  const t0 = c.currentTime + 0.05;
  const n = 3 + Math.floor(strength * 3);
  let t = t0;
  for (let i = 0; i < n; i++) {
    const dur = 0.12 + Math.random() * 0.18;
    const s = c.createBufferSource(); s.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 22;
    const f0 = 700 - i * 70 + Math.random() * 120;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.linearRampToValueAtTime(f0 * (0.75 + Math.random() * 0.1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.7 * strength, t + 0.02);
    g.gain.setValueAtTime(0.7 * strength, t + dur - 0.03);
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(bp).connect(g).connect(c.destination);
    s.start(t, Math.random(), dur + 0.05);
    t += dur + Math.random() * 0.06;
  }
}
