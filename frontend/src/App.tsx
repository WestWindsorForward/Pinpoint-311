import { NavLink, Outlet } from "react-router-dom";

export default function App() {
  const navItems = [
    { to: "/", label: "Resident Portal" },
    { to: "/admin", label: "Township Settings" },
    { to: "/staff", label: "Staff Command Center" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white pb-16">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Township 311</p>
            <h1 className="text-xl font-semibold text-slate-900">Request Management</h1>
          </div>
          <nav className="flex gap-4 text-sm font-medium text-slate-600">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 transition ${
                    isActive ? "bg-slate-900 text-white" : "hover:bg-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto mt-10 max-w-6xl px-6">
        <Outlet />
      </main>
    </div>
  );
}
