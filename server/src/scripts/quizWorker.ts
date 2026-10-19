// ============================================================
// scripts/quizWorker.ts — "Người làm thuê" nhờ Claude: tạo đề kiểm tra + nhập bài từ PowerPoint
// ============================================================
// Chạy trên máy có cài Claude Code và đã đăng nhập tài khoản Claude (gói Team):
//
//   npm run quiz-worker        (đọc cấu hình từ server/quiz-worker.env)
//
// Mỗi POLL_SECONDS giây:
//   1. Hỏi web: có yêu cầu tạo đề nào đang chờ không?   (POST /api/worker/quiz-jobs/claim)
//      -> không có: ngủ tiếp, KHÔNG gọi Claude (không tốn lượt dùng).
//   2. Có: web trả sẵn lời dặn + nội dung tài liệu + khuôn JSON.
//   3. Gọi Claude Code ở chế độ không tương tác, TẮT HẾT công cụ (--tools ""):
//      Claude chỉ đọc chữ và viết đề, không chạy lệnh / không sửa file nào.
//   4. Gửi đề về web (POST .../complete) -> web kiểm tra, lưu thành ĐỀ NHÁP.
//
// Script này chỉ chuyển dữ liệu qua lại; mọi quyết định (lời dặn, luật kiểm
// tra) nằm ở server. Khóa máy đọc từ file .env, không in ra log.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API_URL = (process.env.WORKER_API_URL ?? 'http://localhost:5000').replace(/\/+$/, '');
const TOKEN = process.env.QUIZ_WORKER_TOKEN ?? '';
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 300);
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MINUTES ?? 20) * 60_000;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? ''; // trống = model mặc định của tài khoản
const TRANSLATE_PER_ROUND = Math.max(1, Number(process.env.TRANSLATE_PER_ROUND ?? 5)); // số bài dịch mỗi vòng
// claude.cmd của npm thực chất chạy file .exe này -> gọi thẳng, không cần shell.
const CLAUDE_EXE =
  process.env.CLAUDE_EXE || path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');

const log = (msg: string) => console.log(`[${new Date().toLocaleString('vi-VN')}] ${msg}`);

if (!TOKEN) {
  console.error('❌ Thiếu QUIZ_WORKER_TOKEN trong quiz-worker.env');
  process.exit(1);
}
if (!fs.existsSync(CLAUDE_EXE)) {
  console.error(`❌ Không thấy Claude Code tại ${CLAUDE_EXE}. Cài Claude Code hoặc đặt CLAUDE_EXE trong quiz-worker.env`);
  process.exit(1);
}

// Một lần nhờ Claude: lời dặn + nội dung + khuôn JSON (server soạn sẵn).
type ClaudeTask = { system: string; prompt: string; schema: object };
type QuizJob = ClaudeTask & { id: string; questionCount: number };
// Nhập PowerPoint: file dài được server chia thành nhiều phần (~10 slide), mỗi phần một lần gọi Claude.
type ImportJob = { id: string; fileName: string; parts: ClaudeTask[] };
// Dịch bài: mỗi phần là một ngôn ngữ đích (bài dài thì một ngôn ngữ nhiều phần).
type TranslateJob = { id: string; title: string; version: number; sourceLang: string; parts: (ClaudeTask & { lang: string })[] };

async function api<T>(urlPath: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API_URL}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-token': TOKEN },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`${urlPath} -> HTTP ${res.status}: ${data.message ?? ''}`);
  return data;
}

// Gọi Claude Code: -p (chạy một lần rồi thoát), không công cụ, ép JSON schema.
// Chạy trong thư mục tạm để KHÔNG nạp CLAUDE.md / cấu hình của dự án nào.
function runClaude(job: ClaudeTask): Promise<unknown> {
  const workDir = path.join(os.tmpdir(), 'kvh-quiz-worker');
  fs.mkdirSync(workDir, { recursive: true });
  const args = [
    '-p',
    '--tools', '',
    '--strict-mcp-config', // không nạp MCP server nào
    '--output-format', 'json',
    '--no-session-persistence',
    '--json-schema', JSON.stringify(job.schema),
    '--system-prompt', job.system,
    ...(CLAUDE_MODEL ? ['--model', CLAUDE_MODEL] : []),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_EXE, args, { cwd: workDir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude chạy quá ${CLAUDE_TIMEOUT_MS / 60_000} phút`));
    }, CLAUDE_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(out) as { is_error?: boolean; result?: string; structured_output?: unknown; total_cost_usd?: number };
        if (result.is_error) return reject(new Error(`Claude báo lỗi: ${String(result.result).slice(0, 300)}`));
        log(`   Claude xong (exit ${code}, tương đương ~$${result.total_cost_usd?.toFixed(3) ?? '?'} nếu tính theo API)`);
        resolve(result.structured_output ?? JSON.parse(String(result.result)));
      } catch {
        reject(new Error(`Không đọc được kết quả Claude (exit ${code}): ${(err || out).slice(0, 300)}`));
      }
    });
    // Nội dung tài liệu gửi qua stdin (không giới hạn độ dài như tham số dòng lệnh).
    child.stdin.end(job.prompt);
  });
}

async function processQuizJob(job: QuizJob) {
  log(`📝 Nhận yêu cầu tạo đề #${job.id}: ${job.questionCount} câu — đang nhờ Claude viết đề...`);
  try {
    const output = (await runClaude(job)) as { questions?: unknown[] };
    const result = await api<{ quizId: string; accepted: number; received: number }>(`/api/worker/quiz-jobs/${job.id}/complete`, {
      questions: output.questions ?? [],
    });
    log(`✅ Yêu cầu #${job.id} xong -> đề #${result.quizId} (${result.accepted}/${result.received} câu hợp lệ)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`❌ Yêu cầu #${job.id} lỗi: ${message}`);
    await api(`/api/worker/quiz-jobs/${job.id}/fail`, { error: message }).catch(() => {});
  }
}

async function processImportJob(job: ImportJob) {
  log(`📥 Nhận yêu cầu nhập PowerPoint #${job.id}: "${job.fileName}" — ${job.parts.length} phần`);
  try {
    const outputs: unknown[] = [];
    for (const [i, part] of job.parts.entries()) {
      log(`   Phần ${i + 1}/${job.parts.length}: đang nhờ Claude dựng bài...`);
      // Một phần lỗi (Claude bận / mạng chập chờn) -> thử lại 1 lần trước khi bỏ cả yêu cầu.
      outputs.push(await runClaude(part).catch(() => runClaude(part)));
    }
    const result = await api<{ slug: string; blocks: number }>(`/api/worker/import-jobs/${job.id}/complete`, { outputs });
    log(`✅ Nhập PowerPoint #${job.id} xong -> bài nháp "${result.slug}" (${result.blocks} khối)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`❌ Nhập PowerPoint #${job.id} lỗi: ${message}`);
    await api(`/api/worker/import-jobs/${job.id}/fail`, { error: message }).catch(() => {});
  }
}

async function processTranslateJob(job: TranslateJob) {
  log(`🌐 Nhận việc dịch bài #${job.id} "${job.title}" (v${job.version}, ${job.sourceLang} -> ${[...new Set(job.parts.map((p) => p.lang))].join(', ')}, ${job.parts.length} phần)`);
  try {
    const results: { lang: string; output: unknown }[] = [];
    for (const [i, part] of job.parts.entries()) {
      log(`   Phần ${i + 1}/${job.parts.length} (${part.lang}): đang nhờ Claude dịch...`);
      results.push({ lang: part.lang, output: await runClaude(part).catch(() => runClaude(part)) });
    }
    const { missing } = await api<{ missing: number }>(`/api/worker/translate-jobs/${job.id}/complete`, { version: job.version, results });
    log(`✅ Dịch bài #${job.id} xong${missing ? ` (còn ${missing} mục Claude bỏ sót, sẽ dịch lại)` : ''}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`❌ Dịch bài #${job.id} lỗi: ${message}`);
    await api(`/api/worker/translate-jobs/${job.id}/fail`, { error: message }).catch(() => {});
  }
}

// Nhận việc đang chờ của một loại (tối đa `max` việc mỗi vòng). Mỗi loại một try riêng:
// web bản cũ chưa có tính năng nào thì các việc khác vẫn chạy bình thường.
async function drain<T>(name: string, claimPath: string, handle: (job: T) => Promise<void>, max = Infinity) {
  try {
    for (let done = 0; done < max; done++) {
      const { job } = await api<{ job: T | null }>(claimPath);
      if (!job) return;
      await handle(job);
    }
  } catch (err) {
    // Web tắt / mất mạng: báo rồi thử lại lần sau, không thoát.
    log(`⚠️ ${name}: không gọi được web: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Vòng lặp: nhận hết việc tạo đề + nhập PowerPoint (người đang chờ), rồi dịch tối đa
// TRANSLATE_PER_ROUND bài. Còn bài chờ dịch thì quay lại ngay (không ngủ), nhưng mỗi vòng
// đều hỏi lại tạo đề / PowerPoint trước -> đợt dịch bù hàng trăm bài cũ không làm ai phải chờ.
log(`🚀 quiz-worker chạy: web ${API_URL}, kiểm tra mỗi ${POLL_SECONDS}s, model ${CLAUDE_MODEL || '(mặc định của tài khoản)'}`);
for (;;) {
  await drain<QuizJob>('Tạo đề', '/api/worker/quiz-jobs/claim', processQuizJob);
  await drain<ImportJob>('Nhập PowerPoint', '/api/worker/import-jobs/claim', processImportJob);
  let translated = 0;
  await drain<TranslateJob>(
    'Dịch bài',
    '/api/worker/translate-jobs/claim',
    async (job) => {
      translated++;
      await processTranslateJob(job);
    },
    TRANSLATE_PER_ROUND,
  );
  if (translated < TRANSLATE_PER_ROUND) await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
}
