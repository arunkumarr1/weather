# Builds the app after you edit app.jsx.
#
#   powershell -ExecutionPolicy Bypass -File build.ps1
#
# Three steps, in order:
#   1. Compile app.jsx -> app.js
#   2. Bump CACHE_VERSION in sw.js (else installed phones keep the old copy)
#   3. Copy the shell files into docs/ (what GitHub Pages serves)
#
# There is no Node/npm on this machine, so the compile is done by Babel running
# in a browser: this script serves a page that fetches app.jsx, transforms it,
# and POSTs the result back here to be written to disk. The script waits for
# that POST, then finishes the remaining steps and exits.
#
# Keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI, so a
# stray em-dash or ellipsis in a comment can break the parser.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 8123

# ---------------------------------------------------------------- compile

$buildPage = @'
<!doctype html>
<html><head><meta charset="utf-8"><title>Building</title>
<style>
 body{font:15px system-ui;background:#111;color:#eee;padding:24px;line-height:1.6}
 .ok{color:#6ee787} .err{color:#ff7b72} pre{white-space:pre-wrap;color:#aaa;font-size:12px}
</style></head>
<body>
<h2>Compiling app.jsx</h2>
<div id="log">Loading Babel...</div>
<pre id="detail"></pre>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script>
var log = document.getElementById("log");
var detail = document.getElementById("detail");
function say(html, cls) { log.innerHTML = '<span class="' + (cls||'') + '">' + html + '</span>'; }

if (typeof Babel === "undefined") {
  say("Babel failed to load. Check your internet connection.", "err");
} else {
  fetch("app.jsx?t=" + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error("could not read app.jsx (HTTP " + r.status + ")");
      return r.text();
    })
    .then(function (src) {
      say("Transforming " + src.length + " chars...");
      var out = Babel.transform(src, {
        presets: [["react", { runtime: "classic" }]],
        filename: "app.jsx"
      }).code;
      say("Writing app.js (" + out.length + " chars)...");
      return fetch("__write", { method: "POST", body: out });
    })
    .then(function (r) { return r.text(); })
    .then(function (t) { say("Done. " + t + " You can close this tab.", "ok"); })
    .catch(function (e) {
      say("FAILED: " + e.message, "err");
      detail.textContent = e.stack || "";
      fetch("__fail", { method: "POST", body: e.message }).catch(function(){});
    });
}
</script>
</body></html>
'@

$mime = @{
  ".html"="text/html"; ".css"="text/css"; ".js"="application/javascript";
  ".jsx"="text/plain"; ".json"="application/json"; ".png"="image/png";
  ".svg"="image/svg+xml"; ".ico"="image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  throw "Could not listen on port $port. Is serve.ps1 already running? Stop it and retry."
}

Write-Host "Build server on http://localhost:$port/ - open that page to compile." -ForegroundColor Cyan
Write-Host "Waiting for the browser to POST the compiled output..."

$compiled = $false
$failed = $null

while ($listener.IsListening -and -not $compiled -and -not $failed) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = $req.Url.LocalPath.TrimStart("/")

    if ($req.HttpMethod -eq "POST" -and $path -eq "__write") {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $code = $reader.ReadToEnd()
      $reader.Close()
      if ([string]::IsNullOrWhiteSpace($code)) { throw "empty body" }
      # UTF8 with no BOM, so the generated file stays clean in diffs.
      $utf8 = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::WriteAllText((Join-Path $root "app.js"), $code, $utf8)
      $compiled = $true
      $msg = [System.Text.Encoding]::UTF8.GetBytes("app.js written ($($code.Length) chars)")
      $res.ContentType = "text/plain"
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    elseif ($req.HttpMethod -eq "POST" -and $path -eq "__fail") {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $failed = $reader.ReadToEnd()
      $reader.Close()
      $res.StatusCode = 204
    }
    elseif ($path -eq "" -or $path -eq "index.html") {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($buildPage)
      $res.ContentType = "text/html"
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    else {
      $file = Join-Path $root $path
      if (Test-Path $file -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($file)
        $ct = $mime[$ext]
        if (-not $ct) { $ct = "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $res.ContentType = $ct
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
    }
  } catch {
    $res.StatusCode = 500
    $failed = $_.Exception.Message
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}

$listener.Stop()
$listener.Close()

if ($failed) { throw "Compile failed: $failed" }
if (-not $compiled) { throw "No compiled output received." }
Write-Host "  app.js compiled." -ForegroundColor Green

# ---------------------------------------------------- bump the cache version

$swPath = Join-Path $root "sw.js"
$sw = Get-Content $swPath -Raw
$m = [regex]::Match($sw, 'const CACHE_VERSION = "weather-v(\d+)"')
if (-not $m.Success) { throw "Could not find CACHE_VERSION in sw.js" }
$next = [int]$m.Groups[1].Value + 1
$sw = $sw -replace 'const CACHE_VERSION = "weather-v\d+"', "const CACHE_VERSION = `"weather-v$next`""
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($swPath, $sw, $utf8)
Write-Host "  CACHE_VERSION -> weather-v$next" -ForegroundColor Green

# --------------------------------------------------------- sync docs/

$docs = Join-Path $root "docs"
New-Item -ItemType Directory -Path $docs -Force | Out-Null
foreach ($f in @("index.html", "app.js", "styles.css", "manifest.json", "sw.js")) {
  Copy-Item (Join-Path $root $f) (Join-Path $docs $f) -Force
}
foreach ($d in @("icons", "vendor")) {
  $src = Join-Path $root $d
  if (Test-Path $src) {
    Copy-Item $src -Destination $docs -Recurse -Force
  }
}
Write-Host "  docs/ synced." -ForegroundColor Green

Write-Host ""
Write-Host "Build complete. Next: powershell -ExecutionPolicy Bypass -File deploy.ps1" -ForegroundColor Cyan
