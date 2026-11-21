Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\geodesk"
WshShell.Run "cmd /c set ELECTRON_RUN_AS_NODE=&& npx electron .", 0, False
