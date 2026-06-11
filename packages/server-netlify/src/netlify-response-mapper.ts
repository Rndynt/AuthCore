import type { HandlerResponse } from '@netlify/functions';

/**
 * Convert a Web Fetch API Response into a Netlify HandlerResponse.
 */
export async function webResponseToNetlify(response: Response): Promise<HandlerResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const rawBody = await response.arrayBuffer();
  const body = Buffer.from(rawBody).toString('base64');

  return {
    statusCode: response.status,
    headers,
    body,
    isBase64Encoded: true,
  };
}
