' Keep the Windows logon task attached to Node without displaying a console.
Option Explicit
If WScript.Arguments.Count <> 2 Then WScript.Quit 2
Dim shell, command, result
Set shell = CreateObject("WScript.Shell")
command = Chr(34) & WScript.Arguments(0) & Chr(34) & " " & Chr(34) & WScript.Arguments(1) & Chr(34)
result = shell.Run(command, 0, True)
WScript.Quit result
