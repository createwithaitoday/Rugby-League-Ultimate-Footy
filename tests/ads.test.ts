import { describe, expect, it } from 'vitest';
import { ADMOB_APP_ID, MENU_BANNER_AD_ID, adsSupported, bannerForScreen, setMenuBanner } from '../src/game/ads';

describe('menu banner', () => {
  it('uses the Vanta Works banner unit and stays off during a match', () => {
    expect(ADMOB_APP_ID).toBe('ca-app-pub-5343512610086636~3022193589');
    expect(MENU_BANNER_AD_ID).toBe('ca-app-pub-5343512610086636/1993017095');
    expect(ADMOB_APP_ID.includes('3940256099942544')).toBe(false);
    expect(MENU_BANNER_AD_ID.includes('3940256099942544')).toBe(false);
    expect(bannerForScreen('menu')).toBe(true);
    expect(bannerForScreen('results')).toBe(true);
    expect(bannerForScreen('match')).toBe(false);
    expect(adsSupported()).toBe(false);
    setMenuBanner(true);
    setMenuBanner(false);
  });
});
