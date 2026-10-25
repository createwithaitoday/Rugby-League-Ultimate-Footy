/** Procedural promo loop for the main menu — tackle break → try, then a pulverising hit. */
export class IntroPromo {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private t = 0;
  private raf = 0;
  private running = false;

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'intro-promo';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context required for intro');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.canvas.hidden = false;
    const tick = (now: number) => {
      if (!this.running) return;
      this.t = now * 0.001;
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    this.canvas.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cycle = (this.t % 12) / 12;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#071018');
    g.addColorStop(0.45, '#12283a');
    g.addColorStop(1, '#1a0c10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Pitch stripe field
    ctx.save();
    ctx.translate(w * 0.5, h * 0.62);
    ctx.rotate(-0.18);
    ctx.fillStyle = '#1f6b34';
    ctx.fillRect(-w, -h * 0.22, w * 2, h * 0.44);
    ctx.strokeStyle = 'rgba(244,240,230,0.25)';
    ctx.lineWidth = 3;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-w, i * 38);
      ctx.lineTo(w, i * 38);
      ctx.stroke();
    }
    ctx.restore();

    if (cycle < 0.55) this.drawBreakAndTry(w, h, cycle / 0.55);
    else this.drawPulverise(w, h, (cycle - 0.55) / 0.45);

    ctx.fillStyle = 'rgba(7,16,24,0.35)';
    ctx.fillRect(0, 0, w, h * 0.22);
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = 'rgba(226,182,87,0.9)';
    ctx.font = `700 ${Math.floor(h * 0.035)}px "Barlow Condensed", sans-serif`;
    ctx.fillText('MEGA SMASH HIGHLIGHT', w * 0.06, h * 0.08);
  }

  private drawBreakAndTry(w: number, h: number, u: number): void {
    const ctx = this.ctx;
    const carrierX = w * (0.25 + u * 0.55);
    const carrierY = h * (0.55 - Math.sin(u * Math.PI) * 0.08);
    const defenderX = w * 0.42;
    const defenderY = h * 0.58;
    if (u < 0.35) {
      this.player(defenderX, defenderY, '#0B1C3D', 1.05, 0.2);
      this.player(carrierX, carrierY, '#6B1C23', 1.1, -0.15);
      if (u > 0.18) {
        ctx.strokeStyle = 'rgba(255,210,120,0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(defenderX, defenderY - 20, 40 + (u - 0.18) * 120, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      this.player(defenderX - (u - 0.35) * 80, defenderY + 30, '#0B1C3D', 1.05, 1.1);
      this.player(carrierX, carrierY, '#6B1C23', 1.15, -0.35);
      this.ball(carrierX + 18, carrierY - 50);
      if (u > 0.75) {
        ctx.fillStyle = 'rgba(226,182,87,0.95)';
        ctx.font = `800 ${Math.floor(h * 0.08)}px "Barlow Condensed", sans-serif`;
        ctx.fillText('TRY!', w * 0.62, h * 0.42);
      }
    }
  }

  private drawPulverise(w: number, h: number, u: number): void {
    const ctx = this.ctx;
    const hit = Math.min(1, u / 0.35);
    const cx = w * 0.5;
    const cy = h * 0.55;
    this.player(cx - 70 + hit * 55, cy, '#0066B3', 1.2, hit * 0.8);
    this.player(cx + 40 - hit * 10, cy, '#C8102E', 1.15, -hit * 1.4);
    if (hit > 0.6) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const r = (hit - 0.6) * 180 + Math.random() * 20;
        ctx.fillStyle = i % 2 ? 'rgba(140,10,10,0.85)' : 'rgba(255,210,120,0.7)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy - 20 + Math.sin(a) * r * 0.6, 4 + Math.random() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(244,240,230,0.92)';
      ctx.font = `800 ${Math.floor(h * 0.055)}px "Barlow Condensed", sans-serif`;
      ctx.fillText('PULVERISED', w * 0.34, h * 0.34);
    }
  }

  private player(x: number, y: number, color: string, scale: number, lean: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.35);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.fillRect(-16, -70, 32, 48);
    ctx.fillStyle = '#e0ac7e';
    ctx.beginPath();
    ctx.arc(0, -86, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-14, -22, 12, 36);
    ctx.fillRect(2, -22, 12, 36);
    ctx.restore();
  }

  private ball(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.6);
    ctx.fillStyle = '#c4552a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
