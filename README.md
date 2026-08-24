# Bochog Kakei

A simple household money app, inspired by **AssetFlow** (formerly CashFlow). It runs in the browser on iPhone, iPad, Android, Windows, macOS, and Linux. There is **no login** and **no Apple fee** — this is a web app, like [Bochog Plant Care](https://github.com/vs-tes/bochog-plant-care).

**Current savings** = cash + bank + savings − credit cards − bills due (utilities, insurance, etc.).

Money data stays **on this device** (IndexedDB). It is not uploaded to a server.

## iPhone (same as Plant Care)

1. On your iPhone, open **Safari** (not Chrome).
2. Go to **https://vs-tes.github.io/bochog-kakei/**
3. Tap Share → **Add to Home Screen**
4. Open **Kakei** from the new icon

If you already added this URL when it still showed Plant Care, delete that Home Screen icon and add it again.

Data on the iPhone is separate from data on this Mac. Use **Settings → Export backup** if you want to copy it.

## Use it

1. **Accounts** — add each bank/cash balance, then credit cards and bills. The big number is current savings.
2. **Activity** — payment, deposit, transfer, or balance adjustment.
3. **Report** — this month’s income and expenses.
4. **Settings** — currency, light/dark, backup.

## GitHub Pages

Hosted from branch `main` / root, same as Plant Care:

https://vs-tes.github.io/bochog-kakei/

## Run locally

```bash
python3 -m http.server 8787 --bind 0.0.0.0
```

Open `http://localhost:8787` on this Mac.
