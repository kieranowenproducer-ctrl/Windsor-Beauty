import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as capture from '../src/lib/replyCapture.ts';
const source = readFileSync(new URL('../src/app/api/admin/enquiries/[id]/draft/route.ts',import.meta.url),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
async function draft(message, stored = null, orderEmail='member@example.invalid') {
  const calls={references:[],latest:0}; const enquiry={id:2,email:'member@example.invalid',message,order_number:stored,subject_key:'order'};
  const order={order_number:'WB-4293UR-85A64',email:orderEmail};
  const modules={ 'next/server':{NextResponse:{json:body=>new Response(JSON.stringify(body))}},
    '@/lib/db':{isDbConfigured:()=>true,findOrderByNumber:async reference=>{calls.references.push(reference);return order;}},
    '@/lib/db/orders':{findLatestOrderByEmail:async()=>{calls.latest++;return order;}},
    '@/lib/db/enquiries':{findEnquiryById:async()=>enquiry,findLatestCustomerReply:async()=>null},
    '@/lib/replyCapture':capture,
    '@/lib/email/enquiryAutoDraft':{enquiryNeedsHumanAction:()=>false,enquiryNeedsPersonalAdvice:()=>false,looksLikeOrderStatusQuestion:()=>true,orderStatusEmailCopy:()=> 'Synthetic status',orderDraftSnapshot:()=>({})}
  };
  const result={exports:{}};vm.runInNewContext(compiled,{exports:result.exports,module:result,require:name=>{if(!(name in modules))throw Error(`Unexpected dependency ${name}`);return modules[name];},console,Date});
  const response=await result.exports.POST(new Request('https://www.windsorbeauty.is/api/test'),{params:Promise.resolve({id:'2'})});
  return {calls,result:(await response.json()).draft};
}
test('WB single and compound references invoke exact Beauty lookup',async()=>{
  for(const reference of ['WB-GCZBKK','wb-4293ur-85a64']){
    const value=await draft(`Where is order ${reference}?`);assert.deepEqual(value.calls.references,[reference.toUpperCase()]);assert.equal(value.calls.latest,0);assert.equal(value.result.format,'order');
  }
});
test('stored Beauty reference normalizes without latest-order fallback',async()=>{
  const value=await draft('Where is my order?',' wb-4293ur-85a64 ');assert.deepEqual(value.calls.references,['WB-4293UR-85A64']);assert.equal(value.calls.latest,0);
});
test('Glow references, including mixed and stored references, hold without any Beauty lookup',async()=>{
  for(const [message,stored] of [['Where is WG-GCZBKK?',null],['Where is WB-GCZBKK or WG-ABCD?',null],['Where is my order?','WG-GCZBKK']]){
    const value=await draft(message,stored);assert.deepEqual(value.calls.references,[]);assert.equal(value.calls.latest,0);assert.equal(value.result.format,'manual');
  }
});
test('mismatched order owner cannot receive a prepared status reply',async()=>{
  const value=await draft('Where is WB-GCZBKK?',null,'other@example.invalid');assert.equal(value.result.format,'manual');assert.equal(value.calls.latest,0);
});
test('no reference keeps existing same-email latest-order behaviour',async()=>{
  const value=await draft('Where is my order?');assert.equal(value.calls.latest,1);assert.equal(value.result.format,'order');
});
