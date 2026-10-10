// ============================================================
// lib/http.ts — Nơi DUY NHẤT gọi fetch / XMLHttpRequest
// ============================================================
// Quy tắc của dự án: component KHÔNG gọi fetch. Luồng luôn là
//   component -> hook (queries.ts) -> api.ts của từng tính năng -> http.ts
// Nhờ vậy cách gửi cookie, cách đọc lỗi { message } chỉ viết một lần.
// 🔸 Flutter: giống một instance Dio dùng chung có sẵn interceptor.

// Lỗi từ API, mang theo mã HTTP để UI phân biệt (404 thì hiện "không tìm thấy"...).
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response): Promise<ApiError> {
  const data: unknown = await res.json().catch(() => null);
  const message =
    data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : res.statusText || 'Lỗi không xác định';
  return new ApiError(res.status, message);
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await readError(res);
  // 204 No Content: không có body để đọc.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  delete: (url: string) => request<void>('DELETE', url),
};

// Upload file kèm % tiến độ. fetch() chưa báo được tiến độ UPLOAD, nên
// chỗ này dùng XMLHttpRequest — cần thiết khi tải video vài trăm MB.
export function uploadFile<T>(url: string, file: File, onProgress?: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${url}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // body rỗng hoặc không phải JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        const message =
          data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
            ? data.message
            : `Upload lỗi (${xhr.status})`;
        reject(new ApiError(xhr.status, message));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Mất kết nối tới máy chủ'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

// Gắn object thành query string, bỏ qua giá trị rỗng: { q: 'a', c: '' } -> "?q=a"
export function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
