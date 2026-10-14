import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatAnswer } from '../src/components/ChatAnswer.tsx';

test('answers render safe source links and preserve fenced code and blank lines', () => {
  const html=renderToStaticMarkup(createElement(ChatAnswer,{text:'Read [the source](https://example.com/research).\n\n```python\n# A code comment\nx = "<script>"\n\nprint(x)\n```\n\n## Next step\nExplain the output.'}));
  assert.match(html,/href="https:\/\/example.com\/research"/);
  assert.match(html,/# A code comment\nx = &quot;&lt;script&gt;&quot;\n\nprint\(x\)/);
  assert.match(html,/<h3>Next step<\/h3>/);
  assert.doesNotMatch(html,/<script>/);
  const unsafe=renderToStaticMarkup(createElement(ChatAnswer,{text:'[bad](javascript:alert(1))'}));
  assert.doesNotMatch(unsafe,/href=/);
});
