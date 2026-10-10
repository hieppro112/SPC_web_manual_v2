// Ngôn ngữ cho khối code. `value` là tên ngôn ngữ của Prism (thư viện tô
// màu). Ngôn ngữ Prism không có sẵn (vd bash, sql) vẫn hiện đúng chữ, chỉ
// không tô màu.
export const CODE_LANGUAGES = [
  { value: '', label: '' }, // '' = văn bản thường, nhãn lấy từ i18n
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'markup', label: 'HTML / XML' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'cpp', label: 'C / C++' },
  { value: 'markdown', label: 'Markdown' },
];
