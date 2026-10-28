// ============================================================
// routes/categoryTemplates.ts — "Mục mặc định" của mọi bộ phận (chỉ admin, gắn requireAdmin ở index.ts)
// ============================================================
//   GET    /api/category-templates             cây mục mặc định (danh sách phẳng, có parentId)
//   POST   /api/category-templates             thêm   { name, iconName?, parentId? }
//   PUT    /api/category-templates/:id         sửa    { name?, iconName?, parentId? }
//   DELETE /api/category-templates/:id         xóa mục + mục con (KHÔNG đụng thể loại thật ở các bộ phận)
//   POST   /api/category-templates/:id/apply   thêm mục này vào mọi bộ phận (chỗ nào thiếu) -> { created }
//
// Sửa / xóa ở đây không lan sang các bộ phận: thể loại thật có thể đã có bài viết.

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';
import { createTemplate, deleteTemplateBranch, findTemplate, listTemplates, updateTemplate } from '../repositories/categoryTemplates.ts';
import { applyDefaults, branchOf } from '../services/categoryDefaults.ts';
import { wouldCreateCycle } from '../services/categoryTree.ts';
import { parseId } from '../utils/ids.ts';

export const categoryTemplatesRouter = Router();

const nameSchema = z.string().trim().min(1, 'Tên mục không được để trống').max(100, 'Tên mục tối đa 100 ký tự');
const iconSchema = z.string().trim().min(1).max(50);

async function findOr404(id: unknown) {
  const template = await findTemplate(parseId(id));
  if (!template) throw new HttpError(404, 'Mục mặc định không tồn tại');
  return template;
}

// parentId: null / '' = mục con trực tiếp của bộ phận; còn lại phải là mục mặc định có thật.
async function parseParent(value: unknown): Promise<number | null> {
  if (value === null || value === undefined || value === '') return null;
  const id = parseId(value, 'parentId');
  if (!(await findTemplate(id))) throw new HttpError(400, 'Mục cha không tồn tại');
  return id;
}

const links = async () => (await listTemplates()).map((t) => ({ id: Number(t.id), parentId: t.parentId === null ? null : Number(t.parentId) }));

categoryTemplatesRouter.get('/', async (_req, res) => {
  res.json(await listTemplates());
});

categoryTemplatesRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const { name, iconName } = z.object({ name: nameSchema, iconName: iconSchema.default('Folder') }).parse(body);
  res.status(201).json(await createTemplate(name, iconName, await parseParent(body.parentId)));
});

categoryTemplatesRouter.put('/:id', async (req, res) => {
  const template = await findOr404(req.params.id);
  const id = Number(template.id);
  const body = req.body ?? {};
  const { name, iconName } = z.object({ name: nameSchema.optional(), iconName: iconSchema.optional() }).parse(body);
  const parentId =
    body.parentId === undefined ? (template.parentId === null ? null : Number(template.parentId)) : await parseParent(body.parentId);
  if (wouldCreateCycle(await links(), id, parentId)) {
    throw new HttpError(400, 'Không thể đặt mục làm con của chính nó hoặc của mục con của nó');
  }
  await updateTemplate(id, name ?? template.name, iconName ?? template.iconName, parentId);
  res.json(await findTemplate(id));
});

categoryTemplatesRouter.delete('/:id', async (req, res) => {
  const template = await findOr404(req.params.id);
  await deleteTemplateBranch(Number(template.id));
  res.status(204).end();
});

categoryTemplatesRouter.post('/:id/apply', async (req, res) => {
  const template = await findOr404(req.params.id);
  res.json({ created: await applyDefaults(undefined, branchOf(await listTemplates(), template.id)) });
});
