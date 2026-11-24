import { Bell, CheckCheck, Menu, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { BrandLogo, ThemeToggle } from '../components/common/UIPrimitives';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { api } from '../services/api';
import { formatRelativeDate } from '../utils/formatters';

interface PublicSocialLinks {
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  github?: string;
}

function safeExternalUrl(url?: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

export function PublicLayout() {
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [supportEmail, setSupportEmail] = useState('support@jobkarenge.com');
  const [socialLinks, setSocialLinks] = useState<PublicSocialLinks>({});

  useEffect(() => {
    let active = true;
    const loadSettings = () => {
      api
        .get('/public/settings')
        .then((res) => {
          const email = res.data?.data?.supportEmail;
          const links = res.data?.data?.socialLinks;
          if (!active) return;
          if (email) setSupportEmail(email);
          if (links && typeof links === 'object') setSocialLinks(links);
        })
        .catch(() => {});
    };
    loadSettings();
    window.addEventListener('jk:settings-updated', loadSettings);
    return () => {
      active = false;
      window.removeEventListener('jk:settings-updated', loadSettings);
    };
  }, []);

  const activeSocialItems = [
    {
      key: 'linkedin',
      label: 'LinkedIn',
      href: safeExternalUrl(socialLinks.linkedin),
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
        </svg>
      ),
    },
    {
      key: 'twitter',
      label: 'X (Twitter)',
      href: safeExternalUrl(socialLinks.twitter),
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      key: 'instagram',
      label: 'Instagram',
      href: safeExternalUrl(socialLinks.instagram),
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
        </svg>
      ),
    },
    {
      key: 'facebook',
      label: 'Facebook',
      href: safeExternalUrl(socialLinks.facebook),
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
        </svg>
      ),
    },
    {
      key: 'youtube',
      label: 'YouTube',
      href: safeExternalUrl(socialLinks.youtube),
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
        </svg>
      ),
    },
    {
      key: 'github',
      label: 'GitHub',
      href: safeExternalUrl(socialLinks.github),
      icon: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
        </svg>
      ),
    },
  ].filter((item) => Boolean(item.href));

  const dashboardPath =
    user?.role === 'admin' ? '/admin' : user?.role === 'recruiter' ? '/recruiter' : '/candidate';

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F1F5F9]">
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <BrandLogo to="/" />

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Link to="/jobs" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Browse Jobs
            </Link>
            <Link to="/companies" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Companies
            </Link>
            <Link to="/about" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              About Us
            </Link>
            <Link to="/contact" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Contact
            </Link>
            <Link to="/faqs" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              FAQs
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-2.5 shrink-0 relative">
            {user ? (
              <>
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
                <Link
                  to={dashboardPath}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
                >
                  Dashboard
                </Link>
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
                        notifications.slice(0, 8).map((n) => (
                          <button
                            key={n._id}
                            type="button"
                            onClick={() => {
                              if (!n.read) markRead(n._id);
                              setNotifOpen(false);
                              navigate(n.link || `${dashboardPath}/notifications`);
                            }}
                            className={`w-full p-3.5 text-left text-sm block hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                              n.read ? 'opacity-75' : 'bg-blue-50/40 dark:bg-blue-950/20'
                            }`}
                          >
                            <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{n.title}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[11px] text-slate-400 mt-1">{formatRelativeDate(n.createdAt)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] px-4 py-4 space-y-2">
            <Link to="/jobs" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">
              Browse Jobs
            </Link>
            <Link to="/companies" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">
              Companies
            </Link>
            <Link to="/about" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">
              About Us
            </Link>
            <Link to="/contact" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">
              Contact
            </Link>
            <Link to="/faqs" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">
              FAQs
            </Link>
            <div className="pt-2 flex items-center justify-between gap-3">
              <Link
                to={user ? dashboardPath : '/login'}
                onClick={() => setMobileOpen(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white"
              >
                {user ? 'Dashboard' : 'Sign In'}
              </Link>
              <ThemeToggle />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-3">
              <BrandLogo to="/" />
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Connecting ambitious candidates with verified employers through transparent application tracking and structured interviews.
              </p>
              <div className="pt-1 flex items-center gap-3 flex-wrap">
                <ThemeToggle />
              </div>
              {activeSocialItems.length > 0 && (
                <div className="pt-2 flex items-center gap-2 flex-wrap" aria-label="Social media links">
                  {activeSocialItems.map((item) => (
                    <a
                      key={item.key}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.label}
                      title={item.label}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#102A43] dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      {item.icon}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">For Candidates</h4>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li><Link to="/jobs" className="hover:text-slate-900 dark:hover:text-white">Browse Jobs</Link></li>
                <li><Link to="/companies" className="hover:text-slate-900 dark:hover:text-white">Verified Companies</Link></li>
                <li><Link to="/register" className="hover:text-slate-900 dark:hover:text-white">Create Candidate Profile</Link></li>
                <li><Link to="/faqs" className="hover:text-slate-900 dark:hover:text-white">Candidate FAQs</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">For Employers</h4>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li><Link to="/register?role=recruiter" className="hover:text-slate-900 dark:hover:text-white">Recruiter Registration</Link></li>
                <li><Link to="/recruiter" className="hover:text-slate-900 dark:hover:text-white">Recruiter Console</Link></li>
                <li><Link to="/about" className="hover:text-slate-900 dark:hover:text-white">About Job Karenge</Link></li>
                <li><Link to="/contact" className="hover:text-slate-900 dark:hover:text-white">Contact Support</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Legal & Governance</h4>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li><Link to="/privacy" className="hover:text-slate-900 dark:hover:text-white">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-slate-900 dark:hover:text-white">Terms &amp; Conditions</Link></li>
                <li><Link to="/admin/setup" className="hover:text-slate-900 dark:hover:text-white">Admin Portal</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <p>&copy; {new Date().getFullYear()} Job Karenge. All rights reserved.</p>
            <a
              href={`mailto:${supportEmail}`}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              {supportEmail}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
