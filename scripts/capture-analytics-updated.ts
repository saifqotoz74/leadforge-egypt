import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/db';
import { signSessionToken } from '../src/lib/auth';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'edge-cdp-analytics-' + Date.now());
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

  const devUser = await prisma.user.findFirst({
    where: { role: 'DEVELOPER' },
  });

  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!devUser || !adminUser) {
    throw new Error('Database missing developer or admin user');
  }

  const devToken = await signSessionToken({
    userId: devUser.id,
    email: devUser.email,
    name: devUser.name,
    role: 'DEVELOPER',
  });

  const adminToken = await signSessionToken({
    userId: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: 'ADMIN',
  });

  const port = 9251;
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  await sleep(2500);

  let versionData: any;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch {
      await sleep(500);
    }
  }

  if (!versionData) {
    throw new Error('Could not connect to Edge DevTools');
  }

  const ws = new WebSocket(versionData.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  const newTarget = await sendCdpCommand(ws, 'Target.createTarget', { url: 'about:blank' });
  const pageWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${newTarget.targetId}`);
  await new Promise((resolve) => pageWs.addEventListener('open', resolve));

  await sendCdpCommand(pageWs, 'Page.enable');
  await sendCdpCommand(pageWs, 'DOM.enable');
  await sendCdpCommand(pageWs, 'CSS.enable');
  await sendCdpCommand(pageWs, 'Network.enable');

  // Set Arabic locale cookie
  await sendCdpCommand(pageWs, 'Network.setCookie', {
    name: 'lf_locale',
    value: 'ar',
    domain: 'localhost',
    path: '/',
  });

  const tasks = [
    {
      url: 'http://localhost:3000/dashboard/analytics',
      token: devToken,
      width: 1440,
      height: 900,
      filename: 'dashboard_analytics_desktop_1440.png',
    },
    {
      url: 'http://localhost:3000/dashboard/analytics',
      token: devToken,
      width: 390,
      height: 844,
      filename: 'dashboard_analytics_mobile_390.png',
    },
    {
      url: 'http://localhost:3000/admin/analytics',
      token: adminToken,
      width: 1440,
      height: 900,
      filename: 'admin_analytics_desktop_1440.png',
    },
    {
      url: 'http://localhost:3000/admin/analytics',
      token: adminToken,
      width: 390,
      height: 844,
      filename: 'admin_analytics_mobile_390.png',
    },
  ];

  for (const t of tasks) {
    console.log(`Setting session cookie and navigating to ${t.url} (${t.width}x${t.height})...`);
    await sendCdpCommand(pageWs, 'Network.setCookie', {
      name: 'leadforge_session',
      value: t.token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });

    await sendCdpCommand(pageWs, 'Emulation.setDeviceMetricsOverride', {
      width: t.width,
      height: t.height,
      deviceScaleFactor: 1,
      mobile: t.width < 500,
    });

    await sendCdpCommand(pageWs, 'Page.navigate', { url: t.url });
    // Allow React state & charts to settle
    await sleep(3500);

    const shot = await sendCdpCommand(pageWs, 'Page.captureScreenshot', {
      format: 'png',
    });

    const filePath = path.join(OUTPUT_DIR, t.filename);
    fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshot to ${filePath}`);
  }

  pageWs.close();
  ws.close();
  edgeProc.kill();

  try {
    fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  } catch {}

  console.log('Finished capturing all analytics screenshots.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
