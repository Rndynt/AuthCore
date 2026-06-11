export async function forwardToBetterAuth(handler: { handler(request: Request): Promise<Response> }, request: Request) { return handler.handler(request); }
