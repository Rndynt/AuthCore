import { addLogListener, removeLogListener } from '../../../src/utils/log-stream.js';
export const logStreamAdapter = { addListener: addLogListener, removeListener: removeLogListener };
