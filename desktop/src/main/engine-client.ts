import { utilityProcess, UtilityProcess } from 'electron';
import * as path from 'path';

type Pending = { resolve: (value: any) => void };

/** Cliente del proceso utilitario engine.js; lo relanza si se cae. */
export class EngineClient {
  private child: UtilityProcess | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  private ensure(): UtilityProcess {
    if (this.child) return this.child;
    const child = utilityProcess.fork(path.join(__dirname, 'engine.js'), [], { serviceName: 'Autopsia Engine' });
    child.on('message', (msg: { id: number; ok: boolean; value?: unknown; message?: string }) => {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      entry.resolve(msg.ok ? { ok: true, value: msg.value } : { ok: false, message: msg.message });
    });
    child.on('exit', (code) => {
      this.child = null;
      for (const entry of this.pending.values()) entry.resolve({ ok: false, message: `Engine stopped (code ${code})` });
      this.pending.clear();
    });
    this.child = child;
    return child;
  }

  call<T>(op: string, ...args: unknown[]): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.ensure().postMessage({ id, op, args });
    });
  }

  dispose(): void {
    this.child?.kill();
  }
}
