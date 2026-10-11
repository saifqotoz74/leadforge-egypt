import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'edge-cdp-dashboard-' + Date.now());
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
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Authenticate with real demo developer credentials
  console.log('Logging in via /api/auth/login...');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@leadforge.eg', password: 'Dev@12345' }),
  });

  if (!loginRes.ok) {
    throw new Error(`Failed to log in: ${loginRes.status}`);
  }

  const cookieHeader = loginRes.headers.get('set-cookie') || '';
  const sessionMatch = cookieHeader.match(/leadforge_session=([^;]+)/);
  if (!sessionMatch) {
    throw new Error('Could not find leadforge_session cookie in login response');
  }
  const sessionToken = sessionMatch[1];
  console.log('Successfully obtained real session token.');

  // 2. Launch Edge headless with remote debugging on dynamic port
  const port = 9390 + Math.floor(Math.random() * 50);
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  console.log('Spawned headless Edge on port', port);

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
      // wait
    }
    await sleep(300);
  }

  if (!targetWsUrl) {
    edgeProc.kill();
    throw new Error('Failed to connect to Edge CDP');
  }

  console.log('Connected to Edge CDP.');

  const newTargetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const targetInfo = await newTargetRes.json();
  const pageWsUrl = targetInfo.webSocketDebuggerUrl;

  const ws = new WebSocket(pageWsUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  await sendCdpCommand(ws, 'Page.enable');
  await sendCdpCommand(ws, 'Network.enable');

  const locales = ['ar', 'en'] as const;
  const viewports = [
    { label: '390', width: 390, height: 844, isMobile: true },
    { label: '1440', width: 1440, height: 900, isMobile: false },
  ];

  // ================= 1. CAPTURE REAL SEED /dashboard =================
  for (const locale of locales) {
    console.log(`\n================ Capturing REAL SEED /dashboard: ${locale.toUpperCase()} ================`);

    await sendCdpCommand(ws, 'Network.setCookie', {
      name: 'leadforge_session',
      value: sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });
    await sendCdpCommand(ws, 'Network.setCookie', {
      name: 'lf_locale',
      value: locale,
      domain: 'localhost',
      path: '/',
    });

    for (const vp of viewports) {
      console.log(`Setting viewport: ${vp.width}x${vp.height} (${vp.label})...`);
      await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        mobile: vp.isMobile,
      });

      console.log(`Navigating to http://localhost:3000/dashboard (${locale})...`);
      await sendCdpCommand(ws, 'Page.navigate', { url: 'http://localhost:3000/dashboard' });
      await sleep(3500);

      // Verify computed border colors
      if (vp.label === '1440') {
        const borderVerification = await sendCdpCommand(ws, 'Runtime.evaluate', {
          expression: `(() => {
            const results = {};
            const tileDivider = document.querySelector('.border-t.border-line');
            if (tileDivider) {
              const cs = window.getComputedStyle(tileDivider);
              results.tileDivider = {
                borderTopColor: cs.borderTopColor,
                borderTopWidth: cs.borderTopWidth,
                borderTopStyle: cs.borderTopStyle,
              };
            }
            const cardHeader = document.querySelector('.border-b.border-line');
            if (cardHeader) {
              const cs = window.getComputedStyle(cardHeader);
              results.cardHeader = {
                borderBottomColor: cs.borderBottomColor,
                borderBottomWidth: cs.borderBottomWidth,
              };
            }
            const defaultToken = getComputedStyle(document.documentElement).getPropertyValue('--border-default').trim();
            results.tokenValue = defaultToken;
            return results;
          })()`,
          returnByValue: true,
        });
        console.log(`[VERIFICATION] Computed Border Colors (${locale}):`, JSON.stringify(borderVerification.result?.value, null, 2));
      }

      const layoutMetrics = await sendCdpCommand(ws, 'Page.getLayoutMetrics');
      const docHeight = await sendCdpCommand(ws, 'Runtime.evaluate', {
        expression: 'document.documentElement.scrollHeight',
        returnByValue: true,
      });
      const contentHeight = Math.max(
        Math.ceil(layoutMetrics.contentSize?.height || 844),
        docHeight.result?.value || 844
      );

      await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: contentHeight,
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        mobile: vp.isMobile,
      });
      await sleep(400);

      const shot = await sendCdpCommand(ws, 'Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      const filename = `dashboard_seed_${locale}_${vp.label}.png`;
      const filePath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
      console.log(`Saved seed screenshot: ${filename} (${fs.statSync(filePath).size} bytes, height: ${contentHeight}px)`);

      // Keep legacy canonical names
      if (locale === 'ar') {
        const canonicalName = vp.label === '390' ? 'dashboard_mobile_390.png' : 'dashboard_desktop_1440.png';
        fs.writeFileSync(path.join(OUTPUT_DIR, canonicalName), Buffer.from(shot.data, 'base64'));
      }
      const genericName = `dashboard_${locale}_${vp.label}.png`;
      fs.writeFileSync(path.join(OUTPUT_DIR, genericName), Buffer.from(shot.data, 'base64'));
    }
  }

  // ================= 2. CAPTURE DEV FIXTURES /dashboard?fixtures=true =================
  for (const locale of locales) {
    console.log(`\n================ Capturing DEV FIXTURES /dashboard: ${locale.toUpperCase()} ================`);

    await sendCdpCommand(ws, 'Network.setCookie', {
      name: 'lf_locale',
      value: locale,
      domain: 'localhost',
      path: '/',
    });

    for (const vp of viewports) {
      await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        mobile: vp.isMobile,
      });

      console.log(`Navigating to http://localhost:3000/dashboard?fixtures=true (${locale} ${vp.label})...`);
      await sendCdpCommand(ws, 'Page.navigate', { url: 'http://localhost:3000/dashboard?fixtures=true' });
      await sleep(3500);

      const layoutMetrics = await sendCdpCommand(ws, 'Page.getLayoutMetrics');
      const docHeight = await sendCdpCommand(ws, 'Runtime.evaluate', {
        expression: 'document.documentElement.scrollHeight',
        returnByValue: true,
      });
      const contentHeight = Math.max(
        Math.ceil(layoutMetrics.contentSize?.height || 844),
        docHeight.result?.value || 844
      );

      await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: contentHeight,
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        mobile: vp.isMobile,
      });
      await sleep(400);

      const shot = await sendCdpCommand(ws, 'Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      const filename = `dashboard_fixtures_${locale}_${vp.label}.png`;
      const filePath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
      console.log(`Saved fixture screenshot: ${filename} (${fs.statSync(filePath).size} bytes, height: ${contentHeight}px)`);
    }
  }

  // ================= 3. CAPTURE /design-system SECTIONS =================
  for (const locale of locales) {
    console.log(`\n================ Capturing /design-system: ${locale.toUpperCase()} ================`);

    await sendCdpCommand(ws, 'Network.setCookie', {
      name: 'lf_locale',
      value: locale,
      domain: 'localhost',
      path: '/',
    });

    await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log(`Navigating to http://localhost:3000/design-system (${locale})...`);
    await sendCdpCommand(ws, 'Page.navigate', { url: 'http://localhost:3000/design-system' });
    await sleep(4000);

    // Print computed tier pill colors & CSS custom properties
    if (locale === 'ar') {
      const tierStyleResult = await sendCdpCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const rootStyle = getComputedStyle(document.documentElement);
          const variables = {
            '--tier-cold-bg': rootStyle.getPropertyValue('--tier-cold-bg').trim(),
            '--tier-cold-fg': rootStyle.getPropertyValue('--tier-cold-fg').trim(),
            '--tier-warm-bg': rootStyle.getPropertyValue('--tier-warm-bg').trim(),
            '--tier-warm-fg': rootStyle.getPropertyValue('--tier-warm-fg').trim(),
            '--tier-hot-bg': rootStyle.getPropertyValue('--tier-hot-bg').trim(),
            '--tier-hot-fg': rootStyle.getPropertyValue('--tier-hot-fg').trim(),
            '--tier-premium-bg': rootStyle.getPropertyValue('--tier-premium-bg').trim(),
            '--tier-premium-fg': rootStyle.getPropertyValue('--tier-premium-fg').trim(),
          };
          const badges = Array.from(document.querySelectorAll('[class*="bg-tier-"]'));
          const pills = badges.map(b => {
            const cs = getComputedStyle(b);
            return {
              text: b.textContent?.trim(),
              className: b.className,
              computedBg: cs.backgroundColor,
              computedColor: cs.color,
              computedBorder: cs.borderColor,
            };
          });
          return { variables, pills };
        })()`,
        returnByValue: true,
      });
      console.log('\n================ TIER PILL COMPUTED STYLES ================');
      console.log(JSON.stringify(tierStyleResult.result?.value, null, 2));

      // Capture individual section screenshots for Item 11
      const sectionsToCapture = [
        { heading: 'LeadTemperature', filename: 'design_system_tiers.png' },
        { heading: 'Freshness & Verification', filename: 'design_system_quality_states.png' },
        { heading: 'StatTile', filename: 'design_system_stattile.png' },
        { heading: 'ChipList', filename: 'design_system_chiplist.png' },
        { heading: 'BarList', filename: 'design_system_barlist.png' },
      ];

      for (const sec of sectionsToCapture) {
        const rectRes = await sendCdpCommand(ws, 'Runtime.evaluate', {
          expression: `(() => {
            const headings = Array.from(document.querySelectorAll('h3, h2'));
            const targetH = headings.find(h => h.textContent && h.textContent.includes('${sec.heading}'));
            if (!targetH) return null;
            const card = targetH.closest('.rounded-xl') || targetH.parentElement;
            if (!card) return null;
            card.scrollIntoView();
            const rect = card.getBoundingClientRect();
            return {
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              width: rect.width,
              height: rect.height,
            };
          })()`,
          returnByValue: true,
        });

        const rect = rectRes.result?.value;
        if (rect && rect.width > 0 && rect.height > 0) {
          await sleep(300);
          const shot = await sendCdpCommand(ws, 'Page.captureScreenshot', {
            format: 'png',
            clip: {
              x: Math.max(0, rect.x),
              y: Math.max(0, rect.y),
              width: Math.ceil(rect.width),
              height: Math.ceil(rect.height),
              scale: 1,
            },
          });
          const filePath = path.join(OUTPUT_DIR, sec.filename);
          fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
          console.log(`Saved section screenshot: ${sec.filename} (${fs.statSync(filePath).size} bytes)`);
        } else {
          console.warn(`Could not locate section for heading: ${sec.heading}`);
        }
      }
    }

    const layoutMetrics = await sendCdpCommand(ws, 'Page.getLayoutMetrics');
    const docHeight = await sendCdpCommand(ws, 'Runtime.evaluate', {
      expression: 'document.documentElement.scrollHeight',
      returnByValue: true,
    });
    const contentHeight = Math.max(
      Math.ceil(layoutMetrics.contentSize?.height || 900),
      docHeight.result?.value || 900
    );

    await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: contentHeight,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(400);

    const shot = await sendCdpCommand(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    const filename = `design_system_${locale}_1440.png`;
    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
    console.log(`Saved design-system screenshot: ${filename} (${fs.statSync(filePath).size} bytes, height: ${contentHeight}px)`);
  }

  ws.close();
  edgeProc.kill();
  console.log('\nAll captures completed successfully.');
}

main().catch((err) => {
  console.error('Error during capture:', err);
  process.exit(1);
});
