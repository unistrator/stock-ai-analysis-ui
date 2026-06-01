const TOKEN_KEY = "ph_api_token";

export function getToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  return token?.trim() || null;
}

export function setToken(token: string) {
  const trimmed = token.trim();
  if (trimmed) {
    localStorage.setItem(TOKEN_KEY, trimmed);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function requireToken(): string {
  const token = getToken();
  if (!token) throw new Error("NO_TOKEN");
  return token;
}

/** 构建带 Bearer Token 的请求头 */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...extra,
    Authorization: `Bearer ${requireToken()}`,
  };
}

/** 从 URL 提取 token 并写入 localStorage，随后从地址栏移除 */
export function extractTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    setToken(token);
    params.delete("token");
    const clean = params.toString();
    const newUrl = window.location.pathname + (clean ? `?${clean}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
    return getToken();
  }
  return getToken();
}

/** 校验 URL 或 localStorage 中是否存在 token（不校验是否正确） */
export function checkAuth(): boolean {
  return !!extractTokenFromUrl();
}
