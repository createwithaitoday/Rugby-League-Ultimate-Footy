import { createReadStream, readFileSync } from 'node:fs';
import { google } from 'googleapis';

const packageName = 'com.ultimatefooty.national';
const aabPath = new URL('../android/app/build/outputs/bundle/release/app-release.aab', import.meta.url);
const key = JSON.parse(readFileSync(new URL('../play-service-account.json', import.meta.url), 'utf8'));

const auth = new google.auth.GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const androidpublisher = google.androidpublisher({ version: 'v3', auth });

async function main() {
  const edit = await androidpublisher.edits.insert({ packageName });
  const editId = edit.data.id;
  console.log('edit', editId);

  const upload = await androidpublisher.edits.bundles.upload({
    packageName,
    editId,
    media: {
      mimeType: 'application/octet-stream',
      body: createReadStream(aabPath),
    },
  });
  console.log('bundle versionCode', upload.data.versionCode);

  await androidpublisher.edits.tracks.update({
    packageName,
    editId,
    track: 'production',
    requestBody: {
      track: 'production',
      releases: [{
        name: '1.0.0',
        versionCodes: [String(upload.data.versionCode)],
        status: 'completed',
        releaseNotes: [{
          language: 'en-US',
          text: 'Mega Smash: Rugby League 27 — full-size athletes, city clubs, mega hits, slow-mo, blood FX, fights and brawls.',
        }],
      }],
    },
  });

  try {
    await androidpublisher.edits.listings.patch({
      packageName,
      editId,
      language: 'en-US',
      requestBody: {
        title: 'Mega Smash: Rugby Lge 27',
        shortDescription: 'Full-size rugby league. Mega hits, fights, slow-mo carnage.',
        fullDescription: 'Mega Smash: Rugby League 27 is a 13-a-side rugby league match engine with full-size athletes, city club names, real jersey colours, mega smash tackles, blood and injury FX, slow-mo impact replays, temper fights, and all-in brawls. Not an official NRL product.',
      },
    });
  } catch (err) {
    console.warn('listing patch skipped', err?.message || err);
  }

  const commit = await androidpublisher.edits.commit({ packageName, editId });
  console.log('committed', commit.data.id || editId);
}

main().catch((err) => {
  console.error(JSON.stringify({
    message: err.message,
    code: err.code,
    errors: err.errors,
    response: err.response?.data,
  }, null, 2));
  process.exit(1);
});
