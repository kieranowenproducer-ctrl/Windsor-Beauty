// Actual TS helper and route, with an explicit fake repository. No network/DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const files=['src/lib/db/beautyCustomerMerge.ts','src/app/api/admin/customers/[id]/merge/route.ts','src/app/admin/customers/MergeAccountCard.tsx','src/lib/customerMerge.ts','scripts/test-beauty-customer-merge-route.mjs'];
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const hashes=Object.fromEntries(files.map(p=>[p,sha(p)]));
const dir=path.resolve('.local-evidence/customer-merge-20261108/route',new Date().toISOString().replaceAll(':','-'));fs.mkdirSync(dir,{recursive:true});
let checks=0,failure=null,calls=0,behavior='normal';const names=[];
const equal=(label,a,b)=>{assert.deepEqual(a,b,label);checks++;names.push(label);};
const ok=(label,v)=>{assert.ok(v,label);checks++;names.push(label);};
const preview={keep:{id:1,email:'keep@example.invalid',name:'Kept'},remove:{id:2,email:'remove@example.invalid',name:'Other'},moves:[{table:'orders',count:1}],revokes:[],blockers:[],fingerprint:'a'.repeat(32)};
const sql=async(parts,...values)=>{
 calls++;const text=parts.join('?');
 if(behavior==='failure')throw new Error('private-database-host SECRET should not escape');
 if(text.includes('SELECT id FROM customers'))return behavior==='ambiguous'?[{id:2},{id:3}]:[{id:2}];
 if(text.includes('_preview'))return [{preview}];
 if(text.includes('_execute')) { if(behavior==='stale')throw new Error('merge_stale');return [{result:{keptId:values[1],removedId:values[2],replayed:behavior==='replay'}}]; }
 throw new Error('Unexpected repository query');
};
const environment={ADMIN_SESSION_TOKEN:'isolated-admin-token-no-real-credential'};
function compile(file,imports,extra={}) {
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};const context={module,exports:module.exports,require:name=>{if(name in imports)return imports[name];throw new Error(`Unexpected import ${name}`);},process:{env:environment},Buffer,Date,Error,TypeError,SyntaxError,URL,TextEncoder,Request,Response,console,crypto,...extra};
 vm.runInNewContext(output,context,{filename:file});return module.exports;
}
const helper=compile(files[0],{'node:crypto':crypto,'./client':{requireDb:()=>sql}});
const route=compile(files[1],{'node:crypto':crypto,'next/server':require('next/server.js'),'@/lib/db/beautyCustomerMerge':helper});
const args={params:Promise.resolve({id:'1'})};
const req=(method,body,options={})=>new Request('https://beauty.example.invalid/api/admin/customers/1/merge'+(method==='GET'?'?other=remove%40example.invalid':''),{method,headers:{cookie:`wb_admin_session=${environment.ADMIN_SESSION_TOKEN}`,origin:'https://beauty.example.invalid','content-type':'application/json',...options.headers},...(method!=='GET'?{body:JSON.stringify(body)}:{})});
try{
 let before=calls;equal('unauthenticated preview denied',(await route.GET(req('GET',null,{headers:{cookie:''}}),args)).status,401);equal('denied preview reads no repository',calls,before);
 equal('duplicate session cookies refused',(await route.GET(req('GET',null,{headers:{cookie:'wb_admin_session=x; wb_admin_session=y'}}),args)).status,401);
 equal('non-ASCII same-character-count cookie refuses without throwing',(await route.GET(req('GET',null,{headers:{cookie:`wb_admin_session=${'é'.repeat(environment.ADMIN_SESSION_TOKEN.length)}`}}),args)).status,401);
 equal('same-origin required',(await route.POST(req('POST',{}, {headers:{origin:'https://other.invalid'}}),args)).status,403);
 equal('JSON content type required',(await route.POST(req('POST',{}, {headers:{'content-type':'text/plain'}}),args)).status,415);
 let response=await route.GET(req('GET'),args);equal('authorised preview status',response.status,200);equal('private response not cached',response.headers.get('cache-control'),'no-store');
 const p=(await response.json()).preview;ok('signed bounded preview present',typeof p.token==='string'&&p.token.length<1024);ok('raw fingerprint not projected',!('fingerprint'in p));
 const input={removeId:2,requestId:crypto.randomUUID(),token:p.token,confirm:true};
 response=await route.POST(req('POST',input),args);equal('confirmed request accepted',response.status,200);equal('result contains IDs only',(await response.json()).result,{keptId:1,removedId:2,replayed:false});
 before=calls;equal('extra identity/profile writes refused',(await route.POST(req('POST',{...input,email:'changed@example.invalid'}),args)).status,400);equal('closed shape refuses before DB',calls,before);
 equal('missing explicit confirmation refused',(await route.POST(req('POST',{...input,confirm:false}),args)).status,400);
 equal('oversized body refused',(await route.POST(req('POST',{...input,token:'x'.repeat(3000)}),args)).status,400);
 equal('altered preview token refused',(await route.POST(req('POST',{...input,token:p.token.slice(0,-1)+'!'}),args)).status,400);
 equal('signed preview cannot change removal target',(await route.POST(req('POST',{...input,removeId:3}),args)).status,400);
 equal('request ID shape enforced',(await route.POST(req('POST',{...input,requestId:'anything'}),args)).status,400);
 behavior='replay';response=await route.POST(req('POST',input),args);equal('same request replay supported',(await response.json()).result.replayed,true);
 behavior='stale';equal('stale SQL result is conflict',(await route.POST(req('POST',input),args)).status,409);
 behavior='ambiguous';equal('ambiguous email refused',(await route.GET(req('GET'),args)).status,404);
 behavior='failure';response=await route.GET(req('GET'),args);equal('unknown failure is unavailable',response.status,503);ok('raw DB/secret error not returned',!(await response.text()).includes('SECRET'));behavior='normal';
 const saved=environment.ADMIN_SESSION_TOKEN;delete environment.ADMIN_SESSION_TOKEN;equal('missing configured admin token denied',(await route.GET(req('GET'),args)).status,401);environment.ADMIN_SESSION_TOKEN=saved;
 // Execute the real component with minimal hook/jsx adapters to exercise its
 // event/state contract. This is not a served browser or accessibility claim.
 let states=[],cursor=0;const refs=[];let rc=0;let fetched=[];let queue=[];
 const react={useState(init){const i=cursor++;if(!(i in states))states[i]=init;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(init){const i=rc++;return refs[i]??=( {current:init} );}};
 const jsx=(type,props)=>({type,props});const mod=compile(files[2],{'react':react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'@/lib/customerMerge':{MERGE_LABELS:{orders:'Orders'}}},{fetch:async(url,options)=>{fetched.push({url,options});const next=queue.shift();if(next instanceof Error)throw next;return next;},window:{location:{reload(){}}}});
 function render(){cursor=0;rc=0;return mod.default({customerId:1});}
 function flatten(n,out=[]){if(!n)return out;if(Array.isArray(n)){for(const v of n)flatten(v,out);return out;}if(typeof n==='object'){out.push(n);flatten(n.props?.children,out);}return out;}
 const find=(tree,predicate)=>flatten(tree).find(predicate);
 let tree=render();ok('other-account input has label',!!find(tree,n=>n.type==='label'&&n.props.htmlFor==='merge-other'));
 find(tree,n=>n.type==='input'&&n.props.id==='merge-other').props.onChange({target:{value:'other@example.invalid'}});
 tree=render();queue.push(Response.json({preview:{...p,blockers:[]}}));await find(tree,n=>n.type==='button'&&n.props.children==='Preview merge').props.onClick();tree=render();
 const confirm=find(tree,n=>n.type==='input'&&n.props.type==='checkbox');ok('separate checkbox confirmation shown',!!confirm);ok('merge disabled before confirmation',find(tree,n=>n.type==='button'&&n.props.children==='Merge into this account').props.disabled);
 confirm.props.onChange({target:{checked:true}});tree=render();queue.push(new Error('Connection lost'));await find(tree,n=>n.type==='button'&&n.props.children==='Merge into this account').props.onClick();tree=render();
 ok('lost response retains preview for exact retry',!!find(tree,n=>n.type==='button'&&n.props.children==='Merge into this account'));
 queue.push(Response.json({result:{keptId:1,removedId:2,replayed:true}}));await find(tree,n=>n.type==='button'&&n.props.children==='Merge into this account').props.onClick();tree=render();
 const posts=fetched.filter(f=>f.options?.method==='POST');equal('lost-response retry preserves exact request body',posts[0].options.body,posts[1].options.body);ok('completed merge shows status',!!find(tree,n=>n.props?.role==='status'));
 for(const[file,h]of Object.entries(hashes))equal('source unchanged '+file,sha(file),h);
}catch(e){failure={name:e.name,message:e.message};}
fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({passed:!failure,checks,names,failure,sources:hashes,repository:'explicit mock; actual SQL proved separately',networkCalls:0},null,2));
console.log(JSON.stringify({passed:!failure,checks,failure,receipt:path.join(dir,'receipt.json')}));if(failure)process.exitCode=1;
