"use client";

import { Suspense } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { registerAction, type RegisterState } from "@/lib/auth/actions";

const initialState: RegisterState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
    >
      {pending ? "註冊中…" : "註冊並登入"}
    </button>
  );
}

function RegisterForm() {
  const [state, formAction] = useFormState(registerAction, initialState);
  const callbackUrl = useSearchParams().get("callbackUrl") || "/dashboard";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">帳號</span>
        <input
          name="username"
          autoComplete="username"
          className="rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
          placeholder="3-20 碼英數字或底線"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">密碼</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          className="rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
          placeholder="至少 8 碼"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">確認密碼</span>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          className="rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
          placeholder="再輸入一次密碼"
        />
      </label>

      {state.error && (
        <p className="rounded-md bg-down/15 px-3 py-2 text-sm text-down">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-panel p-7 shadow-2xl">
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-5 w-1.5 rounded bg-accent" />
            <h1 className="text-xl font-semibold">建立新帳號</h1>
          </div>
          <p className="text-sm text-muted">輸入任意帳號密碼即可註冊</p>
        </div>

        <Suspense fallback={<div className="text-sm text-muted">載入中…</div>}>
          <RegisterForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-muted">
          已經有帳號了？{" "}
          <Link href="/login" className="text-accent hover:underline">
            前往登入
          </Link>
        </p>
      </div>
    </main>
  );
}
