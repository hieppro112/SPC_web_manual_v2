// ============================================================
// services/ai/llm.ts — Nói chuyện với phần mềm AI chạy local
// ============================================================
// Chỉ file này gọi HTTP sang AI. Hỗ trợ 2 kiểu API (chọn bằng AI_API trong .env):
//
//   'openai' (mặc định) — chuẩn OpenAI: LM Studio, Ollama (/v1), vLLM...
//       POST /v1/embeddings          đổi đoạn chữ thành vector
//       POST /v1/chat/completions    hỏi đáp, stream dạng SSE ("data: {...}")
//   'ollama' — API riêng của Ollama: đặt được độ dài ngữ cảnh từng câu hỏi
//       và tắt "suy nghĩ" của Qwen3 (think:false).
//       POST /api/embed, POST /api/chat (stream, mỗi dòng một JSON)
//
// Ngoài file này, cả app không biết đang dùng LM Studio hay Ollama.

import { config } from '../../config.ts';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class AiUnavailableError extends Error {}

// baseUrl: địa chỉ phần mềm AI. Model trả lời và model embedding có thể ở 2 chỗ khác nhau.
async function post(path: string, body: unknown, signal?: AbortSignal, baseUrl = config.ai.baseUrl): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // LM Studio bật "yêu cầu xác thực" thì cần khóa; không bật thì bỏ qua.
        ...(config.ai.apiKey ? { Authorization: `Bearer ${config.ai.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new AiUnavailableError(`Không kết nối được AI tại ${baseUrl}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Lỗi dạng { "error": "..." } (Ollama) hoặc { "error": { "message": "..." } } (OpenAI/LM Studio)
    let message = text;
    try {
      const data = JSON.parse(text) as { error?: string | { message?: string } };
      message = (typeof data.error === 'string' ? data.error : data.error?.message) ?? text;
    } catch {
      // không phải JSON
    }
    throw new AiUnavailableError(`AI lỗi ${res.status}: ${message.slice(0, 300)}`);
  }
  return res;
}

// Đọc body stream thành từng dòng chữ.
async function* lines(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new AiUnavailableError('AI không trả dữ liệu');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const line of parts) if (line.trim()) yield line.trim();
  }
  if (buffer.trim()) yield buffer.trim();
}

// ---------- Embedding ----------

// Đổi nhiều đoạn chữ thành vector. Chia lô 16 đoạn để không gửi request quá lớn.
export async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const input = texts.slice(i, i + 16);
    if (config.ai.embedApi === 'ollama') {
      const res = await post('/api/embed', { model: config.ai.embedModel, input, truncate: true }, undefined, config.ai.embedBaseUrl);
      out.push(...((await res.json()) as { embeddings: number[][] }).embeddings);
    } else {
      const res = await post('/v1/embeddings', { model: config.ai.embedModel, input }, undefined, config.ai.embedBaseUrl);
      const data = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      out.push(...data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
  }
  return out;
}

// ---------- Hỏi đáp (stream) ----------

// Mỗi kiểu API gói chữ trong JSON khác nhau -> hàm này chỉ lấy ra mẩu chữ.
async function* rawChatStream(messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<string> {
  if (config.ai.api === 'ollama') {
    const res = await post(
      '/api/chat',
      {
        model: config.ai.chatModel,
        messages,
        stream: true,
        think: false,
        keep_alive: '30m', // giữ model trong GPU 30 phút -> câu sau không phải nạp lại
        options: { num_ctx: config.ai.numCtx, temperature: 0.2 },
      },
      signal,
    );
    for await (const line of lines(res)) {
      const data = JSON.parse(line) as { message?: { content?: string }; error?: string };
      if (data.error) throw new AiUnavailableError(`AI lỗi: ${data.error}`);
      if (data.message?.content) yield data.message.content;
    }
    return;
  }

  // Chuẩn OpenAI: Server-Sent Events, mỗi dòng "data: {json}", kết thúc bằng "data: [DONE]".
  // Độ dài ngữ cảnh do LM Studio quyết định lúc nạp model (không gửi được ở đây).
  const res = await post('/v1/chat/completions', { model: config.ai.chatModel, messages, stream: true, temperature: 0.2 }, signal);
  for await (const line of lines(res)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return;
    const data = JSON.parse(payload) as { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string } };
    if (data.error) throw new AiUnavailableError(`AI lỗi: ${data.error.message ?? 'không rõ'}`);
    // delta.reasoning_content (phần "suy nghĩ" LM Studio tách riêng) -> bỏ qua.
    const piece = data.choices?.[0]?.delta?.content;
    if (piece) yield piece;
  }
}

// Hỏi đáp dạng stream: `yield` từng mẩu chữ ngay khi model sinh ra.
// 🔸 Dart: giống hàm `async*` trả về Stream<String>.
// Model nào vẫn in phần suy nghĩ lẫn trong câu trả lời (<think>...</think>) thì lọc bỏ.
export async function* chatStream(messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<string> {
  let inThink = false;
  let started = false;
  for await (let piece of rawChatStream(messages, signal)) {
    if (!inThink && piece.includes('<think>')) {
      const before = piece.slice(0, piece.indexOf('<think>'));
      if (before.trim()) yield before;
      inThink = true;
      piece = piece.slice(piece.indexOf('<think>'));
    }
    if (inThink) {
      const end = piece.indexOf('</think>');
      if (end < 0) continue;
      inThink = false;
      piece = piece.slice(end + '</think>'.length);
    }
    // Bỏ dòng trống đầu câu trả lời (thường còn sót sau </think>).
    if (!started) piece = piece.replace(/^\s+/, '');
    if (piece) {
      started = true;
      yield piece;
    }
  }
}
