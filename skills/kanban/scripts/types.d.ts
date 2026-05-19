declare const Bun: {
  argv: string[];
  version: string;
};

declare module "bun" {
  export function $(strings: TemplateStringsArray, ...values: unknown[]): {
    quiet(): {
      nothrow(): Promise<{
        exitCode: number;
        stdout: { toString(): string };
        stderr: { toString(): string };
      }>;
    };
  };
}

interface ImportMeta {
  dir: string;
}

declare module "proper-lockfile" {
  interface LockOptions {
    retries?: {
      retries?: number;
      minTimeout?: number;
      maxTimeout?: number;
      randomize?: boolean;
    };
    realpath?: boolean;
    stale?: number;
  }

  interface ProperLockfile {
    lock(file: string, options?: LockOptions): Promise<() => Promise<void>>;
  }

  const lockfile: ProperLockfile;
  export default lockfile;
}
