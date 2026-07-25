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
    <div className="min-h-screen bg-chorus-bg text-slate-100">
      {/* Sticky dark header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-chorus-bg/90 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          {/* Logo with vinyl icon inspired by reference image */}
          <Link
            to="/"
            className="flex items-center gap-2.5 font-bold text-white text-xl tracking-tight group"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white border border-white/20 text-sm shadow-inner group-hover:rotate-45 transition-transform duration-300">
              💿
            </span>
            <span>Chorus</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-7 sm:flex">
            <NavLink to="/play">Play</NavLink>
            <NavLink to="/artist">Artist Mode</NavLink>
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
                  ['/play', 'Play'],
                  ['/artist', 'Artist Mode'],
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

      <Outlet />

      {/* Deezer attribution — required by Deezer API brand guidelines */}
      <footer className="border-t border-white/[0.06] py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 sm:px-6">
          <a
            href="https://www.deezer.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-300"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M.693 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807C.312 4.41 0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5-.312-2.158-.788-3.536-1.325-3.536-.745 0-1.386 2.704-1.62 6.472-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665-.217-1.291-.546-2.105-.91-2.105-.675 0-1.221 2.807-1.221 6.272 0 3.466.546 6.273 1.221 6.273.277 0 .537-.476.736-1.273.32 2.928.996 4.938 1.776 4.938.606 0 1.143-1.204 1.507-3.11.251 3.622.875 6.195 1.602 6.195.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24c1.005 0 1.863-2.4 2.235-5.822.312 1.654.727 2.677 1.186 2.677.728 0 1.352-2.573 1.603-6.195.364 1.906.9 3.11 1.507 3.11.78 0 1.455-2.01 1.775-4.938.208.797.46 1.273.737 1.273.675 0 1.22-2.807 1.22-6.273-.008-3.457-.553-6.272-1.23-6.272ZM23.307 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807-.381 0-.693 1.256-.693 2.807s.312 2.808.693 2.808Z" />
            </svg>
            <span className="text-xs font-medium">Powered by Deezer</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
