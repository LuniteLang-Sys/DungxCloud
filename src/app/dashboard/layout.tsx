'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Cloud, HardDrive, LayoutDashboard, LogOut, Settings, User, History } from 'lucide-react';
import { motion, LayoutGroup } from 'framer-motion';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Files', href: '/dashboard/files', icon: Cloud },
    { name: 'History', href: '/dashboard/history', icon: History },
    { name: 'Accounts', href: '/dashboard/accounts', icon: HardDrive },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-canvas text-black flex overflow-hidden font-sans antialiased">
      {/* Sidebar */}
      <aside className="w-64 bg-canvas border-r-2 border-black flex flex-col z-20">
        <div className="h-16 flex items-center px-6 border-b-2 border-black gap-3 bg-canvas">
          <div className="p-2 bg-brand-peach border-2 border-black rounded-xl shadow-[2px_2px_0px_#000000]">
            <Cloud className="w-4 h-4 text-black" />
          </div>
          <span className="font-heading font-black text-sm tracking-tight text-black" style={{ letterSpacing: '-0.3px' }}>
            Smart Cloud Pool
          </span>
        </div>

        <LayoutGroup id="sidebar-nav">
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="relative flex items-center px-4 py-3 rounded-xl transition-all duration-200 group outline-none"
                >
                  {/* Sliding Background Pill */}
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-pill"
                      className="absolute inset-0 bg-brand-peach border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000]"
                      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                    />
                  )}
                  
                  <item.icon className={`w-5 h-5 mr-3 transition-transform duration-200 z-10 ${
                    isActive 
                      ? 'text-black scale-105 stroke-[2.5px]' 
                      : 'text-[#5a5a5a] group-hover:text-black group-hover:scale-105'
                  }`} />
                  
                  <span className={`text-sm font-heading font-black z-10 transition-colors duration-200 ${
                    isActive 
                      ? 'text-black' 
                      : 'text-[#5a5a5a] group-hover:text-black'
                  }`}>
                    {item.name}
                  </span>

                  {isActive && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute right-4 w-2 h-2 bg-brand-pink rounded-full border border-black"
                      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </LayoutGroup>

        {/* User Card & Logout bottom */}
        <div className="p-4 border-t-2 border-black space-y-3 bg-surface-soft">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-canvas border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,0.15)]">
            <div className="w-8 h-8 rounded-xl bg-brand-lavender border-2 border-black flex items-center justify-center">
              <User className="w-4 h-4 text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-heading font-black text-black truncate">Administrator</p>
              <p className="text-[10px] font-bold text-[#5a5a5a] truncate">Pool NAS Manager</p>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2.5 text-sm font-heading font-black text-[#5a5a5a] hover:text-black hover:bg-brand-pink/10 border-2 border-transparent hover:border-black rounded-xl transition-all duration-200 group outline-none cursor-pointer"
          >
            <LogOut className="w-5 h-5 mr-3 text-[#5a5a5a] group-hover:text-black transition-transform group-hover:-translate-x-0.5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 flex items-center justify-between px-8 border-b-2 border-black bg-canvas z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-heading font-black tracking-widest text-[#5a5a5a] uppercase">
              {navItems.find((item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)))?.name || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-black px-4 py-2 bg-surface-soft border-2 border-black rounded-full shadow-[2px_2px_0px_#000000] font-heading font-black">
              <span className="w-2.5 h-2.5 bg-success rounded-full border border-black animate-pulse" />
              <span>Pool Status: Connected</span>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <div className="flex-1 overflow-auto p-8 relative bg-canvas">
          {/* Main page transition wrapper */}
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
