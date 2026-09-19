import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const target = process.argv[2];
if (!['staging','production'].includes(target)) throw new Error('Invalid target');
const env = parseEnv(readFileSync(`/var/www/nxttrack/${target}/shared/.env`,'utf8'));
const expectedUrl = target === 'production' ? 'https://nxttrack.nl' : 'https://staging.nxttrack.nl';
if (env.APP_URL !== expectedUrl) throw new Error('Environment URL mismatch');
if (env.MAINTENANCE_NO_WRITE === 'true' || env.INTERNAL_JOBS_ENABLED !== 'true') process.exit(0);
const endpoints = [
  ['/api/internal/portal-themes/activate-scheduled',env.CRON_SECRET],
  ['/api/internal/offerings/expire',env.BILLING_AUTOMATION_SECRET],
  ...(env.EMAIL_SENDING_ENABLED === 'true' ? [['/api/internal/email-outbox/process',env.CRON_SECRET]] : [])
];
for (const [route,secret] of endpoints) {
  if (!secret || secret.length < 32) throw new Error('Worker authentication is not configured');
  const response = await fetch(`${expectedUrl}${route}`, {method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(45000)});
  const result = await response.json();
  if (!response.ok || result.accepted !== true || (result.failed ?? 0) > 0) throw new Error(`V4 job ${route} failed: HTTP ${response.status}`);
  console.log(JSON.stringify({at:new Date().toISOString(),target,route,status:'pass',processed:result.processed ?? result.claimed ?? result.expired ?? 0}));
}
