[CmdletBinding()]
param(
    [switch]$Bundle
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$CargoBin = Join-Path $HOME ".cargo\bin"

if (Test-Path $CargoBin) {
    $env:Path = "$CargoBin;$env:Path"
}

function Invoke-DailySeqStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Command
}

function Invoke-DailySeqNative {
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        [string]$FilePath,

        [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
        [string[]]$ArgumentList
    )

    $CommandInfo = Get-Command $FilePath -ErrorAction Stop

    if ($CommandInfo.CommandType -ne "Application") {
        throw "Invoke-DailySeqNative expected a native executable: $FilePath"
    }

    & $CommandInfo.Source @ArgumentList
    $ExitCode = $LASTEXITCODE

    if ($null -ne $ExitCode -and $ExitCode -ne 0) {
        $DisplayCommand = ($FilePath, $ArgumentList) -join " "
        throw "Native command failed with exit code ${ExitCode}: $DisplayCommand"
    }
}

Push-Location $RepoRoot
try {
    if (-not (Test-Path "node_modules")) {
        throw "node_modules is missing. Run 'npm install' before packaging."
    }

    Invoke-DailySeqStep "Toolchain" {
        Invoke-DailySeqNative node --version
        Invoke-DailySeqNative npm.cmd --version
        Invoke-DailySeqNative cargo --version
    }

    Invoke-DailySeqStep "Verification" {
        Invoke-DailySeqNative npm.cmd run check
    }

    if ($Bundle) {
        Invoke-DailySeqStep "Windows bundle" {
            Invoke-DailySeqNative npm.cmd run bundle
        }

        Invoke-DailySeqStep "Installer outputs" {
            Get-ChildItem -Path "src-tauri\target\release\bundle\msi", "src-tauri\target\release\bundle\nsis" -File -ErrorAction SilentlyContinue |
                Select-Object FullName, Length, LastWriteTime |
                Format-Table -AutoSize
        }
    } else {
        Write-Host ""
        Write-Host "Verification complete. Re-run with -Bundle to create Windows installers."
    }
}
finally {
    Pop-Location
}
