import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'edge-cdp-ds-sections-' + Date.now());
const OUTPUT_DIR = path.join(process.cwd(), 'screenshots');

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendCdpCommand(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP command ${method} timed out after 15000ms`));
    }, 15000);
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data.toString());
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {
        // ignore
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const port = 9450 + Math.floor(Math.random() * 50);
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

  const newTargetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const targetInfo = await newTargetRes.json();
  const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  await sendCdpCommand(ws, 'Page.enable');
  await sendCdpCommand(ws, 'Network.enable');

  await sendCdpCommand(ws, 'Network.setCookie', {
    name: 'lf_locale',
    value: 'ar',
    domain: 'localhost',
    path: '/',
  });

  await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });

  await sendCdpCommand(ws, 'Page.navigate', { url: 'http://localhost:3000/design-system' });
  await sleep(4000);

  // Capture specific section bounding boxes:
  const sections = [
    { name: 'ds_section_chiplist', selector: 'text/قوائم الرقاقات المتقدمة (ChipList' },
    { name: 'ds_section_barlist', selector: 'text/مخطط معدلات التحويل والمؤشرات البيانية (BarList' },
    { name: 'ds_section_matchrow', selector: 'text/صفوف الفرص المتطابقة (MatchRow' },
    { name: 'ds_section_stattile', selector: 'text/مربعات الإحصائيات الحيوية (StatTile' },
  ];

  for (const sec of sections) {
    const box = await sendCdpCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const h3 = Array.from(document.querySelectorAll('h3')).find(el => el.textContent.includes('${sec.selector.replace('text/', '')}'));
        if (!h3) return null;
        const container = h3.closest('.rounded-xl');
        if (!container) return null;
        container.scrollIntoView({ block: 'center' });
        const r = container.getBoundingClientRect();
        return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height };
      })()`,
      returnByValue: true,
    });

    if (box.result?.value) {
      const b = box.result.value;
      const shot = await sendCdpCommand(ws, 'Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, b.x),
          y: Math.max(0, b.y),
          width: Math.ceil(b.width),
          height: Math.ceil(b.height),
          scale: 1,
        },
        captureBeyondViewport: true,
      });
      const filePath = path.join(OUTPUT_DIR, `${sec.name}.png`);
      fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
      console.log(`Saved section screenshot: ${sec.name}.png`);
    } else {
      console.warn(`Could not find section: ${sec.name}`);
    }
  }

  ws.close();
  edgeProc.kill();
  console.log('Done capturing section snapshots.');
}

main().catch(console.error);
