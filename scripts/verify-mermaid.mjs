import fs from 'fs';
import vm from 'vm';

async function testAllDiagrams() {
  const res = await fetch('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js');
  const code = await res.text();
  class Element {}
  class Node { static DOCUMENT_NODE = 9; }
  const doc = {
    nodeType: 9,
    createElement: () => ({ setAttribute: () => {}, getBoundingClientRect: () => ({ width: 0, height: 0 }), style: {} }),
    getElementById: () => null,
    getElementsByTagName: () => [],
    body: { appendChild: () => {} },
    documentElement: { style: {} },
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const win = {
    console,
    Element,
    Node,
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
    document: doc,
    navigator: { userAgent: 'node' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    structuredClone,
    location: { href: 'http://localhost' },
    performance: { now: () => Date.now() },
    DOMParser: class { parseFromString() { return { documentElement: { querySelector: () => null } }; } }
  };
  win.window = win;
  win.self = win;
  win.global = win;
  vm.runInNewContext(code, win);
  win.mermaid.initialize({ startOnLoad: false });

  const content = fs.readFileSync('docs/research/leads4dev-notebooklm-ux-context.md', 'utf8');
  const matches = [...content.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)];
  console.log(`Total mermaid code blocks found in dossier: ${matches.length}`);

  const results = [];
  for (let i = 0; i < matches.length; i++) {
    const diagramCode = matches[i][1].trim();
    const type = diagramCode.split(/\s+/)[0];
    let status = 'PASSED';
    let error = null;
    try {
      const res = await win.mermaid.parse(diagramCode);
      if (res === false) {
        status = 'FAILED';
        error = 'parse returned false';
      }
    } catch (err) {
      status = 'FAILED';
      error = err.message || String(err);
    }
    console.log(`Diagram ${i + 1} (${type}): ${status}`);
    if (error) {
      console.error(`   Error: ${error}`);
    }
    results.push({ diagramIndex: i + 1, type, status, error });
  }

  const allPassed = results.every(d => d.status === 'PASSED');
  console.log(`\nFinal Mermaid Validation Status: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
  return { allPassed, results };
}

testAllDiagrams().then(({ allPassed }) => {
  if (!allPassed) process.exit(1);
  process.exit(0);
}).catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
