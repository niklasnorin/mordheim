import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownParagraphs, markdownText, renderMarkdown } from './markdown.ts';

test('Markdown renders emphasis, headings, links, lists, quotes and code', () => {
  const source = '# The bridge\n\n**Hold** the *gate*: [the map](/locations/mordheim/).\n\n- First\n- Second\n  - Below\n\n1. Watch\n2. Wait\n\n> Nobody slept.\n\n`D6`\n\n```text\n    1\n\n    2\n```';
  const html = renderMarkdown(source);
  for (const fragment of ['<h1>The bridge</h1>', '<strong>Hold</strong>', '<em>gate</em>', '<a href="/locations/mordheim/">the map</a>', '<ul>', '<ol>', '<blockquote>', '<code>D6</code>', '<pre><code class="language-text">    1\n\n    2\n</code></pre>']) {
    assert.ok(html.includes(fragment), fragment);
  }
  assert.match(renderMarkdown('A line  \nAnother line'), /A line<br \/>\nAnother line/);
});

test('ordinary prose keeps its paragraphs and characters', () => {
  assert.equal(renderMarkdown('The kin came south.\nNobody counted.\n\nThe gate was shut.'), '<p>The kin came south.\nNobody counted.</p>\n<p>The gate was shut.</p>');
  assert.equal(renderMarkdown('Agnar’s <cloak> & shield.'), '<p>Agnar’s &lt;cloak&gt; &amp; shield.</p>');
  assert.equal(renderMarkdown(' \n '), '');
});

test('authored HTML cannot inject markup into a page or preview', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<svg onload=alert(1)></svg>\n\n</div><iframe srcdoc="<script>alert(1)</script>"></iframe>');
  assert.doesNotMatch(html, /<(?:script|img|svg|iframe|\/div)\b/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  assert.match(renderMarkdown('[a](https://example.com "x\\" onmouseover=\\"alert(1)")'), /&quot;/);
});

test('links and images reject executable protocols, including encoded schemes', () => {
  for (const url of ['javascript:alert%281%29', 'JaVaScRiPt:alert%281%29', 'javascript&#x3a;alert%281%29', 'vbscript:msgbox%281%29', 'data:text/html;base64,PHNjcmlwdD4=']) {
    const html = renderMarkdown(`[open](${url})\n\n![picture](${url})`);
    assert.doesNotMatch(html, /(?:href|src)="(?:javascript|vbscript|data):/i);
    assert.match(html, /href=""/);
    assert.match(html, /src=""/);
  }
  assert.match(renderMarkdown('[safe](https://example.com)\n\n[mail](mailto:watch@example.com)'), /href="https:\/\/example.com"/);
});

test('card excerpts and metadata use plain text without nested links or Markdown markers', () => {
  const source = '# The **bridge**\n\nA [map](/locations/), *a bell* &amp; `D6`.\n\n- First\n- Second\n\n![The ferry](/images/ferry)\n\n[unused]: https://example.com';
  assert.equal(markdownText(source), 'The bridge A map, a bell & D6. First Second The ferry');
  assert.equal(markdownText('**The bridge**', 6), 'The br…');
  assert.equal(markdownText('**The bridge**', 10), 'The bridge');
  assert.equal(markdownText('A  \nB'), 'A B');
  assert.equal(markdownText(''), '');
});

test('battle array conversion round-trips Markdown whitespace, even inside fenced code', () => {
  const source = '    Indented code\n\n# The bridge\n\n- One\n  - Two\n\n> Watch\n>\n> Wait\n\n```text\n    1\n\n\n\n    2\n```\n\nA line  \nAnother line\n';
  const parts = markdownParagraphs(source);
  assert.equal(parts.join('\n\n'), source);
  assert.equal(renderMarkdown(parts.join('\n\n')), renderMarkdown(source));
  assert.equal(markdownParagraphs(source.replace(/\n/g, '\r\n')).join('\n\n'), source);
  assert.deepEqual(markdownParagraphs(' \n\n '), []);
});
