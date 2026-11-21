# Conclui automaticamente as páginas do instalador NSIS do GeoDesk.
#
# O instalador assistido (oneClick: false) mostrado pelo electron-updater
# pula a página de licença/diretório quando recebe --updated, mas mantém
# a página de instalação (barra de progresso) e a página "Concluir".
# Este script detecta a janela do instalador e, quando a instalação termina
# (janela sem barra de progresso), envia Enter para clicar em "Concluir".
#
#   powershell -File scripts/auto-instalador.ps1 [-TimeoutSec 900]
#
# Sai com 0 quando o instalador termina, 1 em caso de timeout.
param(
  [int]$TimeoutSec = 900,
  [string]$ProcessName = 'GeoDesk_Instalador_*'
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string t);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
'@

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$seen = $false
$sawProgress = $false
$sent = $false

while ((Get-Date) -lt $deadline) {
  $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $proc) {
    if ($seen) { Write-Host '[auto] instalador finalizado'; exit 0 }
    Start-Sleep -Milliseconds 400
    continue
  }
  $seen = $true
  if ($proc.MainWindowHandle -eq 0) { Start-Sleep -Milliseconds 400; continue }

  $pb = [W]::FindWindowEx($proc.MainWindowHandle, [IntPtr]::Zero, 'msctls_progress32', $null)
  if ($pb -ne [IntPtr]::Zero) { $sawProgress = $true; Start-Sleep -Milliseconds 400; continue }

  # Sem barra de progresso: só age se já vimos a instalação rodando antes.
  if (-not $sawProgress) { Start-Sleep -Milliseconds 400; continue }

  # Confirma 2x com intervalo (evita clicar na transição entre páginas).
  Start-Sleep -Seconds 2
  $proc.Refresh()
  if ($proc.HasExited) { Write-Host '[auto] instalador finalizado'; exit 0 }
  $pb2 = [W]::FindWindowEx($proc.MainWindowHandle, [IntPtr]::Zero, 'msctls_progress32', $null)
  if ($pb2 -ne [IntPtr]::Zero) { continue }

  if (-not $sent) {
    [W]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 400
    $sh = New-Object -ComObject WScript.Shell
    $sh.SendKeys('{ENTER}')
    Write-Host '[auto] Enter enviado (pagina Concluir)'
    $sent = $true
    Start-Sleep -Seconds 5
    $proc.Refresh()
    if ($proc.HasExited) { Write-Host '[auto] instalador finalizado'; exit 0 }
    # Se ainda vivo, tenta WM_COMMAND/IDOK (botão Next/Finish do NSIS).
    [W]::PostMessage($proc.MainWindowHandle, 0x0111, [IntPtr]1, [IntPtr]0) | Out-Null
    Write-Host '[auto] WM_COMMAND/IDOK enviado'
    Start-Sleep -Seconds 5
    $proc.Refresh()
    if ($proc.HasExited) { Write-Host '[auto] instalador finalizado'; exit 0 }
    continue
  }
  # Já enviou; aguarda o processo sair.
  Start-Sleep -Milliseconds 500
}

if ($seen) { Write-Host '[auto] TIMEOUT: instalador ainda aberto'; exit 1 }
Write-Host '[auto] nenhum instalador detectado'; exit 1
