import { Capacitor } from '@capacitor/core';

/** AdMob application id for com.ultimatefooty.meridian. The manifest reads the same value. */
export const ADMOB_APP_ID = 'ca-app-pub-5343512610086636~3022193589';

/** Banner ad unit "Menu banner". Hidden during a live match. */
export const MENU_BANNER_AD_ID = 'ca-app-pub-5343512610086636/1993017095';

const DEMO_PUBLISHER = '3940256099942544';

export function bannerForScreen(screen: string): boolean {
  return screen !== 'match';
}

export function adsSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

let wanted = false;
let shown = false;
let ready: Promise<boolean> | null = null;
let tail: Promise<void> = Promise.resolve();

function setInset(height: number): void {
  const px = height > 0 ? `${Math.ceil(height)}px` : '0px';
  document.documentElement.style.setProperty('--ad-banner', px);
  document.body.classList.toggle('ad-banner', height > 0);
}

async function prepare(): Promise<boolean> {
  if (MENU_BANNER_AD_ID.includes(DEMO_PUBLISHER) || ADMOB_APP_ID.includes(DEMO_PUBLISHER)) return false;
  const { AdMob, AdmobConsentStatus, BannerAdPluginEvents, MaxAdContentRating } = await import('@capacitor-community/admob');
  try {
    let consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      consent = await AdMob.showConsentForm();
    }
    if (!consent.canRequestAds) return false;
    await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.General });
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
      setInset(wanted && size.height > 0 ? size.height : 0);
    });
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
      shown = false;
      setInset(0);
    });
    await AdMob.addListener(BannerAdPluginEvents.Closed, () => {
      setInset(0);
    });
    return true;
  } catch {
    return false;
  }
}

async function apply(): Promise<void> {
  const show = wanted;
  const ok = ready ? await ready : false;
  if (!ok || wanted !== show) return;
  const { AdMob, BannerAdPosition, BannerAdSize } = await import('@capacitor-community/admob');
  try {
    if (show) {
      if (!shown) {
        await AdMob.showBanner({
          adId: MENU_BANNER_AD_ID,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
        });
        shown = true;
      } else {
        await AdMob.resumeBanner();
      }
      if (!wanted) {
        await AdMob.hideBanner();
        setInset(0);
      }
    } else if (shown) {
      await AdMob.hideBanner();
      setInset(0);
    }
  } catch {
    shown = false;
    setInset(0);
  }
}

/** Shows or hides the menu banner. No-op in a browser and on any platform other than the Android app. */
export function setMenuBanner(show: boolean): void {
  if (!adsSupported()) return;
  wanted = show;
  if (!ready) ready = prepare();
  tail = tail.then(() => apply()).catch(() => {
    shown = false;
    setInset(0);
  });
}
