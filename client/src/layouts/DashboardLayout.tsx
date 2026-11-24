import {
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CheckCheck,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCircle,
  Users,
  X,
  Bookmark,
} from 'lucide-react';
import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BrandLogo, ThemeToggle } from '../components/common/UIPrimitives';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { formatRelativeDate } from '../utils/formatters';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const candidateNav: NavItem[] = [
  { to: '/candidate', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/candidate/profile', label: 'My Profile', icon: UserCircle },
  { to: '/jobs', label: 'Browse Jobs', icon: Search },
  { to: '/candidate/saved', label: 'Saved Jobs', icon: Bookmark },
  { to: '/candidate/applications', label: 'My Applications', icon: FileText },
  { to: '/candidate/interviews', label: 'Interview Schedule', icon: Calendar },
  { to: '/candidate/notifications', label: 'Notifications', icon: Bell },
  { to: '/candidate/email-preferences', label: 'Email Preferences', icon: Mail },
  { to: '/candidate/settings', label: 'Account Settings', icon: Settings },
];

const recruiterNav: NavItem[] = [
  { to: '/recruiter', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/recruiter/company', label: 'Companies & Profile', icon: Building2 },
  { to: '/recruiter/jobs/new', label: 'Create Job', icon: PlusCircle },
  { to: '/recruiter/jobs', label: 'Manage Jobs', icon: Briefcase, end: true },
  { to: '/recruiter/applications', label: 'Applications', icon: FileText },
  { to: '/recruiter/interviews', label: 'Interview Management', icon: Calendar },
  { to: '/recruiter/notifications', label: 'Notifications', icon: Bell },
  { to: '/recruiter/settings', label: 'Settings', icon: Settings },
];

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users & Recruiters', icon: Users },
  { to: '/admin/companies-jobs', label: 'Companies, Jobs & Categories', icon: FolderKanban },
  { to: '/admin/campaigns', label: 'Email Campaigns & Logs', icon: Mail },
  { to: '/admin/governance', label: 'Audit, Messages & Settings', icon: ShieldCheck },
];

export function DashboardLayout({ role }: { role: 'candidate' | 'recruiter' | 'admin' }) {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const navItems = role === 'admin' ? adminNav : role === 'recruiter' ? recruiterNav : candidateNav;
  const roleLabel = role === 'admin' ? 'Super Admin' : role === 'recruiter' ? 'Recruiter Console' : 'Candidate Workspace';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-white dark:bg-[#0F172A] border-r border-slate-200 dark:border-slate-800">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <BrandLogo to="/" />
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{roleLabel}</p>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">{user?.name}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#102A43] dark:bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <ThemeToggle />
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F1F5F9]">
      <aside className="hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">{sidebarContent}</aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 h-full">{sidebarContent}</div>
          <div className="flex-1 bg-slate-950/60" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <Link to="/" className="hover:text-slate-900 dark:hover:text-white">Job Karenge</Link>
              <span className="mx-2">/</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{roleLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 relative">
            <Link
              to="/jobs"
              className="hidden sm:inline-flex px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Public Job Board
            </Link>

            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Open notifications"
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-sm font-semibold">Notifications</span>
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">No notifications yet.</p>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <div
                        key={n._id}
                        className={`p-3.5 text-sm flex items-start justify-between gap-2 ${
                          n.read ? 'opacity-75' : 'bg-blue-50/40 dark:bg-blue-950/20'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!n.read) markRead(n._id);
                            setNotifOpen(false);
                            if (n.link) navigate(n.link);
                          }}
                          className="text-left flex-1 min-w-0"
                        >
                          <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{n.title}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[11px] text-slate-400 mt-1">{formatRelativeDate(n.createdAt)}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteNotification(n._id)}
                          aria-label="Delete notification"
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
