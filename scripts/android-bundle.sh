#!/usr/bin/env bash
# Build a signed release Android App Bundle targeting the SDK installed in ANDROID_HOME.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "${HOME}/android-sdk" ]]; then
    export ANDROID_HOME="${HOME}/android-sdk"
  else
    echo "Set ANDROID_HOME to an Android SDK that includes platform android-36." >&2
    exit 1
  fi
fi
export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"

if [[ ! -f android/keystore.properties ]]; then
  echo "android/keystore.properties is missing. The release bundle must be signed with the upload key, and that file is not committed." >&2
  exit 1
fi

mkdir -p android
if [[ ! -f android/local.properties ]]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
fi

npm run build
npx cap sync android
cd android
chmod +x ./gradlew
./gradlew bundleRelease
echo "AAB: ${root}/android/app/build/outputs/bundle/release/app-release.aab"
