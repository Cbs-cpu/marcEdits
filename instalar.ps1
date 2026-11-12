# Marc Edits: instalación en un ordenador nuevo (Windows 10/11)
# Uso: clic derecho → "Ejecutar con PowerShell", o en PowerShell dentro de esta carpeta:
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
# Se puede volver a ejecutar sin problema: solo instala lo que falta.

$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
Set-Location $Root
function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Tiene($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RecargarPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }

Paso '1/7 Programas base (ffmpeg, Node.js, Python, yt-dlp, Git) con winget'
$apps = @(
  @{ cmd = 'ffmpeg'; id = 'Gyan.FFmpeg' },
  @{ cmd = 'node';   id = 'OpenJS.NodeJS.LTS' },
  @{ cmd = 'python'; id = 'Python.Python.3.12' },
  @{ cmd = 'yt-dlp'; id = 'yt-dlp.yt-dlp' },
  @{ cmd = 'git';    id = 'Git.Git' }
)
foreach ($a in $apps) {
  if (Tiene $a.cmd) { Write-Host "  ok  $($a.cmd)" }
  else { Write-Host "  instalando $($a.id)..."; winget install --id $a.id -e --accept-source-agreements --accept-package-agreements }
}
RecargarPath

Paso '2/7 Claude Code (la app usa tu suscripción de Claude, no una API key)'
if (-not (Tiene 'claude')) { npm install -g @anthropic-ai/claude-code; RecargarPath }
claude --version

Paso '3/7 Whisper (transcripción en español)'
python -m pip install --upgrade openai-whisper

Paso '4/7 Skill video-edit: entorno de Python, HyperFrames y efectos de sonido'
python .claude\skills\video-edit\scripts\setup.py

Paso '5/7 Efectos de sonido a Herramientas → Sonidos y a los proyectos de ejemplo'
$sfx = Join-Path $Root '.claude\skills\video-edit\assets\template\assets\sfx'
if (Test-Path $sfx) {
  Copy-Item (Join-Path $sfx '*.mp3') (Join-Path $Root 'library\tools\sonidos') -Force
  Get-ChildItem (Join-Path $Root 'work\reels') -Directory | ForEach-Object {
    $d = Join-Path $_.FullName 'assets\sfx'; if (Test-Path $d) { Copy-Item (Join-Path $sfx '*.mp3') $d -Force }
  }
} else { Write-Host '  (no se encontraron: vuelve a ejecutar este script cuando el paso 4 diga READY)' -ForegroundColor Yellow }

Paso '6/7 Compilar la app de escritorio (se graba la ruta de ESTA carpeta)'
Push-Location app
npm install
npm run dist
Pop-Location

Paso '7/7 Instalar Marc Edits'
$setup = Get-ChildItem (Join-Path $Root 'app\release') -Filter 'Marc Edits Setup *.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($setup) { Start-Process $setup.FullName -ArgumentList '/S' -Wait; Write-Host "  instalado: $($setup.Name)" -ForegroundColor Green }
else { Write-Host '  No se generó el instalador: revisa los mensajes del paso 6.' -ForegroundColor Red }

Write-Host "`nListo. Falta un paso manual: iniciar sesión en Claude con tu cuenta." -ForegroundColor Green
Write-Host '  Ejecuta:  claude auth login --claudeai   (o pulsa «Iniciar sesión en Claude» dentro de la app)'
Write-Host '  Después abre «Marc Edits» desde el acceso directo del escritorio.'
