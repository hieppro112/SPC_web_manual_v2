// ============================================================
// TranslationEditPage — sửa tay bản dịch  (/docs/:slug/translate/:lang)
// ============================================================
// Chỉ sửa CHỮ (cấu trúc bài: thêm / xóa / đổi chỗ khối, ảnh... sửa ở bài gốc).
// Mỗi khối: bên trái chữ gốc (để đối chiếu), bên phải ô sửa bản dịch.
// Khối đã sửa tay được giữ nguyên khi máy dịch lại, cho tới khi khối đó ở bài gốc bị sửa.

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Languages, Save } from 'lucide-react';
import AutoTextarea from '../../components/ui/AutoTextarea.tsx';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Input from '../../components/ui/Input.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { withDefaults } from '../../blocks/registry.ts';
import type { Block } from '../../blocks/types.ts';
import { errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useDocument } from '../documents/queries.ts';
import { useUnsavedGuard } from '../editor/useUnsavedGuard.ts';
import { LANGS, type Lang, type TranslationEdit } from './api.ts';
import { useDocTranslation, useSaveTranslation } from './queries.ts';
import { extractTexts, keyLabel } from './texts.ts';

export default function TranslationEditPage() {
  const { slug, lang: langParam } = useParams();
  const { t } = useTranslation();
  const lang = (LANGS as string[]).includes(langParam ?? '') ? (langParam as Lang) : null;
  const doc = useDocument(slug);
  const view = useDocTranslation(doc.data?.id, lang);
  useDocumentTitle(t('translation.editTitle'));

  // (Query bị tắt — lang sai — cũng ở trạng thái "pending" trong TanStack v5, nên kiểm tra lang trước.)
  if (doc.isPending || (doc.data && lang && view.isPending)) return <Spinner className="py-24" />;
  const data = view.data;
  if (!doc.data || !lang || !data || (data.status !== 'ready' && data.status !== 'partial') || !data.blocks) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={Languages}
          title={t('translation.nothingToEdit')}
          description={doc.error || view.error ? errorMessage(doc.error ?? view.error) : undefined}
          action={
            <Link to={slug ? `/docs/${slug}` : '/'}>
              <Button variant="secondary">{t('common.back')}</Button>
            </Link>
          }
        />
      </div>
    );
  }
  // key: tải lại bản dịch (vd máy vừa dịch xong) -> form làm lại từ dữ liệu mới.
  return (
    <TranslationForm
      key={`${data.lang}:${String(data.editedAt)}:${data.translatedIds?.join(',')}`}
      docId={doc.data.id}
      slug={doc.data.slug}
      lang={lang}
      original={doc.data.blocks.map(withDefaults)}
      originalTitle={doc.data.title}
      title={data.title ?? doc.data.title}
      blocks={data.blocks.map(withDefaults)}
      translatedIds={data.translatedIds ?? []}
    />
  );
}

type FormProps = {
  docId: string;
  slug: string;
  lang: Lang;
  original: Block[];
  originalTitle: string;
  title: string;
  blocks: Block[];
  translatedIds: string[];
};

function TranslationForm({ docId, slug, lang, original, originalTitle, title, blocks, translatedIds }: FormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const save = useSaveTranslation(docId, lang);

  // Chỉ khối ĐÃ dịch mới sửa được (khối chưa dịch đang hiện chữ gốc, chờ máy dịch).
  const rows = useMemo(() => {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    return original
      .filter((b) => translatedIds.includes(b.id))
      .map((source) => ({ source, sourceTexts: extractTexts(source), translated: extractTexts(byId.get(source.id) ?? source) }))
      .filter((r) => Object.keys(r.sourceTexts).length > 0);
  }, [original, blocks, translatedIds]);

  const initial = useMemo<TranslationEdit>(
    () => ({ title, blocks: Object.fromEntries(rows.map((r) => [r.source.id, r.translated])) }),
    [title, rows],
  );
  const [draft, setDraft] = useState<TranslationEdit>(initial);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(draft) !== savedJson;
  const { allowNextNavigation } = useUnsavedGuard(dirty, t('editor.leaveConfirm'));
  const untranslatedCount = original.filter((b) => !translatedIds.includes(b.id) && Object.keys(extractTexts(b)).length).length;

  const setText = (blockId: string, key: string, text: string) =>
    setDraft((d) => ({ ...d, blocks: { ...d.blocks, [blockId]: { ...d.blocks[blockId], [key]: text } } }));

  const onSave = () => {
    if (!draft.title.trim()) return toast.error(t('editor.titleRequired'));
    save.mutate(draft, {
      onSuccess: () => {
        setSavedJson(JSON.stringify(draft));
        toast.success(t('translation.saved'));
        allowNextNavigation();
        navigate(`/docs/${slug}?lang=${lang}`);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <div>
      <div className="sticky top-14 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-page items-center gap-2 px-4 py-2 lg:px-8">
          <Link to={`/docs/${slug}?lang=${lang}`} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title={t('common.back')}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {t('translation.editTitle')} · {t(`quiz.languages.${lang}`)}
            {dirty && <span className="ml-2 text-xs font-normal text-warning">● {t('editor.unsaved')}</span>}
          </span>
          <Button onClick={onSave} loading={save.isPending} disabled={!dirty}>
            <Save className="h-4 w-4" /> {t('common.save')}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-page space-y-4 px-4 py-6 lg:px-8">
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          {t('translation.editHint')}
          {untranslatedCount > 0 && <> {t('translation.editSkipped', { count: untranslatedCount })}</>}
        </p>

        <section className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted uppercase">{t('editor.titlePlaceholder')}</p>
            <p className="text-sm whitespace-pre-wrap text-muted">{originalTitle}</p>
          </div>
          <Input value={draft.title} maxLength={300} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </section>

        {rows.map(({ source, sourceTexts }) => (
          <section key={source.id} className="rounded-xl border border-border p-4">
            <p className="mb-2 text-xs font-semibold text-muted">{t(`blocks.${source.type}.label`)}</p>
            <div className="space-y-3">
              {Object.entries(sourceTexts).map(([key, text]) => (
                <div key={key} className="grid gap-2 md:grid-cols-2">
                  <div>
                    {Object.keys(sourceTexts).length > 1 && <p className="mb-0.5 text-[11px] text-muted">{keyLabel(key, t)}</p>}
                    <p className="text-sm whitespace-pre-wrap text-muted">{text}</p>
                  </div>
                  <AutoTextarea
                    value={draft.blocks[source.id]?.[key] ?? ''}
                    onChange={(e) => setText(source.id, key, e.target.value)}
                    minRows={1}
                    maxLength={20_000}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
