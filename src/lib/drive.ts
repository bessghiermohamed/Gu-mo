"use client";

/**
 * Google Drive connector — سحابتي (round 31).
 *
 * WHY: Supabase's free tier is small, and student files (PDFs, images) are
 * bulky. Instead of burning app storage, every student connects their OWN
 * Google Drive (15 GB free) — files upload straight from the browser to
 * the student's Drive, never touching our servers or database.
 *
 * PRIVACY MODEL: scope is `drive.file` — the app can only see/create the
 * files it created itself. It cannot read the student's existing Drive.
 * The access token lives in localStorage with its expiry and is never
 * sent anywhere except googleapis.com directly from the browser.
 *
 * CONFIG: needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth Web client). Without
 * it, the UI shows a self-service setup guide — the app stays usable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  webViewLink: string | null;
  createdTime: string;
}

export interface DriveQuota {
  usage: number; // bytes used in Drive
  limit: number | null; // null = unlimited (Workspace)
}

/** Setup info so the UI can render a precise guide when config is missing. */
export function getGoogleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return id && id.trim() ? id.trim() : null;
}

export class DriveError extends Error {
  kind: "needs-consent" | "auth" | "network" | "http" | "popup";
  status?: number;
  constructor(kind: DriveError["kind"], message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Token management (GIS implicit flow — no refresh token exists client-side;
// silent re-auth works while the Google session lives, else the user taps
// reconnect once — same pattern Google recommends for browser-only apps).
// ---------------------------------------------------------------------------

const TOKEN_KEY = "talib-drive-token";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

function loadToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    // 60s safety margin
    return t.accessToken && t.expiresAt > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

function saveToken(accessToken: string, expiresInSec: number) {
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ accessToken, expiresAt: Date.now() + expiresInSec * 1000 })
  );
}

export function clearDriveToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isDriveConnected(): boolean {
  return loadToken() !== null;
}

interface GsiTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface GsiTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (res: GsiTokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => GsiTokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`
    );
    const onReady = () =>
      window.google?.accounts?.oauth2 ? resolve() : reject(new Error("gsi-missing"));
    if (existing) {
      existing.addEventListener("load", onReady);
      existing.addEventListener("error", () => reject(new Error("gsi-failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = onReady;
    s.onerror = () => reject(new Error("gsi-failed"));
    document.head.appendChild(s);
  });
}

/**
 * Get a valid access token. `interactive` controls whether a popup is
 * allowed: list flows try silent first (prompt: ""), the connect /
 * reconnect buttons are interactive.
 */
export async function ensureDriveToken(interactive: boolean): Promise<string> {
  const cached = loadToken();
  if (cached) return cached.accessToken;

  const clientId = getGoogleClientId();
  if (!clientId) throw new DriveError("auth", "missing-client-id");

  await loadGsi();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let client: GsiTokenClient;
    try {
      client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (res) => {
          if (settled) return;
          settled = true;
          if (res.access_token && res.expires_in) {
            saveToken(res.access_token, res.expires_in);
            resolve(res.access_token);
          } else {
            reject(
              new DriveError(
                res.error === "access_denied" ? "needs-consent" : "auth",
                res.error ?? "no-token"
              )
            );
          }
        },
        error_callback: (err) => {
          if (settled) return;
          settled = true;
          reject(
            new DriveError(
              err.type === "popup_closed" || err.type === "popup_failed"
                ? "popup"
                : "auth",
              err.type ?? "gsi-error"
            )
          );
        },
      });
    } catch {
      reject(new DriveError("auth", "init-failed"));
      return;
    }

    // silent attempt only when non-interactive; popup windows must come
    // from a real user gesture so this whole call is sync-ish
    client.requestAccessToken({ prompt: interactive ? "consent" : "" });

    // popup may never open (blocked) — settle after 90s worst case
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new DriveError("popup", "timeout"));
      }
    }, 90_000);
  });
}

export function disconnectDrive() {
  const cached = loadToken();
  if (cached) {
    try {
      window.google?.accounts.oauth2.revoke(cached.accessToken);
    } catch {
      /* token already dead — ignore */
    }
  }
  clearDriveToken();
}

// ---------------------------------------------------------------------------
// Drive API calls
// ---------------------------------------------------------------------------

const FOLDER_NAME = "طالب — Talib";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function driveFetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new DriveError("network", "network-error");
  }
  if (res.status === 401) {
    clearDriveToken();
    throw new DriveError("needs-consent", "token-expired", 401);
  }
  return res;
}

/** Find-or-create the app folder. Tagged with appProperties so we can
 *  re-find it even if the student renames it. */
export async function findOrCreateDriveFolder(token: string): Promise<string> {
  const q =
    `name='${FOLDER_NAME.replace(/'/g, "\\'")}' and ` +
    `mimeType='${FOLDER_MIME}' and trashed=false`;
  const search = await driveFetch(
    token,
    `drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`
  );
  if (search.ok) {
    const data = await search.json();
    if (data.files?.length) return data.files[0].id as string;
  }

  const create = await driveFetch(token, "drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: FOLDER_MIME,
      appProperties: { app: "talib" },
    }),
  });
  if (!create.ok) {
    throw new DriveError("http", `folder-create-${create.status}`, create.status);
  }
  const folder = await create.json();
  return folder.id as string;
}

/** Multipart upload with progress (XHR — fetch has no upload progress).
 *  The multipart body must be a single Blob: metadata JSON + file bytes. */
export function uploadToDrive(
  token: string,
  folderId: string,
  file: File,
  onProgress?: (pct: number) => void,
  sourceTag: string = "talib-web"
): Promise<DriveFileMeta> {
  return new Promise((resolve, reject) => {
    const metadata = {
      name: file.name,
      parents: [folderId],
      appProperties: { app: "talib", source: sourceTag },
    };
    const boundary = "talib-drv-" + Math.random().toString(36).slice(2);
    const pre =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;
    const post = `\r\n--${boundary}--`;
    const body = new Blob([pre, file, post]);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,createdTime"
    );
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader(
      "Content-Type",
      `multipart/related; boundary=${boundary}`
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status === 401) {
        clearDriveToken();
        reject(new DriveError("needs-consent", "token-expired", 401));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as DriveFileMeta);
        } catch {
          reject(new DriveError("http", "bad-response", xhr.status));
        }
      } else {
        reject(new DriveError("http", `upload-${xhr.status}`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new DriveError("network", "network-error"));
    xhr.send(body);
  });
}

export async function listDriveFiles(
  token: string,
  folderId: string
): Promise<DriveFileMeta[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  const res = await driveFetch(
    token,
    `drive/v3/files?q=${encodeURIComponent(q)}` +
      `&orderBy=createdTime desc&pageSize=100` +
      `&fields=files(id,name,mimeType,size,webViewLink,createdTime)`
  );
  if (!res.ok) {
    throw new DriveError("http", `list-${res.status}`, res.status);
  }
  const data = await res.json();
  return (data.files ?? []) as DriveFileMeta[];
}

export async function downloadDriveFile(
  token: string,
  file: DriveFileMeta
): Promise<void> {
  const res = await driveFetch(
    token,
    `drive/v3/files/${file.id}?alt=media`
  );
  if (!res.ok) {
    throw new DriveError("http", `download-${res.status}`, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Anyone-with-link sharing (reader). Returns the webViewLink. */
export async function shareDriveFile(
  token: string,
  fileId: string
): Promise<string> {
  const perm = await driveFetch(
    token,
    `drive/v3/files/${fileId}/permissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }
  );
  if (!perm.ok && perm.status !== 409) {
    throw new DriveError("http", `share-${perm.status}`, perm.status);
  }
  const meta = await driveFetch(
    token,
    `drive/v3/files/${fileId}?fields=webViewLink`
  );
  if (!meta.ok) {
    throw new DriveError("http", `share-meta-${meta.status}`, meta.status);
  }
  const data = await meta.json();
  return data.webViewLink as string;
}

// ---------------------------------------------------------------------------
// Library publishing (round 32) — نشر إلى المكتبة
//
// An administrator publishes a lecture file from THEIR OWN 15 GB Drive into
// the shared المكتبة: the bytes live in the admin's Drive (a «مكتبة طالب»
// subfolder of the app folder), the file becomes anyone-with-link, and only
// a small metadata row goes to the database — Supabase stores zero bytes.
// ---------------------------------------------------------------------------

const LIBRARY_FOLDER_NAME = "📚 مكتبة طالب";

/** Find-or-create the library subfolder inside the app folder. */
export async function findOrCreateLibraryFolder(
  token: string,
  appFolderId: string
): Promise<string> {
  const q =
    `name='${LIBRARY_FOLDER_NAME.replace(/'/g, "\\'")}' and ` +
    `'${appFolderId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  const search = await driveFetch(
    token,
    `drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`
  );
  if (search.ok) {
    const data = await search.json();
    if (data.files?.length) return data.files[0].id as string;
  }
  const create = await driveFetch(token, "drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: LIBRARY_FOLDER_NAME,
      mimeType: FOLDER_MIME,
      parents: [appFolderId],
      appProperties: { app: "talib", source: "talib-library" },
    }),
  });
  if (!create.ok) {
    throw new DriveError("http", `libfolder-create-${create.status}`, create.status);
  }
  const folder = await create.json();
  return folder.id as string;
}

export interface DriveShareLinks {
  webViewLink: string;
  webContentLink: string; // direct download URL — works for any student
}

/** Fetch (or construct) the public links after anyone-with-link sharing. */
export async function getDriveShareLinks(
  token: string,
  fileId: string
): Promise<DriveShareLinks> {
  const meta = await driveFetch(
    token,
    `drive/v3/files/${fileId}?fields=webViewLink,webContentLink`
  );
  if (!meta.ok) {
    throw new DriveError("http", `links-${meta.status}`, meta.status);
  }
  const data = await meta.json();
  return {
    webViewLink: (data.webViewLink as string) ?? `https://drive.google.com/file/d/${fileId}/view`,
    // Drive omits webContentLink for some types — this construction is the
    // canonical direct-download form and always works once the file is public.
    webContentLink: (data.webContentLink as string) ??
      `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}

export async function deleteDriveFile(token: string, fileId: string) {
  const res = await driveFetch(token, `drive/v3/files/${fileId}`, {
    method: "DELETE",
  });
  // 204 = deleted, 404 = already gone — both fine
  if (!res.ok && res.status !== 404 && res.status !== 204) {
    throw new DriveError("http", `delete-${res.status}`, res.status);
  }
}

export async function getDriveQuota(token: string): Promise<DriveQuota> {
  const res = await driveFetch(
    token,
    "drive/v3/about?fields=storageQuota"
  );
  if (!res.ok) {
    throw new DriveError("http", `quota-${res.status}`, res.status);
  }
  const data = await res.json();
  const q = data.storageQuota ?? {};
  return {
    usage: Number(q.usageInDrive ?? q.usage ?? 0),
    limit: q.limit ? Number(q.limit) : null,
  };
}
