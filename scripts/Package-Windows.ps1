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

Push-Location $RepoRoot
try {
    if (-not (Test-Path "node_modules")) {
        throw "node_modules is missing. Run 'npm install' before packaging."
    }

    Invoke-DayNoteStep "Toolchain" {
        node --version
        npm --version
        cargo --version
    }

    Invoke-DayNoteStep "Verification" {
        npm run check
    }

    if ($Bundle) {
        Invoke-DayNoteStep "Windows bundle" {
            npm run bundle
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
