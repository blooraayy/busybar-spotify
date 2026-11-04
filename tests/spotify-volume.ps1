# Optional Windows integration check; requires a Spotify audio session.
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot '../companion/volume.cs')
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace VolumeProbe {
 [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator { }
 [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Devices {
  [PreserveSig] int Enum(int f,int m,out IntPtr d);
  [PreserveSig] int Default(int f,int r,out Device d);
 }
 [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Device {
  [PreserveSig] int Activate(ref Guid g,uint c,IntPtr a,[MarshalAs(UnmanagedType.IUnknown)]out object o);
 }
 [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Endpoint {
  [PreserveSig] int Register(IntPtr p);
  [PreserveSig] int Unregister(IntPtr p);
  [PreserveSig] int Channels(out uint c);
  [PreserveSig] int SetDb(float v,ref Guid g);
  [PreserveSig] int SetScalar(float v,ref Guid g);
  [PreserveSig] int GetDb(out float v);
  [PreserveSig] int GetScalar(out float v);
 }
 public static class Master {
  public static float Read() {
   Devices e=null; Device d=null; object o=null;
   try {
    e=(Devices)new Enumerator(); Marshal.ThrowExceptionForHR(e.Default(0,1,out d));
    Guid g=typeof(Endpoint).GUID; Marshal.ThrowExceptionForHR(d.Activate(ref g,23,IntPtr.Zero,out o));
    float v; Marshal.ThrowExceptionForHR(((Endpoint)o).GetScalar(out v)); return v;
   } finally {
    if(o!=null)Marshal.ReleaseComObject(o); if(d!=null)Marshal.ReleaseComObject(d); if(e!=null)Marshal.ReleaseComObject(e);
   }
  }
 }
}
"@
$masterBefore = [VolumeProbe.Master]::Read()
$before = [BusyBarVolume]::Adjust(0)
$step = if ($before -ge 98) { -1 } else { 1 }
$changed = $false
try {
    $during = [BusyBarVolume]::Adjust($step)
    $changed = $true
    if ($during -eq $before) { throw 'Spotify volume did not change' }
    if ([Math]::Abs([VolumeProbe.Master]::Read() - $masterBefore) -gt 0.0001) { throw 'System master volume changed' }
} finally {
    if ($changed) { $restored = [BusyBarVolume]::Adjust(-$step) }
}
if ($restored -ne $before) { throw 'Spotify volume was not restored' }
@{ spotify_before=$before; spotify_during=$during; spotify_restored=$restored; system_unchanged=([Math]::Abs([VolumeProbe.Master]::Read() - $masterBefore) -lt 0.0001) } | ConvertTo-Json -Compress
