param(
  [string]$ExtensionDir = "dist",
  [string]$KeyPath = "dist.pem",
  [string]$BrowserPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$extensionPath = Resolve-Path -LiteralPath (Join-Path $repoRoot $ExtensionDir)
$resolvedKeyPath = Resolve-Path -LiteralPath (Join-Path $repoRoot $KeyPath)
$crxPath = Join-Path $repoRoot ((Split-Path -Leaf $extensionPath) + ".crx")
$profilePath = Join-Path ([System.IO.Path]::GetTempPath()) "lingkuma-pack-crx-profile"

function Find-BrowserPath {
  $candidates = @(
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "Could not find Chrome or Edge. Pass -BrowserPath with the browser executable path."
}

if (-not $BrowserPath) {
  $BrowserPath = Find-BrowserPath
}

if (-not (Test-Path -LiteralPath $BrowserPath)) {
  throw "Browser executable not found: $BrowserPath"
}

if (Test-Path -LiteralPath $crxPath) {
  Remove-Item -LiteralPath $crxPath -Force
}

New-Item -ItemType Directory -Force -Path $profilePath | Out-Null

& $BrowserPath "--pack-extension=$extensionPath" "--pack-extension-key=$resolvedKeyPath" "--user-data-dir=$profilePath" "--disable-crash-reporter" "--no-first-run" "--no-default-browser-check"

for ($i = 0; $i -lt 30 -and -not (Test-Path -LiteralPath $crxPath); $i++) {
  Start-Sleep -Milliseconds 500
}

if (-not (Test-Path -LiteralPath $crxPath)) {
  throw "Expected CRX was not created: $crxPath"
}

Write-Host "Created $crxPath"