"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { finishCmineLogin } from "../../../lib/auth";

export default function CmineCallbackPage() {
  const [message, setMessage] = useState("正在完成 Cmine ID 登录…");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      const code = params.get("code");
      const state = params.get("state");
      if (error) {
        setMessage("登录未完成：" + (params.get("error_description") || error));
        return;
      }
      if (!code || !state) {
        setMessage("回调参数不完整，请重新登录。");
        return;
      }
      finishCmineLogin(code, state)
        .then(() => window.location.replace("/"))
        .catch((reason: unknown) => active && setMessage(reason instanceof Error ? reason.message : "登录失败，请重试。"));
    });
    return () => { active = false; };
  }, []);
  return <main className="callback-page"><div className="callback-card"><span className="brand-mark">C</span><p>{message}</p><Link href="/">返回 Cmine Fit</Link></div></main>;
}
