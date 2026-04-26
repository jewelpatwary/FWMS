import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  FileText, 
  LogOut, 
  Menu, 
  X,
  User as UserIcon,
  ShieldCheck,
  ClipboardList,
  History,
  Settings,
  CreditCard
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { UserProfile } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  profile: UserProfile | null;
}

export default function Layout({ profile }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile?.appearance) {
      document.documentElement.style.setProperty('--app-font-size', profile.appearance.fontSize);
      document.documentElement.style.setProperty('--app-font-family', profile.appearance.fontFamily);
    }
  }, [profile]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Workers', href: '/workers', icon: Users },
    { name: 'Permit Holders', href: '/permit-holders', icon: ShieldCheck },
    { name: 'Permit renewal list', href: '/permit-renewal', icon: FileText },
    { name: 'eSP', href: '/esp', icon: ShieldCheck },
    { name: 'COM', href: '/com', icon: ClipboardList },
    { name: 'Clients', href: '/clients', icon: Building2 },
    { name: 'Placement History', href: '/placement-history', icon: History },
    { name: 'Letters', href: '/letters', icon: FileText },
    { name: 'Reports', href: '/reports', icon: FileText },
    ...(profile?.role === 'super_admin' || profile?.permissions?.canApprovePayments ? [
      { name: 'Payment Approvals', href: '/payment-approvals', icon: CreditCard }
    ] : []),
    ...(profile?.role === 'super_admin' ? [
      { name: 'User Management', href: '/user-management', icon: ShieldCheck },
      { name: 'Settings', href: '/settings', icon: Settings }
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 print:hidden">
        <div className="p-6">
          <h1 className="text-xl font-bold text-indigo-600">FWMS Malaysia</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                  isActive 
                    ? "bg-indigo-50 text-indigo-600" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 mr-3">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{profile?.displayName || 'User'}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50 px-4 py-3 flex items-center justify-between print:hidden">
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all active:scale-95 shadow-sm group"
        >
          {isMobileMenuOpen ? (
            <X className="w-5 h-5 text-slate-600 group-hover:text-indigo-600 transition-colors" />
          ) : (
            <Menu className="w-5 h-5 text-slate-600 group-hover:text-indigo-600 transition-colors" />
          )}
        </button>
        <h1 className="text-lg font-bold text-indigo-600">FWMS Malaysia</h1>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-slate-900/50 z-40" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <aside className={cn(
        "md:hidden fixed top-0 left-0 bottom-0 w-64 bg-white z-50 transform transition-transform duration-300 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6">
          <h1 className="text-xl font-bold text-indigo-600">FWMS Malaysia</h1>
        </div>
        <nav className="px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                  isActive 
                    ? "bg-indigo-50 text-indigo-600" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-20 md:pt-8 print:p-0 print:overflow-visible">
          <Outlet context={{ profile }} />
        </div>
      </main>
    </div>
  );
}
