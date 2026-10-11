import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'edge-cdp-hero-' + Date.now());
const OUTPUT_DIR = path.join(process.cwd(), 'screenshots');

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendCdpCommand(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP command ${method} timed out after 45000ms`));
    }, 45000);

    const handler = (event: MessageEvent) => {
      try {
        let raw = '';
        if (typeof event.data === 'string') {
          raw = event.data;
        } else if (Buffer.isBuffer(event.data)) {
          raw = event.data.toString('utf8');
        } else if (event.data instanceof ArrayBuffer) {
          raw = Buffer.from(event.data).toString('utf8');
        } else {
          raw = Buffer.from(event.data as any).toString('utf8');
        }
        const msg = JSON.parse(raw);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // ignore
      }
    };

    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const port = 9231;
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
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
    } catch {
      // retry
    }
    await sleep(300);
  }

  if (!targetWsUrl) {
    edgeProc.kill();
    throw new Error('Failed to connect to Edge CDP');
  }

  const newTargetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const targetInfo = await newTargetRes.json();
  const pageWsUrl = targetInfo.webSocketDebuggerUrl;

  const ws = new WebSocket(pageWsUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  await sendCdpCommand(ws, 'Page.enable');
  await sendCdpCommand(ws, 'Network.enable');

  const locales: ('ar' | 'en')[] = ['ar', 'en'];

  for (const locale of locales) {
    console.log(`\n=== Capturing screenshots for locale: ${locale} ===`);

    // Set locale cookie
    await sendCdpCommand(ws, 'Network.setCookie', {
      name: 'lf_locale',
      value: locale,
      domain: 'localhost',
      path: '/',
    });

    // Also clear session to make sure it's pure public view
    await sendCdpCommand(ws, 'Network.deleteCookies', {
      name: 'leadforge_session',
      domain: 'localhost',
      path: '/',
    });

    // Navigate to landing page
    await sendCdpCommand(ws, 'Page.navigate', { url: 'http://localhost:3000/' });
    await sleep(3500);

    // 1. Desktop above-the-fold at 1440x800
    console.log(`Capturing ${locale} 1440x800 above-the-fold...`);
    await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sendCdpCommand(ws, 'Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' });
    await sleep(500);

    const foldShot = await sendCdpCommand(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const foldPath = path.join(OUTPUT_DIR, `landing_hero_${locale}_1440x800.png`);
    fs.writeFileSync(foldPath, Buffer.from(foldShot.data, 'base64'));
    console.log(`Saved: landing_hero_${locale}_1440x800.png (${fs.statSync(foldPath).size} bytes)`);

    // 2. Desktop 1440 Full Page
    console.log(`Capturing ${locale} 1440 full page...`);
    const layout = await sendCdpCommand(ws, 'Page.getLayoutMetrics');
    const fullHeight = Math.ceil(layout.contentSize?.height || 3600);
    const fullWidth = 1440;

    await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
      width: fullWidth,
      height: fullHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(500);

    const fullShot = await sendCdpCommand(ws, 'Page.captureScreenshot', {
      format: 'png',
    });
    const fullPath = path.join(OUTPUT_DIR, `landing_full_${locale}_1440.png`);
    fs.writeFileSync(fullPath, Buffer.from(fullShot.data, 'base64'));
    console.log(`Saved: landing_full_${locale}_1440.png (${fs.statSync(fullPath).size} bytes)`);

    // Also update legacy names if relevant
    if (locale === 'ar') {
      fs.writeFileSync(path.join(OUTPUT_DIR, 'landing_page_full.png'), Buffer.from(fullShot.data, 'base64'));
    } else {
      fs.writeFileSync(path.join(OUTPUT_DIR, 'landing_page_full_en.png'), Buffer.from(fullShot.data, 'base64'));
    }

    // 3. Mobile 390 above-the-fold (at 390x844 viewport)
    console.log(`Capturing ${locale} 390x844 mobile above-the-fold...`);
    await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sendCdpCommand(ws, 'Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' });
    await sleep(500);

    const mobileFoldShot = await sendCdpCommand(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const mobileFoldPath = path.join(OUTPUT_DIR, `landing_hero_${locale}_390.png`);
    fs.writeFileSync(mobileFoldPath, Buffer.from(mobileFoldShot.data, 'base64'));
    console.log(`Saved: landing_hero_${locale}_390.png (${fs.statSync(mobileFoldPath).size} bytes)`);
  }

  ws.close();
  edgeProc.kill();
  console.log('\nAll 6 landing hero screenshots captured successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to capture hero screenshots:', err);
  process.exit(1);
});
