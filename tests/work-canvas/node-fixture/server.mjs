import { createServer } from 'node:http';

const host = process.env.HOST || '127.0.0.1';
const parsedPort = Number(process.env.PORT);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4318;

function renderPage(url) {
  const requestUrl = new URL(url, `http://${host}:${port}`);
  const revision = requestUrl.searchParams.get('revision');

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Node Canvas Fixture</title>
    <style>
      :root {
        --bg: #f4efe6;
        --surface: #fffaf2;
        --border: rgba(96, 114, 126, 0.16);
        --text: #23313b;
        --muted: #61707c;
        --teal: #1d736d;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: Inter, system-ui, sans-serif;
        background: linear-gradient(180deg, #f7f2e9 0%, var(--bg) 100%);
        color: var(--text);
      }

      main {
        min-height: 100vh;
        padding: 24px;
        display: grid;
        gap: 16px;
      }

      .panel {
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: 24px;
        background: var(--surface);
        box-shadow: 0 16px 32px rgba(35, 49, 59, 0.06);
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      h1, h2 {
        margin: 0;
        font-family: "Iowan Old Style", Georgia, serif;
      }

      p, li {
        color: var(--muted);
        line-height: 1.7;
      }

      .pill-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(29, 115, 109, 0.1);
        color: var(--teal);
        font-size: 13px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <p class="eyebrow">Node Canvas Fixture</p>
        <h1>Cross-Origin Work Canvas Demo</h1>
        <p>这个页面由独立 node 进程提供，用来模拟后端返回的真实 node/web 项目 URL。前端不需要手动打开新窗口，只需要把这个 URL 放进 iframe。</p>
        <div class="pill-row">
          <span class="pill">port ${port}</span>
          <span class="pill">iframe embeddable</span>
          <span class="pill">revision ${revision ?? 'none'}</span>
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Host Contract</p>
        <h2>前端只消费 URL，不接管 node 项目运行时</h2>
        <ul>
          <li>先启动 node fixture 服务</li>
          <li>再让前端把它作为 trusted URL work canvas 打开</li>
          <li>后续真实项目也只需要满足 iframe 可嵌入和 URL 可访问</li>
        </ul>
      </section>
    </main>
  </body>
</html>`;
}

const server = createServer((request, response) => {
  if (!request.url) {
    response.statusCode = 400;
    response.end('Missing request URL');
    return;
  }

  if (request.url.startsWith('/health')) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ ok: true, port }));
    return;
  }

  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(renderPage(request.url));
});

server.listen(port, host, () => {
  console.log(`Node canvas fixture listening on http://${host}:${port}`);
});
