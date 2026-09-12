export function storefrontTryOnErrorMarkup(message: string): string {
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SelfX Try-On unavailable</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #07172d;
        background: #f4f8f8;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          linear-gradient(135deg, rgba(255, 106, 0, 0.08), transparent 38%),
          #f4f8f8;
      }

      main {
        width: min(100%, 520px);
        border: 1px solid #c7d6dc;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 24px 80px rgba(18, 38, 45, 0.14);
        overflow: hidden;
      }

      .header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 24px 24px 18px;
        border-bottom: 1px solid #d8e3e8;
      }

      .mark {
        width: 48px;
        height: 48px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        background: #ff6a00;
        color: white;
        font-size: 15px;
        font-weight: 900;
      }

      .brand {
        margin: 0;
        font-size: 16px;
        font-weight: 800;
        line-height: 1.2;
      }

      .subbrand {
        margin: 3px 0 0;
        color: #4b6470;
        font-size: 14px;
      }

      .content {
        padding: 28px 24px 24px;
      }

      h1 {
        margin: 0;
        font-size: clamp(28px, 6vw, 38px);
        line-height: 1.05;
        letter-spacing: 0;
      }

      p {
        margin: 12px 0 0;
        color: #35515c;
        font-size: 16px;
        line-height: 1.6;
      }

      .notice {
        margin-top: 22px;
        border: 1px solid #d8e3e8;
        border-radius: 12px;
        background: #edf5f5;
        padding: 14px 16px;
        color: #284852;
        font-size: 14px;
        line-height: 1.5;
      }

      button {
        width: 100%;
        margin-top: 24px;
        border: 0;
        border-radius: 12px;
        padding: 14px 18px;
        background: #ff6a00;
        color: white;
        font: inherit;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
      }

      button:hover {
        background: #e85f00;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="header">
        <div class="mark" aria-hidden="true">SX</div>
        <div>
          <p class="brand">SelfX</p>
          <p class="subbrand">Virtual Try-On</p>
        </div>
      </div>
      <div class="content">
        <h1>Try-On unavailable</h1>
        <p>${safeMessage}</p>
        <div class="notice">
          You can return to the product page and try again. If this keeps happening, the store may still be finishing setup.
        </div>
        <button type="button" onclick="history.length > 1 ? history.back() : window.close()">
          Return to product
        </button>
      </div>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
