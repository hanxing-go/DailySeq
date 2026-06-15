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

function Invoke-DayNoteStep {
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

function Invoke-DayNoteNative {
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        [string]$FilePath,

        [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
        [string[]]$ArgumentList
    )

    $CommandInfo = Get-Command $FilePath -ErrorAction Stop

    if ($CommandInfo.CommandType -ne "Application") {
        throw "Invoke-DayNoteNative expected a native executable: $FilePath"
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

    Invoke-DayNoteStep "Toolchain" {
        Invoke-DayNoteNative node --version
        Invoke-DayNoteNative npm.cmd --version
        Invoke-DayNoteNative cargo --version
    }

    Invoke-DayNoteStep "Verification" {
        Invoke-DayNoteNative npm.cmd run check
    }

    if ($Bundle) {
        Invoke-DayNoteStep "Windows bundle" {
            Invoke-DayNoteNative npm.cmd run bundle
        }

        Invoke-DayNoteStep "Installer outputs" {
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
