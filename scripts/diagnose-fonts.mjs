import { chromium } from '@playwright/test';
import fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(EDGE_PATH) ? EDGE_PATH : undefined
  });
  const page = await browser.newPage();
  
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  const fontInfo = await page.evaluate(async () => {
    await document.fonts.ready;
    const bodyComputed = window.getComputedStyle(document.body).fontFamily;
    const fontsReady = document.fonts.status;
    const hasPlexSansArabic = document.fonts.check('16px "IBM Plex Sans Arabic"');
    const hasPlexMono = document.fonts.check('16px "IBM Plex Mono"');
    
    const loadedFaces = [];
    document.fonts.forEach(f => {
      loadedFaces.push({ family: f.family, status: f.status, weight: f.weight });
    });

    return {
      bodyComputed,
      fontsReady,
      hasPlexSansArabic,
      hasPlexMono,
      loadedFaces
    };
  });

  console.log('=== DIAGNOSIS (a) BROWSER FONT STATUS ===');
  console.log('bodyComputed:', fontInfo.bodyComputed);
  console.log('document.fonts.status:', fontInfo.fontsReady);
  console.log('hasPlexSansArabic:', fontInfo.hasPlexSansArabic);
  console.log('hasPlexMono:', fontInfo.hasPlexMono);
  console.log('loadedFaces count:', fontInfo.loadedFaces.length);
  console.log('consoleErrors (CSP / font errors):', consoleErrors);
  await browser.close();
})();
