import {mkdtempSync, cpSync, realpathSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=mkdtempSync('/tmp/nxttrack-phase01-relocated-');
try {
 cpSync('apps/web/.next/standalone',root,{recursive:true,verbatimSymlinks:true});
 const appRequire=createRequire(join(root,'apps/web/server.js'));
 const require=createRequire(appRequire.resolve('next/dist/server/image-optimizer.js'));
 assert.ok(realpathSync(require.resolve('sharp')).startsWith(root+'/'));
 const sharp=require('sharp');
 for(const format of ['png','webp','avif']) {
  const encoded=await sharp({create:{width:16,height:16,channels:3,background:'#00aabb'}}).toFormat(format).toBuffer();
  const result=await sharp(encoded).resize(8,8).raw().toBuffer({resolveWithObject:true});
  assert.equal(result.info.width,8);assert.equal(result.info.height,8);
  console.log('PASS relocated native encode/decode/resize',format);
 }
 const native=process.report.getReport().sharedObjects.filter(p=>p.includes('sharp')||p.includes('libvips'));
 assert.ok(native.some(p=>p.endsWith('.node')));assert.ok(native.some(p=>p.includes('libvips')));
 for(const p of native)assert.ok(realpathSync(p).startsWith(root+'/'),p);
 console.log('PASS sharp',sharp.versions.sharp,'HEIF',sharp.versions.heif,'all Sharp/libvips shared objects resolve within relocated artifact');
} finally {rmSync(root,{recursive:true,force:true});}
