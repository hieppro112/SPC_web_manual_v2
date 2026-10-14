// ============================================================
// AiChatWidget — nút 💬 nổi góc màn hình + khung chat với trợ lý AI
// ============================================================
// Gắn MỘT lần trong AppLayout nên có mặt ở mọi trang, và cuộc trò chuyện
// được giữ nguyên khi chuyển trang (component không bị gỡ ra).
//
// Đang ở trang đọc tài liệu (/docs/:slug) thì có thêm:
//   • phạm vi "Tài liệu này" (mặc định) / "Tất cả tài liệu"
//   • nút "Tóm tắt tài liệu này"
//
// Câu trả lời tới dần từng mẩu chữ (stream): mỗi mẩu tới là nối vào tin
// nhắn cuối -> React vẽ lại -> chữ hiện ra như đang gõ.

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useMatch, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Bot, FileText, LoaderCircle, MessageCircle, RotateCcw, Send, Square, X } from 'lucide-react';
import Markdown from '../../components/Markdown.tsx';
import AutoTextarea from '../../components/ui/AutoTextarea.tsx';
import Button from '../../components/ui/Button.tsx';
import { ApiError } from '../../lib/http.ts';
import { isEditor } from '../../lib/types.ts';
import { cn, errorMessage, newId } from '../../lib/utils.ts';
import { useCurrentUser } from '../auth/queries.ts';
import { useDocument } from '../documents/queries.ts';
import { aiApi, type AiMode, type AiSource } from './api.ts';
import { useAiStatus } from './queries.ts';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AiSource[];
  error?: string;
  pending?: boolean;
};

export default function AiChatWidget() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { data: status } = useAiStatus();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = messages.some((m) => m.pending);

  // Đang đọc tài liệu nào (chỉ trang /docs/:slug, không tính /edit, /history).
  const slug = useMatch('/docs/:slug')?.params.slug;
  const { data: doc } = useDocument(slug);
  // AI chỉ đọc bài đã xuất bản.
  const docAvailable = !!doc && doc.status === 'published';

  // Phạm vi hỏi: nhớ theo từng tài liệu; sang bài khác thì về mặc định "Tài liệu này".
  // (Tính ra từ state thay vì dùng useEffect để "reset" — gọn và không vẽ thừa.)
  const [scopeChoice, setScopeChoice] = useState<{ slug?: string; scope: 'doc' | 'all' }>({ scope: 'all' });
  const scope: 'doc' | 'all' = !docAvailable ? 'all' : scopeChoice.slug === slug ? scopeChoice.scope : 'doc';

  // Có tin mới / chữ mới -> cuộn xuống cuối.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  // Khách và role "user" bị giới hạn số câu/giờ; editor/admin không.
  const guestRemaining = isEditor(user) ? null : (remaining ?? status?.remaining ?? null);

  if (!status?.enabled) return null;

  const patch = (id: string, change: (m: Message) => Partial<Message>) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...change(m) } : m)));

  const send = async (mode: AiMode, question: string) => {
    if (busy) return;
    // Vài lượt hỏi đáp gần nhất để AI hiểu câu hỏi nối tiếp.
    const history = messages
      .filter((m) => !m.error && !m.pending && m.content)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    const answerId = newId();
    setMessages((list) => [
      ...list,
      { id: newId(), role: 'user', content: mode === 'summary' ? t('ai.summaryRequest', { title: doc?.title }) : question },
      { id: answerId, role: 'assistant', content: '', pending: true },
    ]);
    setInput('');

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await aiApi.chat(
        { mode, question, slug: mode === 'all' ? undefined : slug, lang: i18n.language, history: mode === 'summary' ? [] : history },
        (event) => {
          if (event.type === 'meta') {
            patch(answerId, () => ({ sources: event.sources }));
            setRemaining(event.remaining);
          } else if (event.type === 'delta') {
            patch(answerId, (m) => ({ content: m.content + event.text }));
          } else if (event.type === 'error') {
            patch(answerId, () => ({ error: event.message }));
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (controller.signal.aborted) {
        patch(answerId, (m) => ({ content: m.content ? `${m.content}\n\n_${t('ai.stopped')}_` : `_${t('ai.stopped')}_` }));
      } else {
        // 429 = khách hết lượt hỏi trong giờ
        if (err instanceof ApiError && err.status === 429) setRemaining(0);
        patch(answerId, () => ({ error: errorMessage(err) }));
      }
    } finally {
      patch(answerId, () => ({ pending: false }));
      abortRef.current = null;
    }
  };

  const submit = () => {
    const q = input.trim();
    if (q) void send(scope, q);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter = gửi, Shift+Enter = xuống dòng. isComposing: đang gõ tiếng Nhật
    // (bộ gõ IME chưa chốt chữ) thì Enter là để chốt chữ, không phải gửi.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  // Link trong câu trả lời trỏ về trang của app (/docs/...) -> chuyển trang
  // bằng React Router (không tải lại cả trang, không mất cuộc trò chuyện).
  const onAnswerClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (href?.startsWith('/')) {
      e.preventDefault();
      navigate(href);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
  };

  return (
    <div className="no-print">
      {open && (
        <section
          aria-label={t('ai.title')}
          className="fixed inset-x-2 top-16 bottom-20 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl sm:inset-x-auto sm:top-auto sm:right-4 sm:h-[min(640px,calc(100vh-7rem))] sm:w-[420px]"
        >
          {/* Đầu khung */}
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Bot className="h-5 w-5 text-accent" />
            <h2 className="flex-1 font-semibold">{t('ai.title')}</h2>
            <Button size="icon" variant="ghost" onClick={reset} title={t('ai.newChat')} disabled={!messages.length}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setOpen(false)} title={t('common.close')}>
              <X className="h-4 w-4" />
            </Button>
          </header>

          {/* Phạm vi hỏi khi đang đọc một tài liệu */}
          {docAvailable && (
            <div className="space-y-2 border-b border-border px-3 py-2">
              <div className="flex rounded-lg border border-border p-0.5 text-sm" role="radiogroup" aria-label={t('ai.scope')}>
                {(['doc', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={scope === s}
                    onClick={() => setScopeChoice({ slug, scope: s })}
                    className={cn('flex-1 rounded-md px-2 py-1', scope === s ? 'bg-surface-2 font-medium' : 'text-muted hover:text-fg')}
                  >
                    {s === 'doc' ? t('ai.scopeDoc') : t('ai.scopeAll')}
                  </button>
                ))}
              </div>
              {scope === 'doc' && <p className="truncate text-xs text-muted">📄 {doc?.title}</p>}
            </div>
          )}

          {/* Danh sách tin nhắn */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {!messages.length && (
              <div className="space-y-3 py-6 text-center text-sm text-muted">
                <Bot className="mx-auto h-10 w-10 text-accent/70" />
                <p>{scope === 'doc' ? t('ai.welcomeDoc') : t('ai.welcome')}</p>
                {docAvailable && (
                  <Button size="sm" variant="secondary" onClick={() => void send('summary', '')}>
                    <FileText className="h-4 w-4" /> {t('ai.summarize')}
                  </Button>
                )}
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="ml-8 rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm whitespace-pre-wrap text-accent-fg">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="mr-4 space-y-2">
                  {m.pending && !m.content && !m.error && (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <LoaderCircle className="h-4 w-4 animate-spin" /> {t('ai.thinking')}
                    </p>
                  )}
                  {m.content && (
                    <div onClick={onAnswerClick} className="rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2">
                      <Markdown text={m.content} className="text-sm" />
                    </div>
                  )}
                  {m.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{m.error}</p>}
                  {/* Nguồn: hiện khi đã trả lời xong */}
                  {!m.pending && !m.error && !!m.sources?.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.sources.map((s) => (
                        <Link
                          key={s.url}
                          to={s.url}
                          className="max-w-full truncate rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:border-accent/50 hover:text-accent"
                          title={s.section ? `${s.title} › ${s.section}` : s.title}
                        >
                          📄 {s.section ? `${s.title} › ${s.section}` : s.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>

          {/* Ô nhập */}
          <footer className="space-y-1.5 border-t border-border px-3 py-2">
            <div className="flex items-end gap-2">
              <AutoTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                minRows={1}
                maxLength={2000}
                placeholder={t('ai.placeholder')}
                className="max-h-32 overflow-y-auto"
                disabled={guestRemaining === 0}
              />
              {busy ? (
                <Button size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} title={t('ai.stop')}>
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="icon" onClick={submit} disabled={!input.trim() || guestRemaining === 0} title={t('ai.send')}>
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted">
              {guestRemaining !== null && (
                <>
                  {t('ai.remaining', { count: guestRemaining })}{' '}
                  {!user && (
                    <Link to="/login" className="text-accent hover:underline">
                      {t('ai.loginForMore')}
                    </Link>
                  )}
                  {' · '}
                </>
              )}
              {t('ai.disclaimer')}
            </p>
          </footer>
        </section>
      )}

      {/* Nút nổi */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('ai.title')}
        aria-expanded={open}
        className="fixed right-4 bottom-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition hover:bg-accent-hover"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
