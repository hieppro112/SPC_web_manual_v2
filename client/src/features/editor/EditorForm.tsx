// ============================================================
// EditorForm — trình soạn tài liệu theo khối
// ============================================================
// Toàn bộ bản nháp (tiêu đề, thể loại, trạng thái, các khối) nằm trong MỘT
// state `draft`. "Chưa lưu" = draft khác bản đã lưu gần nhất.
//
// Mọi thao tác trên khối đều tạo mảng MỚI (map/filter/spread), không sửa
// mảng cũ tại chỗ — React so sánh bằng tham chiếu để biết cần vẽ lại.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowLeft, Eye, Pencil, Save } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Select from '../../components/ui/Select.tsx';
import { computeBlockMeta } from '../../blocks/meta.ts';
import { createBlock } from '../../blocks/registry.ts';
import type { Block, BlockPropsMap, BlockType } from '../../blocks/types.ts';
import type { Category, DocInput } from '../../lib/types.ts';
import { cn, errorMessage, newId } from '../../lib/utils.ts';
import CategoryOptions from '../categories/CategoryOptions.tsx';
import { buildCategoryTree } from '../categories/tree.ts';
import DocContent from '../documents/DocContent.tsx';
import { useSaveDocument } from '../documents/queries.ts';
import { useCompleteTask } from '../guide/queries.ts';
import { tasksFromBlocks } from '../guide/tasks.ts';
import BlockPicker from './BlockPicker.tsx';
import SortableBlockCard from './SortableBlockCard.tsx';
import { useUnsavedGuard } from './useUnsavedGuard.ts';

type Props = {
  docId?: string; // undefined = tài liệu mới
  initial: DocInput;
  categories: Category[];
  backTo: string;
};

export default function EditorForm({ docId, initial, categories, backTo }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const saveDoc = useSaveDocument();
  const complete = useCompleteTask();
  const titleRef = useRef<HTMLInputElement>(null);

  // "Lazy initializer": giá trị khởi tạo chỉ dùng MỘT lần lúc mở trình soạn.
  const [draft, setDraft] = useState<DocInput>(() => initial);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const dirty = useMemo(() => JSON.stringify(draft) !== savedJson, [draft, savedJson]);
  const { allowNextNavigation } = useUnsavedGuard(dirty, t('editor.leaveConfirm'));
  const { meta } = useMemo(() => computeBlockMeta(draft.blocks), [draft.blocks]);
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  // ---------- Thao tác trên khối ----------
  // useCallback + setDraft(prev => ...) : hàm giữ NGUYÊN tham chiếu qua các
  // lần vẽ (không phụ thuộc draft hiện tại), nên SortableBlockCard (memo)
  // không vẽ lại vô ích.
  const setBlocks = useCallback((update: (blocks: Block[]) => Block[]) => {
    setDraft((prev) => ({ ...prev, blocks: update(prev.blocks) }));
  }, []);

  const insertAt = useCallback(
    (index: number, type: BlockType) => setBlocks((blocks) => [...blocks.slice(0, index), createBlock(type, newId()), ...blocks.slice(index)]),
    [setBlocks],
  );
  const insertAfter = useCallback((index: number, type: BlockType) => insertAt(index + 1, type), [insertAt]);

  const changeBlock = useCallback(
    (id: string, props: BlockPropsMap[BlockType]) => setBlocks((blocks) => blocks.map((b) => (b.id === id ? ({ ...b, props } as Block) : b))),
    [setBlocks],
  );

  const removeBlock = useCallback((id: string) => setBlocks((blocks) => blocks.filter((b) => b.id !== id)), [setBlocks]);

  const duplicateBlock = useCallback(
    (id: string) =>
      setBlocks((blocks) => {
        const i = blocks.findIndex((b) => b.id === id);
        if (i < 0) return blocks;
        // structuredClone: sao chép SÂU (cả mảng/object lồng bên trong), để
        // sửa bản sao không ảnh hưởng bản gốc.
        const copy = { ...structuredClone(blocks[i]), id: newId() } as Block;
        return [...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)];
      }),
    [setBlocks],
  );

  const moveBlock = useCallback(
    (id: string, delta: number) =>
      setBlocks((blocks) => {
        const from = blocks.findIndex((b) => b.id === id);
        const to = from + delta;
        return to < 0 || to >= blocks.length ? blocks : arrayMove(blocks, from, to);
      }),
    [setBlocks],
  );

  // ---------- Kéo thả (dnd-kit) ----------
  const sensors = useSensors(
    // Phải kéo ít nhất 5px mới tính là kéo -> bấm nhầm tay nắm không làm xáo trộn.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Kéo bằng bàn phím: Tab tới tay nắm, Space để nhấc, mũi tên để di chuyển.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setBlocks((blocks) => {
      const from = blocks.findIndex((b) => b.id === active.id);
      const to = blocks.findIndex((b) => b.id === over.id);
      return arrayMove(blocks, from, to);
    });
  };

  // ---------- Lưu ----------
  const save = async () => {
    if (!draft.title.trim()) {
      toast.error(t('editor.titleRequired'));
      titleRef.current?.focus();
      return;
    }
    if (!draft.category) {
      toast.error(t('editor.categoryRequired'));
      return;
    }
    try {
      const saved = await saveDoc.mutateAsync({ id: docId, data: draft });
      setSavedJson(JSON.stringify(draft));
      toast.success(t('editor.saved'));
      // Nhiệm vụ thực hành: lưu bài, có Bước / ảnh / sơ đồ-biểu đồ.
      for (const key of tasksFromBlocks(draft.blocks)) complete(key);
      if (!docId) {
        // Tài liệu mới: chuyển sang URL sửa của chính nó để lưu lần sau là "sửa".
        allowNextNavigation();
        navigate(`/docs/${saved.slug}/edit`, { replace: true });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // Ctrl+S / Cmd+S để lưu. Giữ hàm save mới nhất trong ref để listener
  // chỉ cần gắn MỘT lần.
  const saveRef = useRef(save);
  // Cập nhật ref trong effect (không gán thẳng lúc vẽ — React khuyên vậy).
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); // chặn hộp thoại "Lưu trang web" của trình duyệt
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div>
      {/* Thanh công cụ dính dưới header */}
      <div className="sticky top-14 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-form flex-wrap items-center gap-2 px-4 py-2">
          <Link to={backTo} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title={t('common.back')}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {docId ? t('editor.editDoc') : t('editor.newDoc')}
            <span className={cn('ml-2 text-xs font-normal', dirty ? 'text-warning' : 'text-muted')}>
              {dirty ? `● ${t('editor.unsaved')}` : t('editor.allSaved')}
            </span>
          </span>

          <div data-tour="editor-mode" className="flex rounded-lg border border-border p-0.5">
            {(['edit', 'preview'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-sm', mode === m ? 'bg-surface-2 font-medium' : 'text-muted')}
              >
                {m === 'edit' ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {m === 'edit' ? t('editor.editing') : t('common.preview')}
              </button>
            ))}
          </div>

          <Select
            aria-label={t('editor.status')}
            data-tour="editor-status"
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value === 'published' ? 'published' : 'draft' }))}
            className="h-9 w-auto"
          >
            <option value="draft">{t('status.draft')}</option>
            <option value="published">{t('status.published')}</option>
          </Select>

          <Button onClick={save} loading={saveDoc.isPending} title={t('editor.shortcut')} data-tour="editor-save">
            <Save className="h-4 w-4" /> {t('common.save')}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-form px-4 py-6">
        {mode === 'preview' ? (
          <article>
            <h1 className="mb-6 border-b border-border pb-5 text-3xl font-bold">{draft.title}</h1>
            <DocContent blocks={draft.blocks} meta={meta} />
          </article>
        ) : (
          <div className="space-y-5">
            <input
              ref={titleRef}
              data-tour="editor-title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder={t('editor.titlePlaceholder')}
              className="w-full bg-transparent text-3xl font-bold placeholder:text-muted/60 focus:outline-none"
            />

            <label data-tour="editor-category" className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">{t('editor.category')}</span>
              <Select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className="w-auto min-w-56">
                <option value="">{t('editor.chooseCategory')}</option>
                {/* Thụt lề theo cây: IT, └ AI, PC... */}
                <CategoryOptions tree={categoryTree} />
              </Select>
              {categories.length === 0 && <span className="text-warning">{t('editor.noCategory')}</span>}
            </label>

            {/* Thời gian đọc tối thiểu (phút): người dùng phải đọc đủ + cuộn tới cuối mới được làm bài kiểm tra của bài này. */}
            <label className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">{t('reading.editorLabel')}</span>
              <input
                type="number"
                min={0}
                max={600}
                step={0.5}
                value={draft.readingSeconds ? Number((draft.readingSeconds / 60).toFixed(2)) : ''}
                onChange={(e) => {
                  const minutes = parseFloat(e.target.value);
                  setDraft((d) => ({ ...d, readingSeconds: minutes > 0 ? Math.min(36_000, Math.round(minutes * 60)) : null }));
                }}
                placeholder="—"
                className="h-9 w-24 rounded-lg border border-border bg-surface px-2"
              />
              <span className="text-muted">{t('reading.editorHint')}</span>
            </label>

            {draft.blocks.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">{t('editor.emptyBlocks')}</p>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={draft.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div>
                  {draft.blocks.map((block, index) => (
                    <SortableBlockCard
                      key={block.id}
                      block={block}
                      index={index}
                      total={draft.blocks.length}
                      stepNumber={meta.get(block.id)?.stepNumber}
                      onChange={changeBlock}
                      onRemove={removeBlock}
                      onDuplicate={duplicateBlock}
                      onMove={moveBlock}
                      onInsertAfter={insertAfter}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <section data-tour="add-block">
              <h2 className="mb-2 text-sm font-semibold text-muted">{t('editor.addBlock')}</h2>
              <BlockPicker onPick={(type) => insertAt(draft.blocks.length, type)} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
