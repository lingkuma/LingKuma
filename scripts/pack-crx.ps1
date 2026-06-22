param(
  [string]$ExtensionDir = "dist",
  [string]$KeyPath = "dist.pem",
  [string]$BrowserPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$extensionPath = Resolve-Path -LiteralPath (Join-Path $repoRoot $ExtensionDir)
$resolvedKeyPath = Resolve-Path -LiteralPath (Join-Path $repoRoot $KeyPath)
$manifestPath = Join-Path $extensionPath "manifest.json"
$defaultCrxPath = Join-Path $repoRoot ((Split-Path -Leaf $extensionPath) + ".crx")
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

function Get-UniquePath([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $Path
  }

  $directory = Split-Path -Parent $Path
  $name = [System.IO.Path]::GetFileNameWithoutExtension($Path)
  $extension = [System.IO.Path]::GetExtension($Path)

  for ($i = 1; $i -lt 1000; $i++) {
    $candidate = Join-Path $directory ("{0}-{1}{2}" -f $name, $i, $extension)
    if (-not (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw "Could not find an unused output path for $Path"
}

if (-not $BrowserPath) {
  $BrowserPath = Find-BrowserPath
}

if (-not (Test-Path -LiteralPath $BrowserPath)) {
  throw "Browser executable not found: $BrowserPath"
}

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
  throw "Manifest version is missing: $manifestPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$outputPath = Get-UniquePath (Join-Path $repoRoot ("LingKuma-v{0}-{1}.crx" -f $version, $timestamp))

if (Test-Path -LiteralPath $defaultCrxPath) {
  Remove-Item -LiteralPath $defaultCrxPath -Force
}

New-Item -ItemType Directory -Force -Path $profilePath | Out-Null

& $BrowserPath "--pack-extension=$extensionPath" "--pack-extension-key=$resolvedKeyPath" "--user-data-dir=$profilePath" "--disable-crash-reporter" "--no-first-run" "--no-default-browser-check"

for ($i = 0; $i -lt 30 -and -not (Test-Path -LiteralPath $defaultCrxPath); $i++) {
  Start-Sleep -Milliseconds 500
}

if (-not (Test-Path -LiteralPath $defaultCrxPath)) {
  throw "Expected CRX was not created: $defaultCrxPath"
}

$moveSucceeded = $false
for ($i = 0; $i -lt 30 -and -not $moveSucceeded; $i++) {
  try {
    Move-Item -LiteralPath $defaultCrxPath -Destination $outputPath
    $moveSucceeded = $true
  } catch {
    if ($i -eq 29) {
      throw
    }
    Start-Sleep -Milliseconds 500
  }
}

Write-Host "Created $outputPath"