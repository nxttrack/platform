import http from 'node:http';
import {readFileSync} from 'node:fs';
if(process.env.PORTAL_LOCAL_PAYMENT_FIXTURE!=='true')throw new Error('Explicit isolated fixture mode required');
const fixture=JSON.parse(readFileSync(process.env.PORTAL_LOCAL_PAYMENT_BROWSER_FIXTURE,'utf8'));
if(!fixture.email.endsWith('@example.test'))throw new Error('Fictional family required');
const payments=new Map(fixture.payments.map(x=>[x.providerId,x.snapshot]));
http.createServer((request,response)=>{
 const match=/^\/v2\/payments\/([a-zA-Z0-9_]+)(?:\/(refunds|chargebacks))?$/.exec(request.url);
 if(request.method!=='GET'||!match||!payments.has(match[1])){response.writeHead(404).end();return;}
 const value=match[2]?{_embedded:{[match[2]]:[]}}:payments.get(match[1]);
 response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));
 console.log('Local fictional provider GET',match[2]??'payment',match[2]?'empty':value.status);
}).listen(58412,'127.0.0.1',()=>console.log('Fictional provider listening on loopback58412; no outbound requests'));
