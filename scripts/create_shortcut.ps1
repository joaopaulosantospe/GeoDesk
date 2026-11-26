$wsh = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$sc = $wsh.CreateShortcut("$desktop\GeoDesk.lnk")
$sc.TargetPath = "wscript.exe"
$sc.Arguments = """D:\geodesk\GeoDesk.vbs"""
$sc.WorkingDirectory = "D:\geodesk"
$sc.IconLocation = "D:\geodesk\public\favicon.ico"
$sc.Description = "GeoDesk Desktop GIS"
$sc.Save()
Write-Output "SHORTCUT_CREATED"
