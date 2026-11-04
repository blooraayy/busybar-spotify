param([string]$Root)
$ErrorActionPreference = 'Stop'
foreach ($file in Get-ChildItem -LiteralPath $Root -Filter '*.ps1') {
    $tokens = $null; $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }
}
