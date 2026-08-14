# Weather

A React app styled after the iOS Weather app: current conditions, 24-hour scroll,
10-day forecast, and detail tiles (UV, wind, humidity, sunrise/sunset, pressure,
visibility, precipitation chance). Background gradient and animation change with
the current condition and time of day.

Built as an installable PWA, so it runs on Android as a home-screen app.
See `ANDROID-SETUP.md` for the phone install walkthrough.

## Running it locally

No build step and no npm needed at runtime — React is vendored in `vendor/`.
But the app loads `app.js` and `styles.css` over HTTP, which browsers block on a
plain `file://` page, so it needs a local server. Run:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

then open `http://localhost:8123/`. Stop it with Ctrl+C.

## Files

| File | What it is |
|------|-----------|
| `index.html` | Page shell, PWA metadata, service worker registration |
| `app.jsx` | **Source.** All app logic and components, written in JSX |
| `app.js` | **Generated.** Pre-compiled build of `app.jsx` — this is what runs |
| `styles.css` | iOS-style glass panels, gradients, layout |
| `manifest.json` | App name, icons, colours — makes it installable |
| `sw.js` | Service worker; caches the app shell for offline/instant load |
| `icons/` | Home-screen icons (192, 512, apple-touch) |
| `vendor/` | React + ReactDOM, vendored so there's no CDN dependency |
| `serve.ps1` | Local static server for development |
| `build.ps1` | Compiles `app.jsx`, bumps the cache version, syncs `docs/` |
| `deploy.ps1` | Pushes to GitHub and enables Pages |
| `docs/` | **Generated.** Clean deployable copy — this is what GitHub Pages serves |

## Editing it

Edit `app.jsx`, never `app.js` — `app.js` is generated and will be overwritten.

Then run the build:

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

It prints a URL — open it in a browser and the page compiles itself, then the
script finishes on its own. Three things happen:

1. `app.jsx` is compiled to `app.js`
2. `CACHE_VERSION` in `sw.js` is bumped
3. The shell files are copied into `docs/`

Step 2 matters: without a new cache version, phones that already installed the
app keep serving the old copy from the service worker and your change never
appears. The build does it for you so it can't be forgotten.

Why a browser is involved: there's no Node/npm on this machine, so there's no
local JSX compiler. `build.ps1` serves a page that loads Babel, compiles
`app.jsx`, and POSTs the result back to the script to write to disk. It needs
internet (Babel comes from a CDN) but nothing installed.

Then deploy:

```powershell
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

## Deploying

```powershell
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

Requires `gh` signed in as `arunkumarr1` (not the work account). Publishes to
<https://arunkumarr1.github.io/weather/>.

## Data sources

- Weather: [Open-Meteo](https://open-meteo.com/) forecast API (free, no key)
- City search: Open-Meteo geocoding API
- "Current location" name lookup: [BigDataCloud](https://www.bigdatacloud.com/)
  reverse-geocode API (free, no key)

Browser geolocation supplies the initial location if you allow it; otherwise it
falls back to Singapore. Geolocation only works over `https://` or `localhost`,
which is why the deployed version needs a real host rather than a shared file.

## Scope

Deliberately cut, not missing by accident: swipeable multi-city list,
precipitation map, air quality, severe weather alerts, moon phase. Single
location plus search only.
