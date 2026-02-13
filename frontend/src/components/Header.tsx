"use client";

import ThemeToggle from "./ThemeToggle";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Header() {
  const { user, loading, logout } = useAuth();

  return (
    <header className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[800px] items-center justify-between px-4">
        <div className="flex items-center gap-0 text-2xl font-bold tracking-tight">
          <span>Tube</span>
          <span className="rounded bg-yt-red px-1.5 py-0.5 text-white">Text</span>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{user.name.split(" ")[0]}</span>
                <button
                  onClick={logout}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <a
                href={`${API_URL}/auth/google/login`}
                className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Sign in
              </a>
            )
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
