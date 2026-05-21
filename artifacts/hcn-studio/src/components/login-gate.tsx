import { useEffect, useState, type ReactNode } from "react";
import { isValidSession, unlock } from "@/lib/auth";

type AuthState = "checking" | "locked" | "unlocked";

/**
 * Renders nothing until the soft-lock token has been verified. While locked,
 * shows a single password input — submitting calls /api/auth/unlock, stores
 * the returned token, and re-renders the real app. Doubles as a re-login
 * surface on 401 (handleUnauthorized in lib/auth clears + reloads).
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isValidSession().then((ok) => {
      if (!cancelled) setState(ok ? "unlocked" : "locked");
    });
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const ok = await unlock(password);
    setSubmitting(false);
    if (ok) {
      setState("unlocked");
    } else {
      setError("비밀번호가 올바르지 않습니다.");
      setPassword("");
    }
  }

  if (state === "checking") {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#4a9cf6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center px-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm bg-[#252525] border border-[#3a3a3a] rounded-xl p-8 space-y-5"
        >
          <div className="flex flex-col items-center gap-3">
            <img
              src="/luna-story-logo.png"
              alt="LUNA STORY"
              className="h-6 w-auto"
              style={{ filter: "brightness(0) invert(1)" }}
            />
            <p className="text-xs text-[#9ca3af]">접근 비밀번호를 입력하세요</p>
          </div>
          <div className="space-y-2">
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full h-10 px-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-md text-sm text-[#e8e8e8] placeholder-[#666] focus:border-[#4a9cf6] focus:outline-none"
            />
            {error && <p className="text-xs text-amber-300">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full h-10 bg-[#4a9cf6] hover:bg-[#3b82f6] text-white text-sm font-semibold rounded-md disabled:opacity-50 transition-colors"
          >
            {submitting ? "확인 중..." : "잠금 해제"}
          </button>
          <p className="text-[10px] text-[#666] text-center">
            정식 사용자 인증 시스템 구축 전 임시 보호 단계입니다.
          </p>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
