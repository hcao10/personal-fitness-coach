"use client";

import { useEffect, useRef, useState } from "react";
import ProductShell from "../components/product-shell";
import { beginCmineLogin } from "../lib/auth";

type Action = { id: string; type: string; status: string; payload: { title?: string; description?: string } };
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; actions?: Action[] };
type Conversation = { id: string; title: string; updatedAt: string };

export default function CoachClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]); const [active, setActive] = useState<string | null>(null); const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(""); const [sending, setSending] = useState(false); const [error, setError] = useState(""); const endRef = useRef<HTMLDivElement>(null);
  const loadMessages = async (id: string) => { const response = await fetch(`/api/v1/coach/conversations/${id}/messages`, { cache: "no-store" }); if (response.ok) setMessages((await response.json() as { messages: Message[] }).messages); };
  useEffect(() => { void (async () => { const response = await fetch("/api/v1/coach/conversations", { cache: "no-store" }); if (response.status === 401) { await beginCmineLogin("/coach"); return; } if (!response.ok) return;
    let list = (await response.json() as { conversations: Conversation[] }).conversations; if (!list.length) { const created = await fetch("/api/v1/coach/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "新的对话" }) }); if (created.ok) list = [(await created.json() as { conversation: Conversation }).conversation]; }
    setConversations(list); if (list[0]) { setActive(list[0].id); await loadMessages(list[0].id); }
  })(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const create = async () => { const response = await fetch("/api/v1/coach/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "新的对话" }) }); if (!response.ok) return; const conversation = (await response.json() as { conversation: Conversation }).conversation; setConversations((current) => [conversation, ...current]); setActive(conversation.id); setMessages([]); };
  const send = async () => {
    if (!active || !text.trim() || sending) return; const content = text.trim(); const tempId = crypto.randomUUID(); setText(""); setError(""); setSending(true);
    setMessages((current) => [...current, { id: tempId, role: "user", content, createdAt: new Date().toISOString() }, { id: `${tempId}:assistant`, role: "assistant", content: "", createdAt: new Date().toISOString(), actions: [] }]);
    const response = await fetch(`/api/v1/coach/conversations/${active}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: content, clientMutationId: tempId }) });
    if (!response.ok || !response.body) { const payload = await response.json().catch(() => null) as { message?: string } | null; setMessages((current) => current.filter((item) => item.id !== `${tempId}:assistant`)); setError(payload?.message || "Coach 暂时无法回复。"); setSending(false); return; }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const blocks = buffer.split("\n\n"); buffer = blocks.pop() || "";
      for (const block of blocks) { const event = block.match(/^event: (.+)$/m)?.[1]; const raw = block.match(/^data: (.+)$/m)?.[1]; if (!event || !raw) continue; const data = JSON.parse(raw) as Record<string, unknown>;
        if (event === "message.delta") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, content: item.content + String(data.delta || "") } : item));
        if (event === "action.proposed") setMessages((current) => current.map((item) => item.id === `${tempId}:assistant` ? { ...item, actions: [...(item.actions || []), data as unknown as Action] } : item));
      }
    }
    setSending(false);
  };
  const decide = async (action: Action, decision: "accept" | "reject") => { const response = await fetch(`/api/v1/coach/actions/${action.id}/${decision}`, { method: "POST" }); if (response.ok) setMessages((current) => current.map((message) => ({ ...message, actions: message.actions?.map((item) => item.id === action.id ? { ...item, status: decision === "accept" ? "accepted" : "rejected" } : item) }))); };
  return <ProductShell active="/coach" eyebrow="COACH / 连续对话" title="懂训练，更懂你的现实生活" action={<button className="header-chip" onClick={() => void create()}>＋ 新对话</button>}>
    <div className="coach-chat-layout"><aside className="conversation-list"><span>对话</span>{conversations.map((conversation) => <button key={conversation.id} className={active === conversation.id ? "active" : ""} onClick={() => { setActive(conversation.id); void loadMessages(conversation.id); }}><b>{conversation.title}</b><small>{new Date(conversation.updatedAt).toLocaleDateString()}</small></button>)}</aside>
      <section className="coach-chat"><div className="coach-message-list">{!messages.length && <div className="coach-empty"><span>C</span><h2>从今天的训练开始聊吧</h2><p>你可以问动作替代、训练强度、恢复、饮食安排，也可以请 Coach 发起一次复盘。</p><div>{["今天状态不好，要不要减量？","帮我替换一个膝盖更舒服的动作","我最近三周没有进展"].map((prompt) => <button key={prompt} onClick={() => setText(prompt)}>{prompt}</button>)}</div></div>}
        {messages.map((message) => <article key={message.id} className={`coach-message ${message.role}`}><span>{message.role === "assistant" ? "C" : "你"}</span><div><p>{message.content || (sending ? "正在思考合适的建议…" : "")}</p>{message.actions?.map((action) => <div className="coach-action-card" key={action.id}><small>{action.type.replaceAll("_", " ")}</small><b>{action.payload.title}</b><p>{action.payload.description}</p>{action.status === "pending" ? <div><button onClick={() => void decide(action, "reject")}>暂不</button><button onClick={() => void decide(action, "accept")}>接受建议</button></div> : <em>{action.status === "accepted" ? "已接受" : "已拒绝"}</em>}</div>)}</div></article>)}<div ref={endRef} /></div>
        <div className="coach-composer"><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="告诉 Coach 你今天的状态，或问一个训练问题…" /><button disabled={sending || !text.trim()} onClick={() => void send()}>发送 ↑</button></div>{error && <p className="chat-error">{error} <a href="/pricing">查看 Pro</a></p>}
      </section>
    </div>
  </ProductShell>;
}
