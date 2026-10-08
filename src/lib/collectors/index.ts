export * from './types';
export * from './logger';
export * from './security';
export * from './contract';
export * from './resilience';
export * from './adapters';
export * from './registry';
export * from './orchestrator';
export * from './health-and-supply';

import { validateAndParseSafeCsv } from './security';

/**
 * Backward-compatible CSV parser helper that delegates to the hardened Phase 8 CSV parser.
 */
export function parseCsvString(csvText: string): Record<string, string>[] {
  return validateAndParseSafeCsv(csvText).rows;
}
