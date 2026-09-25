declare module 'cloudflare:workers' {
  type DurableObjectStub = { fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> };
  type DurableObjectNamespace = { getByName(name: string): DurableObjectStub };
  export const env: {
    TRAVEL_STATE: DurableObjectNamespace;
    [key: string]: unknown;
  };
}
