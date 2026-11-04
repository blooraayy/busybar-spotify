// Spotify audio-session volume. Runs only on the PC.
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class DeviceEnumerator { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDevice {
    [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr activation, [MarshalAs(UnmanagedType.IUnknown)] out object result);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IDevice device);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionManager {
    [PreserveSig] int GetAudioSessionControl(IntPtr guid, uint flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr guid, uint flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out ISessionEnumerator sessions);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
}
[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionControl {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
    [PreserveSig] int GetGroupingParam(out Guid grouping);
    [PreserveSig] int SetGroupingParam(ref Guid grouping, ref Guid context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr callback);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr callback);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetProcessId(out uint pid);
}
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISessionVolume {
    [PreserveSig] int SetMasterVolume(float value, ref Guid context);
    [PreserveSig] int GetMasterVolume(out float value);
}
public static class BusyBarVolume {
    // Only Spotify sessions are eligible. There is no system-volume fallback.
    public static int Adjust(int steps) {
        if (steps < -10 || steps > 10) throw new ArgumentOutOfRangeException("steps");
        IDeviceEnumerator enumerator = null;
        IDeviceCollection devices = null;
        int result = -1;
        try {
            enumerator = (IDeviceEnumerator)new DeviceEnumerator();
            Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(0, 1, out devices));
            uint count;
            Marshal.ThrowExceptionForHR(devices.GetCount(out count));
            for (uint d = 0; d < count; d++) {
                IDevice device = null;
                object manager = null;
                ISessionEnumerator sessions = null;
                try {
                    Marshal.ThrowExceptionForHR(devices.Item(d, out device));
                    Guid iid = typeof(ISessionManager).GUID;
                    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out manager));
                    Marshal.ThrowExceptionForHR(((ISessionManager)manager).GetSessionEnumerator(out sessions));
                    int size;
                    Marshal.ThrowExceptionForHR(sessions.GetCount(out size));
                    for (int i = 0; i < size; i++) {
                        object session = null;
                        try {
                            Marshal.ThrowExceptionForHR(sessions.GetSession(i, out session));
                            var control = (ISessionControl)session;
                            uint pid; int state;
                            Marshal.ThrowExceptionForHR(control.GetProcessId(out pid));
                            Marshal.ThrowExceptionForHR(control.GetState(out state));
                            if (pid == 0 || state == 2) continue;
                            bool spotify;
                            try {
                                using (var process = System.Diagnostics.Process.GetProcessById((int)pid)) {
                                    spotify = String.Equals(process.ProcessName, "Spotify", StringComparison.OrdinalIgnoreCase);
                                }
                            } catch (ArgumentException) { continue; }
                            if (!spotify) continue;
                            var volume = (ISessionVolume)session;
                            float current;
                            Marshal.ThrowExceptionForHR(volume.GetMasterVolume(out current));
                            float target = Math.Max(0f, Math.Min(1f, current + steps * 0.05f)); // Adjust the multiplier to change how much the volume increases or decreases per wheel detent.
                            if (steps != 0) {
                                Guid context = Guid.Empty;
                                Marshal.ThrowExceptionForHR(volume.SetMasterVolume(target, ref context));
                            }
                            if (result < 0) result = (int)Math.Round(target * 100);
                        } finally { if (session != null) Marshal.ReleaseComObject(session); }
                    }
                } finally {
                    if (sessions != null) Marshal.ReleaseComObject(sessions);
                    if (manager != null) Marshal.ReleaseComObject(manager);
                    if (device != null) Marshal.ReleaseComObject(device);
                }
            }
            if (result < 0) throw new InvalidOperationException("No Spotify audio session available");
            return result;
        } finally {
            if (devices != null) Marshal.ReleaseComObject(devices);
            if (enumerator != null) Marshal.ReleaseComObject(enumerator);
        }
    }
}
