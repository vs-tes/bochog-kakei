# Bochog Plant Care

A private plant care and watering schedule. It runs in the browser on your iPhone (and any computer). There is **no Apple fee** — this is a web app, not an App Store app.

## Source code

This app is built with **HTML, CSS, and JavaScript** (no extra framework). Archive or copy this folder:

`/Users/vonzki-macbook-air-m4/bochog-plant-care`

Main files: `index.html`, `styles.css`, `app.js`, `db.js`.

Plant data (photos, watering dates) is **not** in that folder. It lives in the browser (IndexedDB). Use **Settings → Export backup** to archive your plants.

## Features

- Name, photo, location (rooms in your home)
- Light, watering, optional misting, fertilize, and repot
- Last watered / next water, plus a care log
- Status: healthy, due soon, water now, overdue
- Grouped by room, search, clone, and water/mist several plants at once
- Species presets when adding a plant
- Notes
- Add to iPhone Home Screen so it feels like a normal app

## Run locally

From this folder:

```bash
python3 -m http.server 8787 --bind 0.0.0.0
```

Then open `http://localhost:8787` on this Mac.

On your iPhone (same Wi-Fi): open `http://YOUR-MAC-IP:8787` in Safari.

### Add to iPhone Home Screen

1. Open the site in **Safari** (not Chrome).
2. Tap Share → **Add to Home Screen**.
3. Open Bochog from the new icon.

Apple charges $99/year only to publish a native app on the App Store. Home Screen web apps do not need that.

## Put it online later (still free)

GitHub Pages or Cloudflare Pages can host this folder. Plants are still stored **on each phone**, not in the cloud — export a backup if you want a copy.

## Later (not in this first version)

- Push reminders
- Sync between iPhone and Mac
- QNAP hosting
