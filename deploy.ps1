param(
  [Parameter(Position = 0, Mandatory = $true)]
  [string]$ServerIp,

  [Parameter(Position = 1, Mandatory = $true)]
  [string]$Username
)

$ErrorActionPreference = "Stop"

function Quote-BashValue {
  param([AllowNull()][string]$Value)

  if ($null -eq $Value) {
    return "''"
  }

  return "'" + ($Value -replace "'", "'\''") + "'"
}

function Get-OptionalEnvAssignment {
  param([string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrEmpty($value)) {
    return $null
  }

  return "$Name=$(Quote-BashValue $value)"
}

function Invoke-BashDeploy {
  param(
    [string]$BashExecutable,
    [string[]]$BashBaseArgs = @(),
    [string]$RepoPathCommand,
    [string]$RunnerName
  )

  $repoPath = & $BashExecutable @BashBaseArgs -lc $RepoPathCommand
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoPath)) {
    throw "Gagal mengubah path repo Windows ke path Bash untuk $RunnerName."
  }

  Write-Host "Menjalankan deploy lewat $RunnerName..."
  $deployScript = "$repoPath/deploy.sh"
  & $BashExecutable @BashBaseArgs $deployScript $ServerIp $Username
  exit $LASTEXITCODE
}

function Test-BashRunner {
  param(
    [string]$BashExecutable,
    [string[]]$BashBaseArgs = @()
  )

  & $BashExecutable @BashBaseArgs -lc "command -v bash >/dev/null" *> $null
  return $LASTEXITCODE -eq 0
}

function Get-GitBashCandidates {
  $candidates = @()

  $pathBash = Get-Command bash.exe -ErrorAction SilentlyContinue
  if ($pathBash -and $pathBash.Source -like "*\Git\*") {
    $candidates += $pathBash.Source
  }

  $git = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($git) {
    $gitRoot = Split-Path -Parent (Split-Path -Parent $git.Source)
    $candidates += Join-Path $gitRoot "bin\bash.exe"
    $candidates += Join-Path $gitRoot "usr\bin\bash.exe"
  }

  $candidates += Join-Path $env:ProgramFiles "Git\bin\bash.exe"
  $candidates += Join-Path $env:ProgramFiles "Git\usr\bin\bash.exe"

  $programFilesX86 = ${env:ProgramFiles(x86)}
  if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
    $candidates += Join-Path $programFilesX86 "Git\bin\bash.exe"
    $candidates += Join-Path $programFilesX86 "Git\usr\bin\bash.exe"
  }

  $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
}

$repoRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($repoRoot)) {
  $repoRoot = (Get-Location).Path
}

$deploySh = Join-Path $repoRoot "deploy.sh"
if (-not (Test-Path -LiteralPath $deploySh)) {
  throw "deploy.sh tidak ditemukan. Jalankan deploy.ps1 dari root folder new_mafiking."
}

$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if ($wsl -and (Test-BashRunner -BashExecutable $wsl.Source -BashBaseArgs @("bash"))) {
  $escapedRepoRoot = $repoRoot -replace "\\", "\\"
  Invoke-BashDeploy `
    -BashExecutable $wsl.Source `
    -BashBaseArgs @("bash") `
    -RepoPathCommand "wslpath -a $(Quote-BashValue $escapedRepoRoot)" `
    -RunnerName "WSL"
} elseif ($wsl) {
  Write-Host "WSL ditemukan, tetapi belum siap dipakai. Mencoba Git Bash..."
}

$gitBashCandidates = @(Get-GitBashCandidates)
$gitBash = $gitBashCandidates | Where-Object { Test-BashRunner -BashExecutable $_ } | Select-Object -First 1
if ($gitBash) {
  Invoke-BashDeploy `
    -BashExecutable $gitBash `
    -RepoPathCommand "cygpath -u $(Quote-BashValue $repoRoot)" `
    -RunnerName "Git Bash"
} elseif ($gitBashCandidates.Count -gt 0) {
  Write-Host "Git Bash ditemukan, tetapi tidak bisa menjalankan Bash command."
}

Write-Error @"
Tidak menemukan WSL atau Git Bash untuk menjalankan deploy.sh.

Pilihan yang disarankan:
  1. Install WSL Ubuntu, lalu jalankan: .\deploy.ps1 $ServerIp $Username
  2. Install Git for Windows dengan Git Bash, lalu jalankan perintah yang sama.

deploy.sh membutuhkan lingkungan Bash dengan command: ssh, rsync, npm.
"@
