export interface AdminAuthProvider { handler(request: Request): Promise<Response>; api: { getSession(input: { headers: Headers }): Promise<any> }; }
