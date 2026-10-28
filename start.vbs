' Launch the tray without a console window.
Option Explicit

Dim fso, shell, root, pythonw, tray
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
pythonw = root & "\.venv\Scripts\pythonw.exe"
tray = root & "\scripts\tray.py"

If Not fso.FileExists(pythonw) Then
    MsgBox "Missing .venv. Run scripts\setup.ps1 first.", vbExclamation, "Next Class"
    WScript.Quit 1
End If
If Not fso.FileExists(tray) Then
    MsgBox "Missing scripts\tray.py.", vbExclamation, "Next Class"
    WScript.Quit 1
End If

shell.CurrentDirectory = root
shell.Run """" & pythonw & """ """ & tray & """ --open", 0, False
