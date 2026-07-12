import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/sentinel/assets/logo.svg"
              alt="Sentinel"
              className="h-8 w-8"
            />
            <h1 className="text-lg font-semibold tracking-tight">
              Sentinel Observability
            </h1>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`
              }
            >
              Overview
            </NavLink>
            <NavLink
              to="/trends"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`
              }
            >
              Trends
            </NavLink>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              GitHub ↗
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
