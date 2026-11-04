// Windows interop used only by the PC companion, never by the device app.
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

public static class BusyBarThumbnail {
    [DllImport("shcore.dll", PreserveSig = false)]
    private static extern void CreateStreamOverRandomAccessStream(
        [MarshalAs(UnmanagedType.IUnknown)] object random, ref Guid iid,
        [MarshalAs(UnmanagedType.Interface)] out IStream stream);

    public static string Read(object random) {
        IStream stream = null;
        IntPtr read = Marshal.AllocCoTaskMem(4);
        try {
            Guid iid = typeof(IStream).GUID;
            CreateStreamOverRandomAccessStream(random, ref iid, out stream);
            System.Runtime.InteropServices.ComTypes.STATSTG stat;
            stream.Stat(out stat, 1);
            if (stat.cbSize <= 0 || stat.cbSize > 2097152) return "";
            byte[] bytes = new byte[(int)stat.cbSize];
            stream.Read(bytes, bytes.Length, read);
            if (Marshal.ReadInt32(read) != bytes.Length) return "";
            using (var memory = new MemoryStream(bytes))
            using (var image = Image.FromStream(memory))
            using (var bitmap = new Bitmap(16, 16))
            using (var graphics = Graphics.FromImage(bitmap)) {
                graphics.Clear(Color.Black);
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                int side = Math.Min(image.Width, image.Height);
                graphics.DrawImage(image, new Rectangle(0, 0, 16, 16),
                    new Rectangle((image.Width - side) / 2, (image.Height - side) / 2, side, side), GraphicsUnit.Pixel);
                var hex = new StringBuilder(1536);
                for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) {
                    var pixel = bitmap.GetPixel(x, y);
                    hex.Append(pixel.R.ToString("x2")).Append(pixel.G.ToString("x2")).Append(pixel.B.ToString("x2"));
                }
                return hex.ToString();
            }
        } finally {
            Marshal.FreeCoTaskMem(read);
            if (stream != null) Marshal.ReleaseComObject(stream);
        }
    }
}
