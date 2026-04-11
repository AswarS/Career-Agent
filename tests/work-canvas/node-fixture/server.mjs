import { createServer } from 'node:http';

const host = process.env.HOST || '127.0.0.1';
const parsedPort = Number(process.env.PORT);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4318;

const scenarioCopyByKey = {
  'career-roadmap': {
    title: '门店运营职业路线图',
    body: '从咖啡师到值班主管，再到门店店长，按可观察能力拆成三个阶段。',
    next: ['稳定服务', '带班协作', '门店运营'],
  },
  'coding-assessment': {
    title: '博物馆票号整理器',
    body: '把连续票号合并成区间，模拟闭馆前整理检票记录的临时工具。',
    next: ['读取票号', '合并连续区间', '输出闭馆清单'],
  },
  'visual-learning': {
    title: '二次函数图像速览',
    body: '用抛物线、顶点和交点验证可视化学习页面形态。',
    next: ['观察开口方向', '标记顶点位置', '比较 x 轴交点'],
  },
  generic: {
    title: '备用职业路线',
    body: '用三阶段路线验证独立页面承载效果。',
    next: ['确认目标', '拆分阶段', '记录下一步'],
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderCodingAssessmentPage(displayRevision, displayScenario) {
  const starterCode = `function compactRanges(numbers) {
  // 整理票号，例如 [1, 2, 3, 5, 7, 8] -> "1-3,5,7-8"
  return "";
}`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ticket Desk Lab</title>
    <style>
      :root {
        --bg: #030712;
        --surface: #0b1220;
        --border: #334155;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --green: #22c55e;
        --amber: #facc15;
        --red: #f87171;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background:
          radial-gradient(circle at 15% 0%, rgba(56, 189, 248, 0.22), transparent 30%),
          radial-gradient(circle at 92% 20%, rgba(250, 204, 21, 0.14), transparent 26%),
          var(--bg);
        color: var(--text);
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      }

      main {
        min-height: 100vh;
        display: grid;
        gap: 14px;
        padding: 18px;
      }

      section,
      article {
        border: 1px solid var(--border);
        border-radius: 2px;
        background: rgba(11, 18, 32, 0.92);
        padding: 16px;
      }

      .layout {
        border: 0;
        padding: 0;
        background: transparent;
        display: grid;
        grid-template-columns: minmax(330px, 0.78fr) minmax(0, 1.22fr);
        gap: 14px;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      .layout > .stack:first-child {
        order: 2;
      }

      .layout > aside.stack {
        order: 1;
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h1,
      h2,
      p {
        margin-top: 0;
      }

      h1 {
        font-size: clamp(24px, 3vw, 34px);
        line-height: 1.16;
      }

      p,
      li {
        color: var(--muted);
        line-height: 1.65;
      }

      code {
        border-radius: 2px;
        background: #111827;
        color: var(--text);
        padding: 2px 5px;
      }

      textarea {
        width: 100%;
        min-height: 300px;
        border: 1px solid var(--border);
        border-radius: 2px;
        background: #101820;
        color: #e8f1f2;
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 14px;
        line-height: 1.55;
        padding: 14px;
      }

      button {
        border: 1px solid var(--border);
        border-radius: 2px;
        background: #111827;
        color: var(--text);
        cursor: pointer;
        font: inherit;
        font-weight: 750;
        padding: 10px 12px;
      }

      button.primary {
        border-color: var(--green);
        background: var(--green);
        color: #ffffff;
      }

      .actions,
      .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .pill {
        border-radius: 8px;
        background: rgba(34, 197, 94, 0.16);
        color: var(--green);
        font-size: 13px;
        font-weight: 800;
        padding: 7px 9px;
      }

      .test-list {
        display: grid;
        gap: 10px;
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
      }

      .test-list li {
        border: 1px solid var(--border);
        border-radius: 8px;
        margin: 0;
        padding: 10px;
      }

      .test-list li.pass {
        border-color: rgba(35, 122, 87, 0.65);
        color: var(--green);
      }

      .test-list li.fail {
        border-color: rgba(169, 75, 69, 0.65);
        color: var(--red);
      }

      .result {
        border-left: 3px solid var(--amber);
        margin: 12px 0 0;
        padding-left: 12px;
      }

      @media (max-width: 860px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <p class="eyebrow">Terminal Drill</p>
        <h1>博物馆票号整理器</h1>
        <p>把连续票号合并成区间，模拟闭馆前整理检票记录的临时工具。</p>
        <div class="pill-row">
          <span class="pill">scenario ${displayScenario}</span>
          <span class="pill">batch ${displayRevision}</span>
          <span class="pill">ticket desk</span>
        </div>
      </section>

      <section class="layout">
        <div class="stack">
          <article>
            <p class="eyebrow">票务说明</p>
            <h2>实现 <code>compactRanges(numbers)</code></h2>
            <p>输入是升序且不重复的票号。连续票号写成 <code>start-end</code>，单张票直接写数字。</p>
            <ul>
              <li><code>[1,2,3,5,7,8]</code> 输出 <code>1-3,5,7-8</code></li>
              <li><code>[]</code> 输出空字符串</li>
            </ul>
          </article>
          <article>
            <p class="eyebrow">检票脚本</p>
            <textarea id="codeEditor" spellcheck="false">${escapeHtml(starterCode)}</textarea>
            <div class="actions" style="margin-top: 12px">
              <button id="runTests" class="primary" type="button">运行样例测试</button>
              <button id="resetCode" type="button">重置代码</button>
              <button id="showHint" type="button">提示</button>
            </div>
          </article>
        </div>

        <aside class="stack">
          <article>
            <p class="eyebrow">测试结果</p>
            <h2 id="summary">尚未运行</h2>
            <ul id="testList" class="test-list"></ul>
            <p id="runnerNote" class="result">运行后会在这里显示每个样例的实际输出。</p>
          </article>
          <article>
            <p class="eyebrow">值班提示</p>
            <p id="hintText" class="result">点“提示”可以看票段处理建议。</p>
          </article>
        </aside>
      </section>
    </main>
    <script>
      const starterCode = ${JSON.stringify(starterCode)};
      const tests = [
        { input: [1, 2, 3, 5, 7, 8], expected: '1-3,5,7-8' },
        { input: [-2, -1, 0, 2, 4, 5], expected: '-2-0,2,4-5' },
        { input: [10], expected: '10' },
        { input: [], expected: '' }
      ];
      const editor = document.getElementById('codeEditor');
      const testList = document.getElementById('testList');
      const summary = document.getElementById('summary');
      const runnerNote = document.getElementById('runnerNote');
      const hintText = document.getElementById('hintText');

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;');
      }

      function renderInitialTests() {
        testList.innerHTML = tests.map((test) => '<li><code>' + JSON.stringify(test.input) + '</code> 期望 <code>' + test.expected + '</code></li>').join('');
      }

      function runTests() {
        testList.innerHTML = '';
        let compactRanges;

        try {
          compactRanges = new Function(editor.value + '; return compactRanges;')();
          if (typeof compactRanges !== 'function') {
            throw new Error('没有找到 compactRanges 函数。');
          }
        } catch (error) {
          summary.textContent = '代码无法执行';
          runnerNote.textContent = error.message || String(error);
          renderInitialTests();
          return;
        }

        let passed = 0;
        tests.forEach((test) => {
          const item = document.createElement('li');
          try {
            const actual = compactRanges([...test.input]);
            const ok = actual === test.expected;
            if (ok) passed += 1;
            item.className = ok ? 'pass' : 'fail';
            item.innerHTML = '<code>' + JSON.stringify(test.input) + '</code> -> <code>' + escapeHtml(actual) + '</code>，期望 <code>' + test.expected + '</code>';
          } catch (error) {
            item.className = 'fail';
            item.textContent = JSON.stringify(test.input) + ' 抛出错误：' + (error.message || String(error));
          }
          testList.appendChild(item);
        });

        summary.textContent = '通过 ' + passed + ' / ' + tests.length;
        runnerNote.textContent = passed === tests.length ? '样例全部通过。' : '还有样例未通过。先检查空数组、单元素和区间收尾。';
      }

      document.getElementById('runTests').addEventListener('click', runTests);
      document.getElementById('resetCode').addEventListener('click', () => {
        editor.value = starterCode;
        summary.textContent = '尚未运行';
        runnerNote.textContent = '代码已重置。';
        renderInitialTests();
      });
      document.getElementById('showHint').addEventListener('click', () => {
        hintText.textContent = '发现票号断开时写入 start 到上一张票，闭馆前别忘了写入最后一段。';
      });
      renderInitialTests();
    </script>
  </body>
</html>`;
}

function renderPage(url) {
  const requestUrl = new URL(url, `http://${host}:${port}`);
  const revision = requestUrl.searchParams.get('revision');
  const rawScenario = requestUrl.searchParams.get('scenario') ?? 'career-roadmap';
  const scenario = Object.prototype.hasOwnProperty.call(scenarioCopyByKey, rawScenario)
    ? rawScenario
    : 'generic';
  const scenarioCopy = scenarioCopyByKey[scenario];
  const displayRevision = escapeHtml(revision ?? 'none');
  const displayScenario = escapeHtml(scenario);
  const boardEyebrow = scenario === 'visual-learning' ? 'Visual Learning' : 'Career Route';
  const boardTag = scenario === 'visual-learning' ? 'visual board' : 'career route';
  const checklistTitle = scenario === 'visual-learning' ? '观察步骤' : '阶段步骤';
  const visualSketch =
    scenario === 'visual-learning'
      ? `
      <section class="panel">
        <p class="eyebrow">Sketch</p>
        <svg class="sketch" viewBox="0 0 560 360" role="img" aria-label="二次函数抛物线示意图">
          <line x1="40" y1="180" x2="520" y2="180" stroke="#94a3b8"></line>
          <line x1="280" y1="32" x2="280" y2="330" stroke="#94a3b8"></line>
          <path d="M72 42 C170 326 390 326 488 42"></path>
          <circle cx="280" cy="292" r="9" fill="#38bdf8"></circle>
          <circle cx="160" cy="180" r="8" fill="#facc15"></circle>
          <circle cx="400" cy="180" r="8" fill="#facc15"></circle>
        </svg>
      </section>`
      : '';

  if (scenario === 'coding-assessment') {
    return renderCodingAssessmentPage(displayRevision, displayScenario);
  }

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Career Route Fixture</title>
    <style>
      :root {
        --bg: #030712;
        --surface: #0b1220;
        --border: #334155;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --teal: #22c55e;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        background:
          radial-gradient(circle at 15% 0%, rgba(56, 189, 248, 0.22), transparent 30%),
          radial-gradient(circle at 92% 20%, rgba(250, 204, 21, 0.14), transparent 26%),
          var(--bg);
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
        border-radius: 2px;
        background: var(--surface);
        box-shadow: 10px 10px 0 rgba(34, 197, 94, 0.22);
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
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
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
        border-radius: 2px;
        background: rgba(29, 115, 109, 0.1);
        color: var(--teal);
        font-size: 13px;
        font-weight: 700;
      }

      .sketch {
        width: 100%;
        min-height: 320px;
        border: 1px solid var(--border);
        border-radius: 2px;
        background:
          linear-gradient(90deg, rgba(56, 189, 248, 0.12) 1px, transparent 1px),
          linear-gradient(0deg, rgba(56, 189, 248, 0.12) 1px, transparent 1px),
          rgba(15, 23, 42, 0.92);
        background-size: 28px 28px;
      }

      .sketch path {
        fill: none;
        stroke: #facc15;
        stroke-width: 5;
        stroke-linecap: round;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <p class="eyebrow">${boardEyebrow}</p>
        <h1>${scenarioCopy.title}</h1>
        <p>${scenarioCopy.body}</p>
        <div class="pill-row">
          <span class="pill">gate ${port}</span>
          <span class="pill">scenario ${displayScenario}</span>
          <span class="pill">${boardTag}</span>
          <span class="pill">route ${displayRevision}</span>
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Checklist</p>
        <h2>${checklistTitle}</h2>
        <ul>
          ${scenarioCopy.next.map((item) => `<li>${item}</li>`).join('')}
        </ul>
      </section>
      ${visualSketch}
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
