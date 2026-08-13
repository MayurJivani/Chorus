import { useState, type ReactNode } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const isActive = pathname === to || (to !== '/' && pathname.startsWith(to));
  return (
    <Link
      to={to}
      className={
        'relative text-sm font-medium transition-colors duration-200 ' +
        (isActive ? 'text-white' : 'text-slate-400 hover:text-white')
      }
    >
      {children}
      {isActive && (
        <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-white rounded-full" />
      )}
    </Link>
  );
}

export function RootLayout() {
  const { user, loading, logout } = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setMenuOpen(false);
  };

  return (
    <div className="h-screen flex flex-col bg-chorus-bg text-slate-100 overflow-hidden">
      {/* Sticky dark header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-chorus-bg/90 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          {/* Logo with vinyl disc */}
          <Link
            to="/"
            className="flex items-center gap-2.5 font-bold text-white text-xl tracking-tight group"
          >
            <span
              className="relative flex h-8 w-8 items-center justify-center rounded-full group-hover:animate-spin-slow transition-all duration-300"
              style={{
                boxShadow: '0 0 12px rgba(139, 92, 246, 0.4), 0 0 24px rgba(139, 92, 246, 0.15)',
              }}
            >
              {/* Vinyl disc SVG */}
              <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
                {/* Outer disc */}
                <circle cx="16" cy="16" r="15.5" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
                {/* Grooves */}
                <circle cx="16" cy="16" r="13" fill="none" stroke="#222" strokeWidth="0.3" />
                <circle cx="16" cy="16" r="11.5" fill="none" stroke="#252525" strokeWidth="0.3" />
                <circle cx="16" cy="16" r="10" fill="none" stroke="#222" strokeWidth="0.3" />
                <circle cx="16" cy="16" r="8.5" fill="none" stroke="#252525" strokeWidth="0.3" />
                {/* Sheen highlight */}
                <path
                  d="M6 8 Q16 4 26 8 Q28 16 26 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="3"
                />
                {/* Purple gradient center label */}
                <defs>
                  <radialGradient id="logo-center-grad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </radialGradient>
                </defs>
                <circle cx="16" cy="16" r="5.5" fill="url(#logo-center-grad)" />
                <circle cx="16" cy="16" r="5.5" fill="none" stroke="#1a1a1a" strokeWidth="0.5" />
                {/* Spindle hole */}
                <circle cx="16" cy="16" r="1.2" fill="#0a0a0a" stroke="#333" strokeWidth="0.3" />
              </svg>
            </span>
            <span>Chorus</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-7 sm:flex">
            <NavLink to="/play">Daily Challenge</NavLink>
            <NavLink to="/artist">Artist Mode</NavLink>
            <NavLink to="/multiplayer">Multiplayer</NavLink>
            <NavLink to="/leaderboard">Leaderboard</NavLink>
            <NavLink to="/stats">Stats</NavLink>
            <NavLink to="/about">About</NavLink>

            {!loading && (
              <div className="flex items-center gap-3 pl-3 border-l border-white/10">
                {user ? (
                  <>
                    <span className="text-sm text-slate-300 font-medium">{user.displayName}</span>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="text-sm font-medium text-slate-400 hover:text-white transition-colors duration-200"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="text-sm font-medium text-slate-300 hover:text-white transition-colors duration-200"
                    >
                      Log in
                    </Link>
                    <Link to="/register" className="btn-primary !py-1.5 !px-4 !text-sm">
                      Sign up
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="flex sm:hidden flex-col gap-1.5 p-2 text-slate-400 hover:text-white"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <span
              className={`block h-px w-5 bg-current transition-all duration-200 ${menuOpen ? 'translate-y-[7px] rotate-45' : ''}`}
            />
            <span
              className={`block h-px w-5 bg-current transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`block h-px w-5 bg-current transition-all duration-200 ${menuOpen ? '-translate-y-[7px] -rotate-45' : ''}`}
            />
          </button>
        </nav>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="glass-2 border-t border-white/[0.06] px-4 pb-4 pt-2 sm:hidden">
            <div className="flex flex-col gap-3">
              {(
                [
                  ['/', 'Home'],
                  ['/play', 'Daily Challenge'],
                  ['/artist', 'Artist Mode'],
                  ['/multiplayer', 'Multiplayer'],
                  ['/leaderboard', 'Leaderboard'],
                  ['/stats', 'Stats'],
                  ['/about', 'About'],
                ] as [string, string][]
              ).map(([path, label]) => (
                <Link
                  key={path}
                  to={path}
                  className="text-sm font-medium text-slate-300 hover:text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <div className="h-px bg-white/10" />
              {!loading &&
                (user ? (
                  <>
                    <span className="text-sm text-slate-400">{user.displayName}</span>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="text-left text-sm font-medium text-slate-400 hover:text-white"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="text-sm font-medium text-slate-300 hover:text-white"
                      onClick={() => setMenuOpen(false)}
                    >
                      Log in
                    </Link>
                    <Link
                      to="/register"
                      className="btn-primary !py-2 text-sm"
                      onClick={() => setMenuOpen(false)}
                    >
                      Sign up
                    </Link>
                  </>
                ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Deezer attribution — required by Deezer API brand guidelines */}
      <footer className="shrink-0 border-t border-white/[0.06] py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 sm:px-6">
          <a
            href="https://www.deezer.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-80"
          >
            <img
              src="/Horizontal - Signatures-PoweredBy-EN.png"
              alt="Powered by Deezer"
              className="h-5 w-auto"
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
