import { addLogListener, removeLogListener } from '../../../src/utils/log-stream.js';
import type { LogStream } from '../../core/src/ports/log-stream';

export class LogStreamAdapter implements LogStream {
  addListener(listener: (event: unknown) => void): void {
    addLogListener(listener as any);
  }

  removeListener(listener: (event: unknown) => void): void {
    removeLogListener(listener as any);
  }
}

export const logStreamAdapter: LogStream & {
  addListener: typeof addLogListener;
  removeListener: typeof removeLogListener;
} = {
  addListener,
  removeListener,
};
