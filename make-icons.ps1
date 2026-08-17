# Regenerates the home-screen icons in icons/.
#
#   powershell -ExecutionPolicy Bypass -File make-icons.ps1
#
# Same trick as build.ps1: there is no image tooling on this machine, so the
# artwork is drawn as SVG, rasterised by a browser canvas, and POSTed back here
# to be written as PNG. Open the URL it prints; the script exits on its own.
#
# Keep this file ASCII-only (PowerShell 5.1 reads .ps1 as ANSI).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 8123
$iconDir = Join-Path $root "icons"

$page = @'
<!doctype html>
<html><head><meta charset="utf-8"><title>Icons</title>
<style>body{font:15px system-ui;background:#111;color:#eee;padding:20px}
img{margin:8px;vertical-align:middle;background:#222}
.ok{color:#6ee787}.err{color:#ff7b72}</style></head>
<body>
<h2>Generating icons</h2>
<div id="log">Drawing...</div>
<div id="preview"></div>
<script>
var log = document.getElementById("log");
var preview = document.getElementById("preview");

/* Content sits inside the middle ~72% so Android's circular maskable crop
   never clips the sun or the cloud. Background is full bleed. */
function svg(size) {
  return '' +
'<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 100 100">' +
  '<defs>' +
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#1B6BC0"/>' +
      '<stop offset="55%" stop-color="#3E93DA"/>' +
      '<stop offset="100%" stop-color="#7FBDEC"/>' +
    '</linearGradient>' +
    /* userSpaceOnUse so every part of the cloud samples ONE gradient. With the
       default objectBoundingBox each circle gets its own, and the internal
       edges show up as seams. */
    '<linearGradient id="cl" gradientUnits="userSpaceOnUse" x1="0" y1="31" x2="0" y2="78">' +
      '<stop offset="0%" stop-color="#FFFFFF"/>' +
      '<stop offset="100%" stop-color="#E2EBF6"/>' +
    '</linearGradient>' +
  '</defs>' +
  '<rect width="100" height="100" fill="url(#sky)"/>' +
  /* sun, upper left */
  '<g fill="#FFC02E" stroke="#FFC02E" stroke-width="4.6" stroke-linecap="round">' +
    '<circle cx="38" cy="35" r="12.5" stroke-width="0"/>' +
    '<line x1="38" y1="16.5" x2="38" y2="12"/>' +
    '<line x1="51.1" y1="21.9" x2="54.2" y2="18.8"/>' +
    '<line x1="56.5" y1="35" x2="61" y2="35"/>' +
    '<line x1="24.9" y1="21.9" x2="21.8" y2="18.8"/>' +
    '<line x1="19.5" y1="35" x2="15" y2="35"/>' +
    '<line x1="24.9" y1="48.1" x2="21.8" y2="51.2"/>' +
  '</g>' +
  /* cloud, lower right, same silhouette as the in-app icons */
  '<g>' +
    '<rect x="24" y="63" width="54" height="15" rx="7.5" fill="#BFD0E2"/>' +
    '<circle cx="37" cy="58" r="14" fill="url(#cl)"/>' +
    '<circle cx="55" cy="50" r="19" fill="url(#cl)"/>' +
    '<circle cx="70" cy="60" r="12.5" fill="url(#cl)"/>' +
    '<rect x="24" y="60" width="54" height="14" rx="7" fill="url(#cl)"/>' +
  '</g>' +
'</svg>';
}

function render(size) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas");
      c.width = size; c.height = size;
      var g = c.getContext("2d");
      g.drawImage(img, 0, 0, size, size);
      resolve(c.toDataURL("image/png").split(",")[1]);
    };
    img.onerror = function () { reject(new Error("svg render failed at " + size)); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(size));
  });
}

var jobs = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180]
];

(function next(i) {
  if (i >= jobs.length) {
    log.innerHTML = '<span class="ok">Done. All icons written. You can close this tab.</span>';
    fetch("__done", { method: "POST", body: "ok" });
    return;
  }
  var name = jobs[i][0], size = jobs[i][1];
  log.textContent = "Rendering " + name + " (" + size + "px)...";
  render(size).then(function (b64) {
    var im = new Image();
    im.src = "data:image/png;base64," + b64;
    im.width = 72; im.height = 72;
    preview.appendChild(im);
    return fetch("__icon/" + name, { method: "POST", body: b64 });
  }).then(function () { next(i + 1); })
    .catch(function (e) {
      log.innerHTML = '<span class="err">FAILED: ' + e.message + '</span>';
      fetch("__fail", { method: "POST", body: e.message });
    });
})(0);
</script>
</body></html>
'@

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  throw "Could not listen on port $port. Stop serve.ps1 or build.ps1 and retry."
}

Write-Host "Icon builder on http://localhost:$port/ - open it to generate." -ForegroundColor Cyan

$done = $false
$failed = $null
$written = @()

while ($listener.IsListening -and -not $done -and -not $failed) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = $req.Url.LocalPath.TrimStart("/")

    if ($req.HttpMethod -eq "POST" -and $path.StartsWith("__icon/")) {
      $name = $path.Substring(7)
      if ($name -notmatch '^[A-Za-z0-9._-]+\.png$') { throw "bad icon name: $name" }
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $b64 = $reader.ReadToEnd()
      $reader.Close()
      $bytes = [System.Convert]::FromBase64String($b64)
      [System.IO.File]::WriteAllBytes((Join-Path $iconDir $name), $bytes)
      $written += "$name ($($bytes.Length) bytes)"
      Write-Host "  wrote $name  $($bytes.Length) bytes" -ForegroundColor Green
      $res.StatusCode = 204
    }
    elseif ($req.HttpMethod -eq "POST" -and $path -eq "__done") {
      $done = $true
      $res.StatusCode = 204
    }
    elseif ($req.HttpMethod -eq "POST" -and $path -eq "__fail") {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $failed = $reader.ReadToEnd()
      $reader.Close()
      $res.StatusCode = 204
    }
    else {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($page)
      $res.ContentType = "text/html"
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
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

if ($failed) { throw "Icon generation failed: $failed" }
Write-Host ""
Write-Host "Icons regenerated:" -ForegroundColor Green
$written | ForEach-Object { Write-Host "  $_" }
Write-Host "Now run build.ps1 to copy them into docs/." -ForegroundColor Cyan
