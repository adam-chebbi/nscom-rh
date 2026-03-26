import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Clock, History as HistoryIcon, BarChart2, Settings, User, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const role = profile?.role || 'worker';

  const navItems = [
    { label: 'Accueil', icon: Home, path: '/', roles: ['super_admin', 'admin_rh', 'superviseur', 'worker', 'observateur'] },
    { label: 'Pointage', icon: Clock, path: '/pointage', roles: ['super_admin', 'admin_rh', 'superviseur'] },
    { label: 'Historique', icon: HistoryIcon, path: '/historique', roles: ['super_admin', 'admin_rh', 'superviseur', 'worker'] },
    { label: 'Analytics', icon: BarChart2, path: '/analytics', roles: ['super_admin', 'admin_rh', 'observateur'] },
    { label: 'Gestion', icon: Settings, path: '/admin', roles: ['super_admin', 'admin_rh'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] text-slate-900 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[var(--color-bg-sidebar)] border-b border-[var(--color-border)] px-4 flex items-center justify-between z-40 shadow-sm">
        <div className="flex items-center font-black text-xl tracking-tighter text-brand">
          NSC<div className="w-4 h-4 border-2 border-brand mx-0.5 flex items-center justify-center">
            <div className="w-1 h-2 bg-[#8dbd4a]"></div>
          </div>M
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end mr-1">
            <p className="font-bold text-[10px] text-slate-900 leading-none">{profile?.displayName?.split(' ')[0]}</p>
            <p className="text-[8px] text-slate-500 uppercase tracking-wider mt-0.5">{profile?.role.replace('_', ' ')}</p>
          </div>
          <button onClick={handleSignOut} className="p-2 text-slate-400 hover:text-red-500 transition-colors" aria-label="Déconnexion">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Sidebar for Desktop */}
      <aside className={cn(
        "hidden md:flex flex-col fixed top-0 left-0 h-screen bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border)] transition-all duration-300 z-40",
        isSidebarOpen ? "w-64" : "w-16"
      )}>
        <div className="p-4 flex items-center justify-between h-16 border-b border-[var(--color-border)]">
          <div className={cn("flex items-center gap-2 overflow-hidden transition-all", !isSidebarOpen && "w-0 opacity-0")}>
            <div className="flex items-center font-black text-xl tracking-tighter text-brand">
              NSC<div className="w-4 h-4 border-2 border-brand mx-0.5 flex items-center justify-center">
                <div className="w-1 h-2 bg-[#8dbd4a]"></div>
              </div>M
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-brand transition-colors">
            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-md transition-all group relative",
                location.pathname === item.path 
                  ? "bg-slate-100 text-brand shadow-sm" 
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <item.icon size={20} className={cn("flex-shrink-0 transition-colors", location.pathname === item.path ? "text-brand" : "group-hover:text-slate-900")} />
              <span className={cn("text-sm font-medium transition-all duration-300 whitespace-nowrap overflow-hidden", !isSidebarOpen && "w-0 opacity-0")}>
                {item.label}
              </span>
              {location.pathname === item.path && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand rounded-full" />
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-[var(--color-border)] bg-slate-50">
          <div className={cn("flex items-center gap-3 mb-4 transition-all", !isSidebarOpen && "justify-center")}>
            <div className="w-8 h-8 bg-white border border-[var(--color-border)] rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden">
              {profile?.photoURL ? <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" /> : <User size={18} className="text-slate-400" />}
            </div>
            <div className={cn("transition-all overflow-hidden", !isSidebarOpen && "w-0 opacity-0")}>
              <p className="font-medium text-xs truncate text-slate-900">{profile?.displayName}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{profile?.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className={cn(
              "w-full flex items-center gap-3 p-2.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all",
              !isSidebarOpen && "justify-center"
            )}
          >
            <LogOut size={20} />
            <span className={cn("text-sm font-medium transition-all overflow-hidden", !isSidebarOpen && "w-0 opacity-0")}>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 pb-20 md:pb-0 pt-16 md:pt-0 overflow-y-auto bg-[var(--color-bg-main)] transition-all duration-300",
        isSidebarOpen ? "md:ml-64" : "md:ml-16"
      )}>
        <div className="max-w-7xl mx-auto p-4 md:p-10">
          {children}
        </div>
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-bg-sidebar)] border-t border-[var(--color-border)] px-4 py-3 flex justify-around items-center z-50 shadow-2xl">
        {filteredNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              location.pathname === item.path ? "text-brand" : "text-slate-500 hover:text-slate-300"
            )}
          >
            <item.icon size={22} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
