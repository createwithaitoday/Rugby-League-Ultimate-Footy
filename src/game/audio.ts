export class MatchAudio {
  private ctx: AudioContext | null = null;
  private crowdGain: GainNode | null = null;
  private master: GainNode | null = null;
  private effects = 0.8;
  private crowd = 0.55;
  private music = 0.25;
  private musicNodes: OscillatorNode[] = [];
  private musicGains: GainNode[] = [];
  private excitement = 0.25;
  private started = false;

  setVolumes(effects: number, crowd: number, music: number): void {
    this.effects = effects;
    this.crowd = crowd;
    this.music = music;
    if (this.crowdGain) this.crowdGain.gain.value = 0.04 + this.excitement * 0.12 * this.crowd;
    this.applyMusicLevel(true);
  }

  async resume(): Promise<void> {
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
    this.started = true;
  }

  update(dt: number, target: number): void {
    this.excitement += (target - this.excitement) * Math.min(1, dt * 1.5);
    if (this.crowdGain && this.ctx) {
      this.crowdGain.gain.setTargetAtTime(0.03 + this.excitement * 0.14 * this.crowd, this.ctx.currentTime, 0.2);
    }
  }

  whistle(): void {
    if (!this.started || this.effects <= 0 || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    for (const freq of [1850, 2350]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08 * this.effects, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  }

  thud(): void {
    this.noise(0.09, 180, 0.12 * this.effects);
  }

  kick(): void {
    this.tone(140, 0.12, 'sine', 0.16 * this.effects);
  }

  cheer(): void {
    this.excitement = Math.min(1, this.excitement + 0.45);
    this.noise(0.4, 900, 0.08 * this.effects);
    this.tone(523, 0.35, 'triangle', 0.05 * this.effects);
    this.tone(659, 0.4, 'triangle', 0.04 * this.effects);
  }

  click(): void {
    this.tone(660, 0.05, 'square', 0.03 * this.effects);
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.05 * this.crowd;
    source.connect(filter).connect(this.crowdGain).connect(this.master);
    source.start();
    this.startMusic();
  }

  private startMusic(): void {
    if (!this.ctx || !this.master) return;
    const notes = [196, 247, 294, 330];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.012 * this.music;
      osc.connect(gain).connect(this.master!);
      osc.start(this.ctx!.currentTime + i * 0.05);
      this.musicNodes.push(osc);
      this.musicGains.push(gain);
    });
  }

  setMenuMusic(on: boolean): void {
    this.applyMusicLevel(on);
  }

  private applyMusicLevel(on: boolean): void {
    if (!this.ctx) return;
    const level = on ? 0.012 * this.music : 0.0001;
    for (const gain of this.musicGains) {
      gain.gain.setTargetAtTime(Math.max(0.0001, level), this.ctx.currentTime, 0.08);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, volume: number): void {
    if (!this.ctx || !this.master || volume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.7), now + dur);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private noise(dur: number, freq: number, volume: number): void {
    if (!this.ctx || !this.master || volume <= 0) return;
    const length = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }
}
