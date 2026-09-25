export function safeWebImageUrl(url: string): string | null;
export function registerWebImage(url: string, secret: string | undefined, now?: number): Promise<string | null>;
export function registerWebImages(urls: string[], secret: string | undefined, now?: number): Promise<string | null>;
export function getWebImage(token: string, secret: string | undefined, now?: number): Promise<string | null>;
export function getWebImages(token: string, secret: string | undefined, now?: number): Promise<string[] | null>;
