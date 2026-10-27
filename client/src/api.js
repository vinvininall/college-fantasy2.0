export async function api(path, { body, method = "GET" } = {}) {
  const token = localStorage.getItem("sfl-token");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL || ""}/api${path}`,
    {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Server response unavailable. Check the API connection.");
  }
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("sfl-token");
      window.dispatchEvent(new Event("sfl-session-expired"));
    }
    throw new Error(payload.error?.message || "Request failed");
  }
  return payload.data;
}
export const rupees = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
export const date = (n) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(n));
