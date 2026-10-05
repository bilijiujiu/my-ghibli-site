/**
 * 壁炉的声音,纯 Web Audio 合成,不用音频文件:
 *   低沉的"呼呼"声 = 布朗噪声过低通,音量跟火势;
 *   噼啪声         = 随机时刻触发的极短噪声脉冲(5~30ms),过一个随机频率的带通,
 *                    火越旺越密;偶尔来一声大的"啪"。
 * 浏览器要求用户操作之后才能出声,所以 start() 放在点火的点击回调里。
 */
export class FireAudio {
  private ctx?: AudioContext;
  private roarGain?: GainNode;
  private out?: GainNode;
  private noiseBuf?: AudioBuffer;

  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(ctx.destination);

    /* 共用一段白噪声 */
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const wd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;

    /* 呼呼声:布朗噪声 */
    const bb = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = bb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    const src = ctx.createBufferSource();
    src.buffer = bb; src.loop = true; src.start();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    src.connect(lp).connect(this.roarGain).connect(this.out);
  }

  /** 一声噼啪 */
  private pop(strength: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 3800;
    bp.Q.value = 0.8 + Math.random() * 2;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    const dur = 0.005 + Math.random() * 0.025;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(strength, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.04);
    s.connect(bp).connect(g).connect(this.out!);
    s.start(now, Math.random() * 1.5, dur + 0.05);
  }

  /** 每帧调。intensity 0..1 */
  update(dt: number, intensity: number): void {
    if (!this.ctx || !this.roarGain) return;
    this.roarGain.gain.setTargetAtTime(intensity * 0.32, this.ctx.currentTime, 0.4);
    const rate = intensity * 14;                      // 每秒多少声噼啪
    if (Math.random() < rate * dt) this.pop((0.08 + Math.random() * 0.25) * intensity);
    if (Math.random() < intensity * 0.25 * dt) this.pop(0.6 * intensity);   // 偶尔一声大的
  }

  stop(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.out?.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => { void ctx.close(); }, 600);
    this.ctx = undefined;
  }
}
