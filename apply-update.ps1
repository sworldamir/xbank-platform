param(
  [string]$TargetPath = (Join-Path $HOME 'Desktop\xbank-platform')
)

$ErrorActionPreference = 'Stop'
$UpdatePath = $PSScriptRoot
$ParentPath = Split-Path -Parent $TargetPath
$TargetName = Split-Path -Leaf $TargetPath
$StagingPath = Join-Path $ParentPath ($TargetName + '-staging')

if (-not (Test-Path (Join-Path $UpdatePath 'package.json')) -or -not (Test-Path (Join-Path $UpdatePath 'server\index.mjs'))) {
  throw 'This folder does not look like the XBank update package.'
}
if ([IO.Path]::GetFullPath($UpdatePath).TrimEnd('\') -eq [IO.Path]::GetFullPath($TargetPath).TrimEnd('\')) {
  throw 'Extract the update to a separate folder before applying it.'
}

Remove-Item $StagingPath -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $StagingPath | Out-Null

& robocopy $UpdatePath $StagingPath /E /XD '.git' 'node_modules' 'dist' 'coverage' '.vite' /XF '.env' 'db.json' | Out-Host
if ($LASTEXITCODE -ge 8) { throw "Failed to stage update (robocopy exit code $LASTEXITCODE)." }

# Preserve the existing Git history and local environment, if present.
if (Test-Path (Join-Path $TargetPath '.git')) {
  Copy-Item -LiteralPath (Join-Path $TargetPath '.git') -Destination (Join-Path $StagingPath '.git') -Recurse -Force
}
$TemplateEnv = Join-Path $StagingPath '.env.example'
$TargetEnv = Join-Path $StagingPath '.env'
if (Test-Path (Join-Path $TargetPath '.env')) {
  $existingLines = Get-Content -LiteralPath (Join-Path $TargetPath '.env')
  $existingKeys = @{}
  foreach ($line in $existingLines) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=') { $existingKeys[$Matches[1]] = $true }
  }
  $missingLines = @()
  foreach ($line in (Get-Content -LiteralPath $TemplateEnv)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=' -and -not $existingKeys.ContainsKey($Matches[1])) {
      $missingLines += $line
      $existingKeys[$Matches[1]] = $true
    }
  }
  Set-Content -LiteralPath $TargetEnv -Value $existingLines -Encoding UTF8
  if ($missingLines.Count -gt 0) { Add-Content -LiteralPath $TargetEnv -Value $missingLines -Encoding UTF8 }
} else {
  Copy-Item -LiteralPath $TemplateEnv -Destination $TargetEnv -Force
}

$BackupPath = $TargetPath + '-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
if (Test-Path $TargetPath) {
  Rename-Item -LiteralPath $TargetPath -NewName (Split-Path -Leaf $BackupPath)
}
try {
  Rename-Item -LiteralPath $StagingPath -NewName $TargetName
} catch {
  if (Test-Path $BackupPath) {
    Rename-Item -LiteralPath $BackupPath -NewName $TargetName
  }
  throw
}

Write-Host ''
Write-Host 'XBank update applied.' -ForegroundColor Green
Write-Host "Previous project backup: $BackupPath" -ForegroundColor Yellow
Write-Host "Updated project: $TargetPath" -ForegroundColor Green
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host "  cd `"$TargetPath`""
Write-Host '  notepad .env   # Verify PostgreSQL credentials and mail settings'
Write-Host '  docker compose up -d db'
Write-Host '  npm install'
Write-Host '  npm run db:migrate'
Write-Host '  npm run admin:create   # Create the first administrator with a strong password'
Write-Host '  npm test'
Write-Host '  npm run dev'
Write-Host ''
Write-Host 'Do not enable real-money operations or expose this system publicly before the documented legal, chain-verification, security and operational reviews.' -ForegroundColor Yellow
