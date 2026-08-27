import { logoutAction } from "@/lib/auth/actions";

export function Topbar({ name }: { name: string }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-block h-4 w-1.5 rounded bg-accent" />
        <span className="text-sm font-semibold">即時報價儀表板</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">
          嗨，<span className="text-text">{name}</span>
        </span>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-down hover:text-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            登出
          </button>
        </form>
      </div>
    </header>
  );
}
