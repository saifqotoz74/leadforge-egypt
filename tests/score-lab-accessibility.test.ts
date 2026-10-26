import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Score Lab Accessibility (UX-003 / WCAG 4.1.2)', () => {
  const scoreLabPath = path.resolve(__dirname, '../src/features/landing/ScoreLab.tsx');
  const content = fs.readFileSync(scoreLabPath, 'utf-8');

  it('declares accessible name and role on website switch control', () => {
    // Must declare role="switch", aria-checked, and aria-label / aria-labelledby
    expect(content).toContain('role="switch"');
    expect(content).toContain('aria-checked={inputs.hasWebsite}');
    expect(content).toContain('aria-label={tLanding(\'scoreLabSwitchWebsite\')}');
    expect(content).toContain('aria-labelledby="lab-has-website-label"');
    expect(content).toContain('id="lab-has-website-label"');
  });

  it('declares accessible names on reviews and branches stepper buttons', () => {
    expect(content).toContain('aria-label={tLanding(\'scoreLabDecreaseReviews\')}');
    expect(content).toContain('aria-label={tLanding(\'scoreLabIncreaseReviews\')}');
    expect(content).toContain('aria-label={tLanding(\'scoreLabDecreaseBranches\')}');
    expect(content).toContain('aria-label={tLanding(\'scoreLabIncreaseBranches\')}');
  });

  it('declares accessible name and range attributes on verification slider', () => {
    expect(content).toContain('id="lab-days-slider"');
    expect(content).toContain('type="range"');
    expect(content).toContain('aria-label={tLanding(\'scoreLabVerification\')}');
    expect(content).toContain('aria-valuemin={1}');
    expect(content).toContain('aria-valuemax={120}');
    expect(content).toContain('aria-valuenow={inputs.daysSinceVerification}');
  });

  it('declares aria-pressed on preset buttons', () => {
    expect(content).toContain("aria-pressed={inputs.preset === 'dental'}");
    expect(content).toContain("aria-pressed={inputs.preset === 'restaurant'}");
    expect(content).toContain("aria-pressed={inputs.preset === 'training'}");
  });
});
