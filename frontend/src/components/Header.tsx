import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[800px] items-center justify-between px-4">
        <div className="flex items-center gap-0 text-2xl font-bold tracking-tight">
          <span>Tube</span>
          <span className="rounded bg-yt-red px-1.5 py-0.5 text-white">Text</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
