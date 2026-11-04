// WinRT events use registration tokens, which Register-ObjectEvent cannot handle.
using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

public sealed class BusyBarMediaEvents : IDisposable {
    sealed class Registration {
        public object Source, Token;
        public MethodInfo Remove;
        public Delegate Handler;
    }
    readonly AutoResetEvent signal = new AutoResetEvent(false);
    readonly List<Registration> registrations = new List<Registration>();
    void Pulse() { try { signal.Set(); } catch (ObjectDisposedException) { } }
    public void Watch(object source, Type type, string name) {
        var info = type.GetEvent(name);
        if (info == null) throw new InvalidOperationException("Missing media event: " + name);
        var args = info.EventHandlerType.GetMethod("Invoke").GetParameters();
        var parameters = new ParameterExpression[args.Length];
        for (int i = 0; i < args.Length; i++) parameters[i] = Expression.Parameter(args[i].ParameterType, "p" + i);
        var body = Expression.Call(Expression.Constant(this), typeof(BusyBarMediaEvents).GetMethod("Pulse", BindingFlags.Instance | BindingFlags.NonPublic));
        var handler = Expression.Lambda(info.EventHandlerType, body, parameters).Compile();
        object token = info.GetAddMethod().Invoke(source, new object[] { handler });
        registrations.Add(new Registration { Source = source, Token = token, Remove = info.GetRemoveMethod(), Handler = handler });
    }
    public bool Wait(int milliseconds) { return signal.WaitOne(milliseconds); }
    public void Clear() {
        try {
            foreach (var registration in registrations) {
                try { registration.Remove.Invoke(registration.Source, new object[] { registration.Token }); }
                catch (TargetInvocationException error) {
                    // A closed Spotify session can invalidate its COM object.
                    if (!(error.InnerException is COMException) && !(error.InnerException is InvalidComObjectException)) throw;
                }
            }
        } finally { registrations.Clear(); }
    }
    public void Dispose() { try { Clear(); } finally { signal.Dispose(); } }
}
