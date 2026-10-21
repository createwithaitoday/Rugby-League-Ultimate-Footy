import type { StadiumInfo } from '../data/teams';
import type { Match } from '../sim/match';
import type { Snapshot } from '../sim/types';

export type CameraMode = 'behind' | 'broadcast' | 'tactical';

/** What the match screen needs from either the 3D view or the flat pitch. */
export interface FieldView {
  replaying: boolean;
  lost: boolean;
  setQuality(quality: 'low' | 'medium' | 'high'): void;
  setStadium(info: StadiumInfo, quality: 'low' | 'medium' | 'high'): void;
  resize(width: number, height: number): void;
  punch(amount?: number): void;
  startReplay(frames: Snapshot[]): void;
  skipReplay(): void;
  update(dt: number, match: Match | null, mode: CameraMode, showTen: boolean, menu: boolean): void;
  render(): void;
}
