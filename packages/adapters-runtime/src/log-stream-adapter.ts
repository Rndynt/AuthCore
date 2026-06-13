import { addLogListener, removeLogListener } from './log-stream.js';
import type { LogStream } from '../../core/src/ports/log-stream';

export class LogStreamAdapter implements LogStream {
  addListener(listener: (event: unknown) => void): void {
    addLogListener(listener as Parameters<typeof addLogListener>[0]);
  }
  removeListener(listener: (event: unknown) => void): void {
    removeLogListener(listener as Parameters<typeof removeLogListener>[0]);
  }
}

export const logStreamAdapter = new LogStreamAdapter();
