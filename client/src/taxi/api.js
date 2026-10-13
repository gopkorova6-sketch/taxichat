// Thin fetch layer for the TaxiChat API; cookies carry the JWT session
const request = async (url, options = {}) => {
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message ?? "Ошибка запроса");
  }
  return data;
};

export const apiGet = (url) => request(url);
export const apiPost = (url, body = {}) => request(url, { method: "POST", body });
export const apiPatch = (url, body = {}) => request(url, { method: "PATCH", body });
export const apiDelete = (url) => request(url, { method: "DELETE" });
