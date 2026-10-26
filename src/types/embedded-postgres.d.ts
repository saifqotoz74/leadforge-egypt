declare module 'embedded-postgres' {
  export interface EmbeddedPostgresOptions {
    port?: number;
    databaseDir?: string;
    user?: string;
    password?: string;
    persistent?: boolean;
    [key: string]: any;
  }

  export default class EmbeddedPostgres {
    constructor(options?: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
  }
}
