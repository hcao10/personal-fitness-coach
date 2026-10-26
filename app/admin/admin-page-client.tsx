"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useState } from "react";
import { beginCmineLogin } from "../lib/auth";
import { useLocale } from "../lib/i18n-provider";

const AdminAuthorized = lazy(() => import("./admin-authorized"));

type AccessState = "checking" | "authorized" | "signed_out" | "forbidden" | "unavailable";

export default function AdminPageClient() {
  const { locale } = useLocale();
  const [access, setAccess] = useState<AccessState>("checking");
  const [message, setMessage] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/admin/overview", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.ok) return setAccess("authorized");
        const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
        setMessage(body?.message || "管理身份验证暂时不可用。");
        setAccess(response.status === 401 ? "signed_out" : response.status === 403 ? "forbidden" : "unavailable");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage("管理身份验证暂时不可用。");
        setAccess("unavailable");
      });
    return () => controller.abort();
  }, []);

  const signIn = async () => {
    setSigningIn(true);
    const result = await beginCmineLogin("/admin", locale);
    if (!result.ok) {
      setMessage(result.message || "统一账号登录尚未配置。");
      setSigningIn(false);
    }
  };

  if (access === "checking") {
    return <main className="admin-access-shell" aria-busy="true"><span className="sr-only">正在验证管理权限</span></main>;
  }

  if (access !== "authorized") {
    return <main className="admin-access-shell">
      <section className="admin-denied" aria-live="polite">
        <span>管理权限验证</span>
        <h1>{access === "signed_out" ? "请先登录。" : access === "forbidden" ? "没有管理权限。" : "登录服务不可用。"}</h1>
        <p>{message}</p>
        {access === "signed_out"
          ? <button className="admin-login-button" disabled={signingIn} onClick={() => void signIn()}>{signingIn ? "正在连接…" : "登录管理后台 "}</button>
          : <Link href="/">返回首页</Link>}
      </section>
    </main>;
  }

  return <Suspense fallback={<main className="admin-access-shell" aria-busy="true" />}><AdminAuthorized /></Suspense>;
}
