# Getting the Weather app onto your Android phone

Written for someone who hasn't done this before. Nothing here requires coding.

The end result: a **Weather icon in your app drawer**, opening full-screen with
no browser bars — indistinguishable from a normal app to use. Android builds a
real app wrapper (a "WebAPK") behind the scenes.

> ## ✅ Stage 1 is already done — the app is live
>
> **<https://arunkumarr1.github.io/weather/>**
>
> Skip straight to **Stage 2** below and install it on your phone.
> Stage 1 is kept only as a record of how it was published, and for
> re-deploying later.

There are two stages: **put it online once** (on the PC), then **install it**
(on the phone).

---

## Stage 1 — Put it online (on the PC, ~5 minutes) — DONE

The app has to live at a real `https://` web address. It can't be copied to the
phone as a file, because Android blocks location access and app-install for
pages opened from files.

### 1a. Account and repository — done

You already have the personal account **`arunkumarr1`** and an empty public
repository at <https://github.com/arunkumarr1/weather>. Nothing to do here.

### 1b. Sign the GitHub tool in as `arunkumarr1`

This is the one step I can't do for you — it involves signing in, and I don't
handle passwords or authenticate on your behalf.

Right now the `gh` tool on this PC is signed in as your **work** account
(`arun-us2`), which has no permission to write to your personal repository.

Open **PowerShell** (press Start, type `PowerShell`, press Enter) and run:

```powershell
gh auth login
```

Answer the prompts:

| Prompt | Answer |
|--------|--------|
| What account do you want to log into? | **GitHub.com** |
| What is your preferred protocol? | **HTTPS** |
| Authenticate Git with your GitHub credentials? | **Yes** |
| How would you like to authenticate? | **Login with a web browser** |

It shows a one-time code, then opens your browser. Copy the code in, sign in as
**arunkumarr1**, and approve.

> Your work account stays signed in as well — nothing is removed.
> `gh auth switch` flips between the two accounts later.

Confirm it worked:

```powershell
gh auth status
```

You want to see `Logged in to github.com account arunkumarr1` with
`Active account: true`.

### 1c. Publish

Either tell me it's done and I'll run it, or run it yourself:

```powershell
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

It uploads the app and switches on GitHub Pages. After a minute or two your app
is live at:

```
https://arunkumarr1.github.io/weather/
```

The repository is **public**, so anyone with the link can read the code. There's
nothing sensitive in it — no keys, no passwords, no personal data.

---

## Stage 2 — Install it on the phone (~2 minutes)

1. Open **Chrome** on your Android phone.
   (Chrome specifically — Samsung Internet and Firefox handle this differently.)
2. Go to `https://arunkumarr1.github.io/weather/`
3. Wait for the weather to load. Tap **Allow** when it asks for your location —
   that's what makes it show *your* weather instead of the fallback city.
4. Tap the **⋮** menu, top right.
5. Tap **Add to Home screen** (may read **Install app**).
6. Confirm **Install**.

The icon appears on your home screen and in your app drawer. Opening it from
there launches it full-screen with no address bar.

### Checking it worked

- No browser address bar when opened from the icon → installed properly.
- Still shows an address bar → it saved a plain bookmark instead. Delete it,
  reload the page in Chrome, wait for it to fully load, then retry from step 4.

---

## Things worth knowing

**It needs internet for weather.** The app itself is cached and opens instantly
offline, but the forecast comes from a live service. Offline you'll see the last
screen, not fresh data.

**Location can be changed by hand.** Tap the search box and type any city —
useful when you're travelling, or if you skipped the location permission.

**°C / °F** — the button top right toggles units, and re-fetches in that unit.

**Updating it later.** If I change the app, you don't reinstall. Just open it
and it picks up the new version (a bumped `CACHE_VERSION` in `sw.js` forces
this — without that bump, the phone keeps serving the old cached copy).

**Battery and background.** It does nothing in the background — no widget, no
notifications, no location tracking when closed. It only fetches when open.

---

## If you'd rather not put it online at all

You can run it from the PC over your home WiFi instead. No account, no upload,
but it only works at home with the PC switched on, and there's no app icon:

1. On the PC, run `powershell -ExecutionPolicy Bypass -File serve.ps1`
2. Find the PC's local address: `ipconfig` → look for **IPv4 Address**,
   something like `192.168.1.42`
3. On the phone (same WiFi), open `http://192.168.1.42:8123`

Location permission won't work over plain `http://` from another device, so
you'd have to search for your city by name. Windows Firewall may also prompt to
allow the connection the first time.
