import { spawn } from 'child_process';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'edge-cdp-tier-debug-' + Date.now());

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendCdpCommand(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data.toString());
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {}
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const port = 9520 + Math.floor(Math.random() * 50);
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--disable-gpu',
    '--no-first-run',
    'about:blank',
  ]);

  let targetWsUrl = '';
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const data = await res.json();
        targetWsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(300);
  }

  const newTargetRes = await fetch(`http://127.0.0.1:${port}/json/new?http://localhost:3000/dashboard`, { method: 'PUT' });
  const targetInfo = await newTargetRes.json();
  const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  await sendCdpCommand(ws, 'Page.enable');
  await sleep(2500);

  const evalRes = await sendCdpCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const style = getComputedStyle(document.documentElement);
      const tokens = [
        '--tier-cold-bg',
        '--tier-cold-fg',
        '--tier-warm-bg',
        '--tier-warm-fg',
        '--tier-hot-bg',
        '--tier-hot-fg',
        '--tier-premium-bg',
        '--tier-premium-fg',
        '--sand-100',
        '--sand-700',
        '--clay-50',
        '--clay-700',
        '--warning-text',
        '--warning-icon',
      ];
      const result = {};
      tokens.forEach(t => {
        result[t] = style.getPropertyValue(t).trim();
      });
      return result;
    })()`,
    returnByValue: true,
  });

  console.log('BROWSER COMPUTED TOKENS:\n', JSON.stringify(evalRes.result?.value, null, 2));

  ws.close();
  edgeProc.kill();
}

main().catch(console.error);
