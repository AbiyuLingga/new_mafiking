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

  $assignments = @(
    Get-OptionalEnvAssignment "APP_NAME"
    Get-OptionalEnvAssignment "APP_PORT"
    Get-OptionalEnvAssignment "REMOTE_DIR"
    Get-OptionalEnvAssignment "DEPLOY_DB"
  ) | Where-Object { $_ }

  $envPrefix = ""
  if ($assignments.Count -gt 0) {
    $envPrefix = ($assignments -join " ") + " "
  }

  $script = @(
    "cd $(Quote-BashValue $repoPath)"
    "command -v ssh >/dev/null || { echo ""Command 'ssh' belum tersedia di $RunnerName.""; exit 127; }"
    "command -v rsync >/dev/null || { echo ""Command 'rsync' belum tersedia di $RunnerName.""; exit 127; }"
    "command -v npm >/dev/null || { echo ""Command 'npm' belum tersedia di $RunnerName.""; exit 127; }"
    "${envPrefix}./deploy.sh $(Quote-BashValue $ServerIp) $(Quote-BashValue $Username)"
  ) -join " && "

  Write-Host "Menjalankan deploy lewat $RunnerName..."
  & $BashExecutable @BashBaseArgs -lc $script
  exit $LASTEXITCODE
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
if ($wsl) {
  $escapedRepoRoot = $repoRoot -replace "\\", "\\"
  Invoke-BashDeploy `
    -BashExecutable $wsl.Source `
    -BashBaseArgs @("bash") `
    -RepoPathCommand "wslpath -a $(Quote-BashValue $escapedRepoRoot)" `
    -RunnerName "WSL"
}

$bash = Get-Command bash.exe -ErrorAction SilentlyContinue
if ($bash) {
  Invoke-BashDeploy `
    -BashExecutable $bash.Source `
    -RepoPathCommand "cygpath -u $(Quote-BashValue $repoRoot)" `
    -RunnerName "Git Bash"
}

Write-Error @"
Tidak menemukan WSL atau Git Bash untuk menjalankan deploy.sh.

Pilihan yang disarankan:
  1. Install WSL Ubuntu, lalu jalankan: .\deploy.ps1 $ServerIp $Username
  2. Install Git for Windows dengan Git Bash, lalu jalankan perintah yang sama.

deploy.sh membutuhkan lingkungan Bash dengan command: ssh, rsync, npm.
"@
