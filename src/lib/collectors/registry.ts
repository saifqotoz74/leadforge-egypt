import { SourceType } from '@prisma/client';
import { Collector, CollectorMetadata, IngestionError } from './types';
import {
  CsvCollector,
  DirectoryCollector,
  GoogleBusinessCollector,
  ManualCollector,
  OpenDataCollector,
  WebsiteCollector,
} from './adapters';
import { resolveSourceType } from '../normalizer';

export class CollectorRegistry {
  private readonly byKey = new Map<string, Collector>();
  private readonly bySourceType = new Map<SourceType, Collector>();

  constructor(registerDefaults = true) {
    if (registerDefaults) {
      this.resetToDefaults();
    }
  }

  register(collector: Collector): void {
    const key = collector.collectorKey.toLowerCase().trim();
    const versionedKey = collector.version.toLowerCase().trim();
    const nameKey = collector.name.toLowerCase().trim();

    this.byKey.set(key, collector);
    this.byKey.set(versionedKey, collector);
    this.byKey.set(nameKey, collector);
    this.byKey.set(collector.sourceType.toLowerCase(), collector);
    this.bySourceType.set(collector.sourceType, collector);
  }

  has(sourceTypeOrKey: SourceType | string): boolean {
    if (!sourceTypeOrKey) return false;
    const raw = String(sourceTypeOrKey).trim();
    if (this.bySourceType.has(raw as SourceType)) return true;
    if (this.byKey.has(raw.toLowerCase())) return true;
    return false;
  }

  get(sourceTypeOrKey: SourceType | string): Collector {
    if (!sourceTypeOrKey) {
      throw new IngestionError(
        'Collector lookup key cannot be empty',
        'INVALID_SOURCE_CONFIGURATION',
        { retryable: false }
      );
    }

    const raw = String(sourceTypeOrKey).trim();
    const byExactType = this.bySourceType.get(raw as SourceType);
    if (byExactType) return byExactType;

    const byKeyMatch = this.byKey.get(raw.toLowerCase());
    if (byKeyMatch) return byKeyMatch;

    const resolvedType = resolveSourceType(raw);
    const byResolved = this.bySourceType.get(resolvedType);
    if (byResolved) return byResolved;

    throw new IngestionError(
      `No collector registered for "${sourceTypeOrKey}"`,
      'INVALID_SOURCE_CONFIGURATION',
      { retryable: false }
    );
  }

  resolveCollector(options: {
    collectorKey?: string | null;
    sourceType?: SourceType | string | null;
    sourceName?: string | null;
    config?: Record<string, unknown>;
  }): Collector {
    if (options.collectorKey && this.has(options.collectorKey)) {
      return this.get(options.collectorKey);
    }
    if (options.sourceType && this.has(options.sourceType)) {
      return this.get(options.sourceType);
    }
    if (options.sourceName && this.has(options.sourceName)) {
      return this.get(options.sourceName);
    }
    return this.get(options.sourceType || options.sourceName || 'MANUAL');
  }

  list(): Collector[] {
    return Array.from(this.bySourceType.values());
  }

  listMetadata(): CollectorMetadata[] {
    return this.list().map((c) => c.metadata);
  }

  resetToDefaults(): void {
    this.byKey.clear();
    this.bySourceType.clear();
    this.register(new ManualCollector());
    this.register(new CsvCollector());
    this.register(new OpenDataCollector());
    this.register(new DirectoryCollector());
    this.register(new WebsiteCollector());
    this.register(new GoogleBusinessCollector());
  }
}

export const collectorRegistry = new CollectorRegistry(true);
