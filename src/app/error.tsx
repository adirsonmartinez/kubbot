"use client";

// The last safety net: if a screen throws while rendering (a broken answer, a corrupt file), the person sees
// this instead of a white page, and a reload starts clean. The texts live in views/copy.

import { errorCopy } from "@/views/copy/errorPage";

export default function ErrorPage() {
  return (
    <main className="error-page" role="alert" style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 24, textAlign: "center" }}>
      <div>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>{errorCopy.title}</h1>
        <p style={{ margin: "0 0 16px", opacity: 0.8 }}>{errorCopy.body}</p>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: 999, cursor: "pointer" }}>
          {errorCopy.reload}
        </button>
      </div>
    </main>
  );
}
