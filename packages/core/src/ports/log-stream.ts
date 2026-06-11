export interface LogStream<T = unknown> { addListener(listener: (event: T) => void): void; removeListener(listener: (event: T) => void): void; }
