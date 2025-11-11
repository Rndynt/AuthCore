import { EventEmitter } from "node:events";

export interface LogEvent {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  context: {
    method: string;
    url: string;
    statusCode: number;
    duration: number;
    tenantId: string | null;
    ip: string;
    userAgent?: string;
  } & Record<string, unknown>;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function emitLogEvent(event: LogEvent) {
  emitter.emit("log", event);
}

export function addLogListener(listener: (event: LogEvent) => void) {
  emitter.on("log", listener);
}

export function removeLogListener(listener: (event: LogEvent) => void) {
  emitter.off("log", listener);
}

export function onceLog(listener: (event: LogEvent) => void) {
  emitter.once("log", listener);
}

export function clearLogListeners() {
  emitter.removeAllListeners("log");
}
