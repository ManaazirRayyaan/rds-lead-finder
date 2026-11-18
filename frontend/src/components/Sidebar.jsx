import { Bookmark, LayoutDashboard, LogOut, Moon, Search, Settings, Sun } from 'lucide-react';
import logo from '../logo.png';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'search', label: 'Find leads', icon: Search },
  { id: 'saved', label: 'Saved leads', icon: Bookmark },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ route, setTheme, isDark, onLogout }) {
  const toggle = () => setTheme(isDark ? 'light' : 'dark');
  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col bg-rail px-4 py-6 text-[#f5f2ee] md:flex">
        <div className="flex items-center gap-3 px-2">
          <img src={logo} alt="" className="h-9 w-9 object-contain" />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">RDS Lead Finder</div>
            <div className="text-xs text-[#9a948c]">Rayyaan Digital Studio</div>
          </div>
        </div>
        <nav className="mt-10 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = route === id;
            return (
              <a key={id} href={`#${id}`} aria-current={active ? 'page' : undefined}
                className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${active ? 'bg-white/10 text-white' : 'text-[#b8b1a8] hover:bg-white/5 hover:text-white'}`}>
                {active && <span className="absolute -left-4 h-5 w-1 rounded-r bg-[#f07c46]" />}
                <Icon size={18} strokeWidth={1.8} />
                {label}
              </a>
            );
          })}
        </nav>
        <button onClick={toggle} className="mt-auto flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#b8b1a8] transition-colors hover:bg-white/5 hover:text-white">
          {isDark ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={onLogout} className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#b8b1a8] transition-colors hover:bg-white/5 hover:text-white">
          <LogOut size={18} strokeWidth={1.8} /> Sign out
        </button>
      </aside>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-rail pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#${id}`} aria-current={route === id ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${route === id ? 'text-[#f07c46]' : 'text-[#9a948c]'}`}>
            <Icon size={20} strokeWidth={1.8} />
            {label}
          </a>
        ))}
      </nav>
    </>
  );
}
