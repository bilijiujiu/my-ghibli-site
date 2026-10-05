/**
 * 程序化环境声:风 + 雨,纯 Web Audio 合成,不用任何音频文件。
 *
 *   风 = 布朗噪声 → 带通滤波,滤波频率和音量随一个很慢的随机量起伏(一阵一阵的)
 *   雨 = 白噪声 → 高通,再叠一层稀疏的"滴答"(短促的噪声脉冲)
 *
 * 关窗时整体过一个低通(~500Hz)、音量压低 —— 隔着玻璃听外面,声音是闷的;
 * 开窗时低通放开到 ~12kHz、音量抬起来,风雨一下子"进了屋"。
 *
 * 浏览器要求第一次用户操作之后才能出声,所以 start() 要在点击回调里调。
 */
export class Ambience {
  private ctx?: AudioContext;
  private master?: GainNode;
  private muffle?: BiquadFilterNode;
  private windGain?: GainNode;
  private windFilter?: BiquadFilterNode;
  private rainGain?: GainNode;
  private t = 0;

  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;

    const noise = (brown: boolean) => {
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true; src.start();
      return src;
    };

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 500;
    this.master.connect(this.muffle).connect(ctx.destination);

    /* 风 */
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.5;
    noise(true).connect(this.windFilter).connect(this.windGain).connect(this.master);

    /* 雨 */
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1800;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    noise(false).connect(hp).connect(this.rainGain).connect(this.master);
  }

  /**
   * 每帧调。open 0..1 窗开了多少;wind 0..1 风势;rain 0..1 雨势。
   * 全用 setTargetAtTime 平滑过去,不会有咔哒声。
   */
  update(dt: number, open: number, wind: number, rain: number): void {
    if (!this.ctx || !this.master) return;
    this.t += dt;
    const now = this.ctx.currentTime;
    /* 阵风:两条不同周期的正弦叠起来,够"随机"了 */
    const gust = 0.55 + 0.3 * Math.sin(this.t * 0.37) + 0.15 * Math.sin(this.t * 1.13 + 2);
    this.windFilter!.frequency.setTargetAtTime(260 + gust * 520, now, 0.3);
    this.windGain!.gain.setTargetAtTime((0.25 + wind * 0.5) * gust, now, 0.3);
    this.rainGain!.gain.setTargetAtTime(rain * 0.22, now, 0.4);
    this.master.gain.setTargetAtTime(0.10 + open * 0.32, now, 0.25);
    this.muffle!.frequency.setTargetAtTime(500 + open * open * 11500, now, 0.25);
  }

  stop(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.master?.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => { void ctx.close(); }, 600);
    this.ctx = undefined;
  }
}
