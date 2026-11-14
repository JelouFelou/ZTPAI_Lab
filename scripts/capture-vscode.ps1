param([string]$Command, [string]$Name, [int]$WaitSeconds = 5)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Desktop05 {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
 public struct Rect { public int Left, Top, Right, Bottom; }
}
'@
$editor = Get-Process Code | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
if (!$editor) { throw 'VS Code window not found' }
[Desktop05]::ShowWindow($editor.MainWindowHandle, 3) | Out-Null
[Desktop05]::SetForegroundWindow($editor.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 600
$keys = New-Object -ComObject WScript.Shell
$keys.SendKeys('^+p')
Start-Sleep -Milliseconds 400
$keys.SendKeys('Terminal: Create New Terminal')
$keys.SendKeys('{ENTER}')
Start-Sleep -Seconds 2
foreach ($char in $Command.ToCharArray()) {
    if ('+^%~(){}[]'.Contains([string]$char)) { $keys.SendKeys('{' + $char + '}') }
    else { $keys.SendKeys([string]$char) }
}
$keys.SendKeys('{ENTER}')
Start-Sleep -Seconds $WaitSeconds
[Desktop05]::SetForegroundWindow($editor.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 500
if ([Desktop05]::GetForegroundWindow() -ne $editor.MainWindowHandle) { throw 'VS Code is not foreground; screenshot refused' }
$rect = New-Object Desktop05+Rect
[Desktop05]::GetWindowRect($editor.MainWindowHandle, [ref]$rect) | Out-Null
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$size = New-Object System.Drawing.Size(1360, 1028)
$bitmap = New-Object System.Drawing.Bitmap($size.Width, $size.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $size)
$target = Join-Path (Get-Location) ('screenshots\zad5\' + $Name + '.png')
New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
$bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
Write-Output $target
