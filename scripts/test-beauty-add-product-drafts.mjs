import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),sources={};
const out=resolve(root,'.local-evidence/beauty-admin-parity-20261108/product-add-tests',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(out,{recursive:true});
let checks=0;const check=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
function load(path,deps={},globals={}) {
  const source=readFileSync(resolve(root,path),'utf8');sources[path]=createHash('sha256').update(source).digest('hex');
  const module={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:name=>{if(!(name in deps))throw Error('Unmapped '+name);return deps[name];},Date,JSON,Response,console,...globals});return module.exports;
}
const jsx={'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null}};
const model=load('src/data/productModel.ts');
const shipping=load('src/components/admin/ShippingFields.tsx',{'@/data/products':model,...jsx});
const variants=load('src/components/admin/VariantEditor.tsx',{'./ImageUploadField':()=>null,'./ShippingFields':shipping,...jsx});
const forms=load('src/app/admin/products/productDrafts.ts',{'@/lib/markdownLite':{htmlToMarkdownLite:x=>x},'@/components/admin/VariantEditor':variants,'@/components/admin/ShippingFields':shipping,'@/lib/certificateStandards':{isUntouchedStandardTestRow:()=>false,isUntouchedStandardSummaryRow:()=>false}});
const drafts=load('src/app/admin/products/productAddDraft.ts');
const money=load('src/lib/money.ts');
const map=new Map();let blocked=false;
const storage={getItem:key=>{if(blocked)throw Error('blocked');return map.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error('blocked');map.set(key,value);},removeItem:key=>{if(blocked)throw Error('blocked');map.delete(key);},key:i=>[...map.keys()][i]??null,get length(){return map.size;}};
let ownerNo=0,calls=0,confirmResult=true,server=async()=>Response.json({error:'synthetic'}, {status:503}),lastBody;
function hook() {
  const cells=[],effects=[];let cursor=0,changed=false,api,overrides={};const listeners=new Map();
  const react={
    useState:initial=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>{const next=typeof value==='function'?value(cells[i]):value;if(!Object.is(next,cells[i])){cells[i]=next;changed=true;}}];},
    useRef:value=>{const i=cursor++;if(!(i in cells))cells[i]={current:value};return cells[i];},
    useEffect:(fn,deps)=>{const i=cursor++,before=cells[i];if(!before||deps.some((v,j)=>!Object.is(v,before.deps[j]))){effects.push(()=>{before?.cleanup?.();cells[i]={deps,cleanup:fn()};});}},
  };
  const mod=load('src/app/admin/products/useAddProduct.ts',{'react':react,'@/lib/money':money,'@/components/admin/VariantEditor':variants,'@/components/admin/ShippingFields':shipping,'@/components/admin/ConfirmProvider':{useConfirm:()=>async()=>confirmResult},'./productDrafts':forms,'./productAddDraft':drafts},
    {localStorage:storage,crypto:{randomUUID:()=>`document-${++ownerNo}`},window:{addEventListener:(key,value)=>listeners.set(key,value),removeEventListener:key=>listeners.delete(key)},fetch:async(url,init)=>{check(url,'/api/admin/products/catalogue','only existing create endpoint');calls++;lastBody=JSON.parse(init.body);return server();}});
  const render=()=>{for(let guard=0;guard<20;guard++){changed=false;cursor=0;api=mod.useAddProduct({products:Object.values(overrides),uploadingCount:0,setOverrides:fn=>{overrides=fn(overrides);changed=true;}});while(effects.length)effects.shift()();if(!changed)return api;}throw Error('Hook did not settle');};
  return {render,get api(){return api;},unmount:()=>cells.forEach(c=>c?.cleanup?.()),listeners};
}
try {
  const form=structuredClone(forms.EMPTY_ADD_FORM);form.name='Review cream';form.slug='review-cream';form.variants[0].dosage='50ml';form.variants[0].price='18.';
  check(drafts.writeAddProductDraft(storage,'first',{form,slugTouched:true}),true,'incomplete price persisted');
  check(drafts.readAddProductDraft(storage,'first').form.variants[0].price,'18.','raw incomplete price preserved');
  const newer=structuredClone(form);newer.name='Newer typing';drafts.writeAddProductDraft(storage,'second',{form:newer,slugTouched:false});
  check(drafts.readAddProductDraft(storage,'first').form.name,'Review cream','two owners isolated');
  check(drafts.clearAddProductDraft(storage,'second',JSON.stringify({form,slugTouched:true})),false,'old acknowledgement cannot delete newer draft');
  map.clear();storage.setItem('wb-new-product-draft-v1:bad',JSON.stringify({version:1,savedAt:new Date().toISOString(),slugTouched:false,form:{...form,variants:null}}));
  check(drafts.readAddProductDraft(storage,'x'),null,'malformed form refused');map.clear();
  blocked=true;check(drafts.readAddProductDraft(storage,'x'),null,'blocked read safe');check(drafts.writeAddProductDraft(storage,'x',{form,slugTouched:false}),false,'blocked write reported');blocked=false;
  // Two actual hook instances: B may restore A, but B never owns A's copy.
  const ownerA=hook();ownerA.render();ownerA.api.setAddForm(form);ownerA.render();
  const ownerB=hook();ownerB.render();check(ownerB.api.addForm.name,'Review cream','second document restores first draft');
  confirmResult=true;await ownerB.api.discardAddDraft();ownerB.render();ownerA.unmount();ownerB.unmount();
  const reloadA=hook();reloadA.render();check(reloadA.api.addForm.name,'Review cream','discard in B preserves unchanged A draft across reload');reloadA.unmount();map.clear();
  const createA=hook();createA.render();createA.api.setAddForm(form);createA.render();
  const createB=hook();createB.render();server=async()=>Response.json({product:{...lastBody.product,id:'98'}});
  await createB.api.submitAddProduct({preventDefault(){}});createB.render();createA.unmount();createB.unmount();
  const afterCreateA=hook();afterCreateA.render();check(afterCreateA.api.addForm.name,'Review cream','create in B preserves unchanged A draft across reload');afterCreateA.unmount();map.clear();
  const a=hook();a.render();a.api.setShowAddForm(true);a.api.setAddForm(form);a.api.setAddSlugTouched(true);a.render();
  check(a.listeners.has('beforeunload'),true,'dirty form warns before leaving');
  await a.api.resetAddForm();a.render();check(a.api.showAddForm,false,'close works');check(a.api.addForm.name,'Review cream','close keeps in-memory draft');check(map.size,1,'close keeps browser copy');a.unmount();
  const b=hook();b.render();check(b.api.showAddForm,true,'reload restores visible form');check(b.api.addForm.variants[0].price,'18.','reload retains partial input');
  b.api.updateAddName('Renamed');b.render();check(b.api.addForm.slug,'review-cream','manually chosen slug restored');
  confirmResult=false;await b.api.discardAddDraft();b.render();check(b.api.addForm.name,'Renamed','cancel discard preserves work');
  blocked=true;await b.api.resetAddForm();b.render();check(b.api.showAddForm,true,'storage failure and cancelled close keep editor open');blocked=false;
  let resolveReply;server=()=>new Promise(resolve=>{resolveReply=resolve;});
  const first=b.api.submitAddProduct({preventDefault(){}});b.render();
  const initialCalls=calls;await b.api.submitAddProduct({preventDefault(){}});check(calls,initialCalls,'repeated create while pending has one request');
  check(lastBody.product.variants[0].price,18,'existing explicit create price parsing unchanged');check(lastBody.product.slug,'review-cream','existing slug unchanged');
  b.api.setAddForm(prev=>({...prev,shortDescription:'Typed while creating'}));b.render();
  resolveReply(Response.json({product:{...lastBody.product,id:'99'}}));await first;b.render();
  check(b.api.addForm.shortDescription,'Typed while creating','successful create preserves newer typing');check(b.api.showAddForm,true,'newer draft stays open');check(b.api.addDraftNotice.includes('product was created'),true,'actual commit distinguished from draft');
  const beforeRetry=calls;await b.api.submitAddProduct({preventDefault(){}});b.render();check(calls,beforeRetry,'existing saved slug cannot be created again');
  confirmResult=true;await b.api.discardAddDraft();b.render();check(b.api.addForm.name,'','explicit discard resets only form');check(map.size,1,'discard removes current copy but retains first document recovery');b.unmount();map.clear();
  const c=hook();c.render();c.api.setShowAddForm(true);c.api.setAddForm({...form,slug:'second-cream'});c.render();server=async()=>Response.json({error:'Session expired'}, {status:401});
  await c.api.submitAddProduct({preventDefault(){}});c.render();check(c.api.addForm.name,'Review cream','401 preserves form');check(c.api.addError.includes('expired'),true,'existing session guidance retained');
  server=async()=>Response.json({product:{...lastBody.product,id:'100'}});await c.api.submitAddProduct({preventDefault(){}});c.render();check(c.api.showAddForm,false,'exact acknowledged creation closes');check(c.api.addForm.name,'','exact acknowledged creation resets');check(map.size,0,'exact acknowledged creation retires draft');c.unmount();
  writeFileSync(resolve(out,'receipt.json'),JSON.stringify({ok:true,checks,sources,externalCalls:0,databasesOpened:0,actualHook:true,limitations:'Controlled hook scheduler and captured create transport; compiled browser proof remains.'},null,2));console.log(JSON.stringify({ok:true,checks,receipt:resolve(out,'receipt.json')}));
}catch(error){writeFileSync(resolve(out,'receipt.json'),JSON.stringify({ok:false,checks,sources,error:String(error.stack)},null,2));throw error;}
