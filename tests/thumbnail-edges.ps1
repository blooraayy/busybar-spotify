$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot '../companion/thumbnail.cs') -ReferencedAssemblies System.Drawing
# Solid covers must stay solid at every edge, before palette reduction/rounding.
foreach ($size in @(8, 16, 17, 64)) {
    $image = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($image)
    try {
        $graphics.Clear([Drawing.Color]::FromArgb(255, 68, 136, 204))
        $rgb = [BusyBarThumbnail]::Resize($image)
        if ($rgb.Length -ne 1536) { throw 'Wrong thumbnail size' }
        for ($pixel = 0; $pixel -lt 256; $pixel++) {
            if ($rgb.Substring($pixel * 6, 6) -ne '4488cc') {
                throw "Solid color changed at source size $size, pixel $pixel : $($rgb.Substring($pixel * 6, 6))"
            }
        }
    } finally { $graphics.Dispose(); $image.Dispose() }
}
