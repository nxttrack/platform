// Only loaded explicitly by the local standalone verification launcher. Never a product import.
if (process.env.APP_ENV !== 'test' || process.env.PORTAL_LOCAL_PAYMENT_FIXTURE !== 'true') throw new Error('Local provider preload requires explicit test mode');
const original = globalThis.fetch;
const destination = new URL(process.env.PORTAL_LOCAL_PAYMENT_PROVIDER_URL);
if (destination.hostname !== '127.0.0.1' || destination.protocol !== 'http:') throw new Error('Local provider must be loopback HTTP');
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.mollie.com') {
    if (url.protocol !== 'https:' || !/^\/v2\/payments\/[a-zA-Z0-9_]+(?:\/(refunds|chargebacks))?$/.test(url.pathname) || (options?.method ?? 'GET') !== 'GET') throw new Error('Unexpected provider operation in read-only fictional adapter');
    return original(new URL(url.pathname,destination),options);
  }
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('External network forbidden in local provider rehearsal');
  return original(input,options);
};
