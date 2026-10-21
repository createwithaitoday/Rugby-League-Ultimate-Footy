import type { KickKind } from '../sim/types';

export interface OneShots {
  pass: boolean;
  dive: boolean;
  switchPlayer: boolean;
  quick: boolean;
  release: boolean;
  restart: 'tap' | 'touch' | 'goal' | null;
  goalError: number | null;
  kick: KickKind | null;
  primaryEdge: boolean;
}

/**
 * Screen-space stick and buttons. The match maps stick up to the attacking direction.
 * One-shot flags clear when read so a tap cannot repeat across frames.
 */
export class ControlState {
  ax = 0;
  ay = 0;
  sprint = false;
  tackle = false;
  pass = false;
  dive = false;
  switchPlayer = false;
  quick = false;
  release = false;
  restart: 'tap' | 'touch' | 'goal' | null = null;
  goalError: number | null = null;
  kick: KickKind | null = null;

  private pointer = false;
  private px = 0;
  private py = 0;
  private keys = new Set<string>();
  private stick: HTMLElement | null = null;
  private knob: HTMLElement | null = null;

  attach(stick: HTMLElement, knob: HTMLElement): void {
    this.stick = stick;
    this.knob = knob;
    stick.addEventListener('pointerdown', (event) => {
      stick.setPointerCapture(event.pointerId);
      this.pointer = true;
      this.place(event);
    });
    stick.addEventListener('pointermove', (event) => {
      if (!this.pointer) return;
      this.place(event);
    });
    const end = () => {
      this.pointer = false;
      this.px = 0;
      this.py = 0;
      if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    window.addEventListener('keydown', (event) => {
      if (this.typing(event)) return;
      this.keys.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointer = false;
      this.px = 0;
      this.py = 0;
      this.sprintHeld = false;
      this.tackleHeld = false;
    });
  }

  /** Call once per frame before reading ax/ay. */
  poll(): void {
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0;
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0;
    const up = this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0;
    const down = this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0;
    const kx = right - left;
    const ky = up - down;
    if (this.pointer) {
      this.ax = this.px;
      this.ay = this.py;
    } else {
      const mag = Math.hypot(kx, ky) || 1;
      this.ax = kx / mag * (kx || ky ? 1 : 0);
      this.ay = ky / mag * (kx || ky ? 1 : 0);
    }
    this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintHeld;
    this.primaryHeld = this.keys.has('Space');
    this.tackle = this.keys.has('KeyF') || this.tackleHeld || false;
    if (this.keys.has('KeyJ')) this.armPass();
    if (this.keys.has('KeyL')) this.dive = true;
    if (this.keys.has('Tab')) this.switchPlayer = true;
    if (this.keys.has('Enter')) this.quick = true;
    if (this.primaryHeld && !this.primaryWas) this.primaryEdge = true;
    this.primaryWas = this.primaryHeld;
    this.keys.delete('KeyJ');
    this.keys.delete('KeyL');
    this.keys.delete('Tab');
    this.keys.delete('Enter');
  }

  private primaryWas = false;

  sprintHeld = false;
  tackleHeld = false;
  primaryHeld = false;
  primaryEdge = false;

  armPass(): void {
    this.pass = true;
  }

  take(): OneShots {
    const shot: OneShots = {
      pass: this.pass,
      dive: this.dive,
      switchPlayer: this.switchPlayer,
      quick: this.quick,
      release: this.release,
      restart: this.restart,
      goalError: this.goalError,
      kick: this.kick,
      primaryEdge: this.primaryEdge,
    };
    this.primaryEdge = false;
    this.pass = false;
    this.dive = false;
    this.switchPlayer = false;
    this.quick = false;
    this.release = false;
    this.restart = null;
    this.goalError = null;
    this.kick = null;
    return shot;
  }

  private place(event: PointerEvent): void {
    if (!this.stick) return;
    const rect = this.stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width * 0.38;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(radius, mag);
    dx = (dx / mag) * clamped;
    dy = (dy / mag) * clamped;
    this.px = dx / radius;
    this.py = -dy / radius;
    if (this.knob) this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private typing(event: KeyboardEvent): boolean {
    const el = event.target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }
}
