"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Hash, Paperclip, X, Download, Image as ImageIcon } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import {
  fetchMessages,
  sendMessage,
  sendFileMessage,
  subscribeToMessages,
  validateAttachment,
  createSignedFileUrl,
  MAX_ATTACHMENT_SIZE_BYTES,
  type ChatMessage,
} from "@/lib/chat";

interface Props {
  communityId: string;
  communityName: string;
  isMember: boolean;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateHeading(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();
}

// Palette of avatar bg colours keyed by first character
const AVATAR_COLORS = [
  "bg-red-500/20 text-red-300",
  "bg-violet-500/20 text-violet-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-amber-500/20 text-amber-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-pink-500/20 text-pink-300",
];

function avatarColor(userId: string) {
  const code = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function CommunityChat({
  communityId,
  communityName,
  isMember,
}: Props) {
  const { user, profile } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Name cache so realtime messages can show author names ─────────────
  const nameCache = useRef<Map<string, string>>(new Map());

  const resolveAuthorName = useCallback(
    (msg: ChatMessage): string => {
      if (msg.author_name) {
        nameCache.current.set(msg.user_id, msg.author_name);
        return msg.author_name;
      }
      if (nameCache.current.has(msg.user_id)) {
        return nameCache.current.get(msg.user_id)!;
      }
      // Fallback to current user's name if it matches
      if (msg.user_id === user?.id) {
        const name = String(
          profile?.full_name ??
            user?.user_metadata?.full_name ??
            user?.email?.split("@")[0] ??
            "You"
        );
        nameCache.current.set(msg.user_id, name);
        return name;
      }
      return "Siber Member";
    },
    [user, profile]
  );

  // ── Load initial messages ─────────────────────────────────────────────
  useEffect(() => {
    if (!communityId) return;

    let mounted = true;
    async function load() {
      try {
        setLoadingMsgs(true);
        const data = await fetchMessages(communityId, 80);
        if (mounted) setMessages(data);
      } catch {
        // silently fail — chat table may not exist yet
      } finally {
        if (mounted) setLoadingMsgs(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [communityId]);

  // ── Realtime subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!communityId || !isMember) return;

    const unsub = subscribeToMessages(communityId, (msg) => {
      setMessages((prev) => {
        // Deduplicate: skip if we already have this id
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return unsub;
  }, [communityId, isMember]);

  // ── Scroll to bottom when messages change ─────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    try {
      validateAttachment(selected);
      setPendingFile(selected);
      setError("");
    } catch (err: unknown) {
      setPendingFile(null);
      setError(err instanceof Error ? err.message : "Unable to attach that file.");
    } finally {
      event.target.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!pendingFile || !pendingFile.type.startsWith("image/")) {
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      return;
    }

    const imageUrl = URL.createObjectURL(pendingFile);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return imageUrl;
    });
  }, [pendingFile]);

  const handleSend = async () => {
    if (sending) return;

    setSending(true);
    setError("");

    try {
      const text = input.trim();
      const hasText = text.length > 0;

      if (!hasText && !pendingFile) {
        setSending(false);
        return;
      }

      if (pendingFile) {
        const msg = await sendFileMessage(communityId, pendingFile);
        const named: ChatMessage = {
          ...msg,
          author_name: String(
            profile?.full_name ??
              user?.user_metadata?.full_name ??
              user?.email?.split("@")[0] ??
              "You"
          ),
        };
        setMessages((prev) =>
          prev.some((m) => m.id === named.id) ? prev : [...prev, named]
        );
        setPendingFile(null);
        setInput("");
      } else {
        const msg = await sendMessage(communityId, text);
        const named: ChatMessage = {
          ...msg,
          author_name: String(
            profile?.full_name ??
              user?.user_metadata?.full_name ??
              user?.email?.split("@")[0] ??
              "You"
          ),
        };
        setMessages((prev) =>
          prev.some((m) => m.id === named.id) ? prev : [...prev, named]
        );
        setInput("");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send.";
      setError(message);
      if (!pendingFile) {
        setInput(input.trim());
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const renderFileMessage = async (msg: ChatMessage) => {
    if (msg.message_type !== "file" || !msg.storage_path) {
      return null;
    }

    const downloadUrl = await createSignedFileUrl(msg.storage_path);
    const isImage = (msg.mime_type ?? "").startsWith("image/");

    return (
      <div className="mt-2 max-w-md rounded-xl border border-white/10 bg-white/5 p-2">
        {isImage ? (
          <img
            src={downloadUrl}
            alt={msg.file_name ?? "Attachment"}
            className="max-h-64 w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#15141b] p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-300">
              <Paperclip size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{msg.file_name ?? "Attachment"}</p>
              <p className="text-xs text-zinc-400">
                {(msg.mime_type || "file")}
                {msg.file_size ? ` · ${formatFileSize(msg.file_size)}` : ""}
              </p>
            </div>
          </div>
        )}
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
        >
          <Download size={12} /> Download
        </a>
      </div>
    );
  };

  // ── Group messages by date ────────────────────────────────────────────
  const groups: { date: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const dateStr = new Date(msg.created_at).toDateString();
    const last = groups[groups.length - 1];
    if (last?.date === dateStr) {
      last.msgs.push(msg);
    } else {
      groups.push({ date: dateStr, msgs: [msg] });
    }
  }

  function FileMessageCard({
    message,
    formatFileSize,
  }: {
    message: ChatMessage;
    formatFileSize: (bytes: number | null | undefined) => string;
  }) {
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
      if (!message.storage_path) {
        setDownloadUrl(null);
        return;
      }

      let active = true;
      setDownloading(true);
      void createSignedFileUrl(message.storage_path)
        .then((url) => {
          if (active) setDownloadUrl(url);
        })
        .catch(() => {
          if (active) setDownloadUrl(null);
        })
        .finally(() => {
          if (active) setDownloading(false);
        });

      return () => {
        active = false;
      };
    }, [message.storage_path]);

    const isImage = (message.mime_type ?? "").startsWith("image/");

    return (
      <div className="mt-2 max-w-md rounded-xl border border-white/10 bg-white/5 p-2">
        {isImage && downloadUrl ? (
          <img
            src={downloadUrl}
            alt={message.file_name ?? "Attachment"}
            className="max-h-64 w-full rounded-lg object-cover"
          />
        ) : null}
        {!isImage ? (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#15141b] p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-300">
              {isImage ? <ImageIcon size={16} /> : <Paperclip size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{message.file_name ?? "Attachment"}</p>
              <p className="text-xs text-zinc-400">
                {(message.mime_type || "file")}
                {message.file_size ? ` · ${formatFileSize(message.file_size)}` : ""}
              </p>
            </div>
          </div>
        ) : null}
        <a
          href={downloadUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={`mt-2 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${downloadUrl ? "bg-white/5 text-zinc-200 hover:bg-white/10" : "cursor-not-allowed bg-white/5 text-zinc-500"}`}
          onClick={(e) => {
            if (!downloadUrl) e.preventDefault();
          }}
        >
          <Download size={12} />
          {downloading ? "Preparing…" : "Download"}
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-[680px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0c12]/95 shadow-[0_30px_60px_rgba(0,0,0,.4)]">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15">
          <Hash size={16} className="text-red-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">{communityName}</p>
          <p className="text-xs text-zinc-500">community chat</p>
        </div>
      </div>

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loadingMsgs ? (
          <p className="pt-10 text-center text-sm text-zinc-500">Loading messages…</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
              <Hash size={22} className="text-zinc-500" />
            </div>
            <p className="font-semibold text-white">Welcome to #{communityName}!</p>
            <p className="text-sm text-zinc-500">This is the beginning of the community chat.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date}>
              {/* Date divider */}
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-semibold text-zinc-500">
                  {formatDateHeading(group.msgs[0].created_at)}
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {/* Messages in this date group */}
              {group.msgs.map((msg, idx) => {
                const prevMsg = group.msgs[idx - 1];
                const isSameAuthor = prevMsg?.user_id === msg.user_id;
                const isOwn = msg.user_id === user?.id;
                const authorName = resolveAuthorName(msg);

                return (
                  <div
                    key={msg.id}
                    className={`group flex items-start gap-3 rounded-2xl px-3 py-1 transition hover:bg-white/[0.03] ${
                      isSameAuthor ? "mt-0.5" : "mt-3"
                    }`}
                  >
                    {/* Avatar — only shown on first message of a run */}
                    <div className="w-9 shrink-0">
                      {!isSameAuthor ? (
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-2xl text-xs font-bold ${avatarColor(msg.user_id)}`}
                        >
                          {getInitials(authorName)}
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Name + timestamp — only on first message of a run */}
                      {!isSameAuthor ? (
                        <div className="mb-1 flex items-baseline gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              isOwn ? "text-lime-300" : "text-white"
                            }`}
                          >
                            {isOwn ? "You" : authorName}
                          </span>
                          <span className="text-xs text-zinc-600">
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      ) : null}

                      {msg.message_type === "file" ? (
                        <div className="space-y-2">
                          <p className="break-words text-sm leading-relaxed text-zinc-200">
                            {msg.content}
                          </p>
                          {msg.storage_path ? (
                            <FileMessageCard
                              message={msg}
                              formatFileSize={formatFileSize}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <p className="break-words text-sm leading-relaxed text-zinc-200">
                          {msg.content}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      {isMember ? (
        <div className="border-t border-white/10 px-4 py-3">
          {error ? (
            <p className="mb-2 text-xs text-red-400">{error}</p>
          ) : null}
          {pendingFile ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#111118] px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                {previewUrl ? (
                  <img src={previewUrl} alt="Pending upload preview" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-white/5 text-zinc-300">
                    <Paperclip size={15} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{pendingFile.name}</p>
                  <p className="text-xs text-zinc-400">{formatFileSize(pendingFile.size)} · {pendingFile.type || "file"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-zinc-300 hover:bg-white/10"
                aria-label="Remove selected file"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-[#111118] px-4 py-3 transition focus-within:border-red-500/40">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.gif,.zip"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-300 transition hover:bg-white/10"
              aria-label="Attach a file"
              title={`Attach a file (max ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))} MB)`}
            >
              <Paperclip size={14} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingFile ? "Add a caption (optional)" : `Message #${communityName}`}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              style={{ maxHeight: "120px" }}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={(input.trim() === "" && !pendingFile) || sending}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="mt-1.5 text-right text-xs text-zinc-600">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      ) : (
        <div className="border-t border-white/10 px-6 py-4 text-center text-sm text-zinc-500">
          Join this community to participate in the chat.
        </div>
      )}
    </div>
  );
}
