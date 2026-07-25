$ErrorActionPreference = 'Stop'

$source = 'D:\Proyek Alip\Skripsi'
$destination = 'C:\xampp\htdocs\Skripsi'

if (-not (Test-Path -LiteralPath $source)) {
    throw "Folder sumber tidak ditemukan: $source"
}

if (-not (Test-Path -LiteralPath $destination)) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
}

$robocopyArgs = @(
    $source,
    $destination,
    '*',
    '/E',
    '/R:1',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
    '/XD',
    '.git',
    '__pycache__',
    '.vscode'
)

Write-Host 'Sinkronisasi dari D ke C sedang berjalan...'
& robocopy @robocopyArgs
$exitCode = $LASTEXITCODE

if ($exitCode -ge 8) {
    throw "Robocopy gagal dengan exit code $exitCode"
}

Write-Host 'Sinkronisasi selesai.'
Write-Host "Sumber      : $source"
Write-Host "Tujuan      : $destination"
Write-Host "Robocopy code: $exitCode"
