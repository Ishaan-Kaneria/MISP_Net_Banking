$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    throw "Backend virtual environment not found. Create it with: py -3.12 -m venv backend\.venv"
}

Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-Command",
    ".\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
) -WorkingDirectory $backend

Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-Command",
    "npm run start:local"
) -WorkingDirectory $frontend

Write-Host "Backend:  http://localhost:8000"
Write-Host "Frontend: http://localhost:3000"
Write-Host "Open the frontend URL after both terminal windows report ready."
