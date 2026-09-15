import test from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirect,authorizeCron } from '../lib/security.ts';
import { minorUnits } from '../lib/payments/money.ts';
test('redirects cannot escape the site',()=>{
 for(const value of ['//evil.test','/\\evil.test','/%5cevil.test','/%2f%2fevil.test','/\nevil.test','https://evil.test','/%00']) assert.equal(safeRedirect(value),'/dashboard');
 assert.equal(safeRedirect('/dashboard?tab=orders'),'/dashboard?tab=orders');
});
test('cron requires the exact bearer secret',()=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-secret';
 try{assert.equal(authorizeCron(new Request('https://local.test?secret=test-secret',{headers:{'x-vercel-cron':'1'}})),false);
 assert.equal(authorizeCron(new Request('https://local.test',{headers:{authorization:'Bearer test-secret'}})),true);
 process.env.CRON_SECRET='';assert.equal(authorizeCron(new Request('https://local.test',{headers:{'x-vercel-cron':'1'}})),false);
 }finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
});
test('decimal conversion is exact and rejects excess precision',()=>{
 assert.equal(minorUnits('100.000000'),10000);assert.equal(minorUnits('1.01'),101);assert.equal(minorUnits(0.29),29);
 for(const value of ['1.001','NaN',Infinity,-1,'1e9','9007199254740992'])assert.throws(()=>minorUnits(value));
});
