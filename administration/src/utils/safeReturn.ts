export function safeReturn(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value) || value.startsWith('/login')) return '/dashboard';
  return value;
}
