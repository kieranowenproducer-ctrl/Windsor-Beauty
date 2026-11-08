import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pagePath='src/app/admin/products/page.tsx',helperPath='src/app/admin/products/productEditorDraft.ts';
const page=readFileSync(resolve(root,pagePath),'utf8'),helper=readFileSync(resolve(root,helperPath),'utf8');
const out=resolve(root,'.local-evidence/beauty-admin-parity-20261108/edit-owner-tests',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(out,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');const sources={[pagePath]:hash(page),[helperPath]:hash(helper)};
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(helper,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,Date,JSON});const drafts=mod.exports;
const parsed=ts.createSourceFile(pagePath,page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name,context){let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit);}visit(parsed);if(!found)throw Error('Actual handler missing');return vm.runInNewContext(ts.transpileModule(found.getText(parsed)+`;${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);}
const base={id:'1',slug:'cream',name:'Cream',variants:[{dosage:'50ml',price:18.99}],categories:[]};
const cert={enabled:false,mode:'template',certificateId:'',productName:'',casNumber:'',pubchemCid:'',molecularFormula:'',molecularWeight:'',storage:'',caution:'',externalImages:[],testRows:[],verificationSummary:[],analyticalResults:[]};
const snapshot={editForm:base,editVariants:[{dosage:'50ml',price:'18.99',enabled:true,image:'',shipping:{}}],editShipping:{},editKeywordsInput:'',certDrafts:{'':cert},certFormat:'vial',editStorageInstructions:{mode:'global',content:''},editHidden:false};
let checks=0;const check=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
function fixture(){const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};drafts.writeProductDraft(storage,'A',base,snapshot);drafts.writeProductDraft(storage,'B',base,snapshot);return{storage,map};}
const noop=()=>{};
try{
  const first=fixture();let loaded=0,error='';
  const common={JSON,encodeURIComponent,localStorage:first.storage,clearSavedProductDraft:drafts.clearSavedProductDraft,editingProduct:base,savingEdit:false,confirm:async()=>true,
    draftOwnerRef:{current:'B'},editorSnapshotRef:{current:snapshot},recoveredDraftRef:{current:{slug:'cream',owner:'A',snapshot:JSON.stringify(snapshot)}},setOverrides:noop,setEditError:e=>{error=e;},startEdit:()=>loaded++,fetch:async()=>Response.json({overrides:{cream:base}})};
  await handler('reloadSavedProduct',common)();check(error,'','reload succeeded');check(loaded,1,'actual reload handler invoked');check(drafts.readProductDraft(first.storage,'cream','A')?.snapshot.editForm.name,'Cream','reload in B preserves A original copy');check(first.map.has('wb-product-draft-v1:cream:B'),false,'reload clears only B copy');
  const second=fixture();let closed=false;
  const context={...common,localStorage:second.storage,editingId:'1',products:[base],uploadingCount:0,editGenerationRef:{current:1},draftBaseRef:{current:base},editCertificate:cert,
    editVariants:snapshot.editVariants,certDrafts:snapshot.certDrafts,editForm:base,editShipping:{},editKeywordsInput:'',editStorageInstructions:snapshot.editStorageInstructions,editHidden:false,hiddenSlugs:new Set(),
    EMPTY_CERTIFICATE_DRAFT:cert,roundMoney:n=>n,certificateDraftToPayload:()=>undefined,certificatePayloadHasContent:()=>false,shippingDraftToPayload:()=>undefined,parseKeywordsInput:()=>[],storageInstructionsDraftToPayload:()=>undefined,
    setSavingEdit:noop,setDraftStorageFailed:noop,setEditBaseline:noop,setDraftNotice:noop,setEditingId:value=>{closed=value===null;},applyHidden:async()=>{throw Error('Unchanged visibility must not write');},noteVisibility:noop,writeProductDraft:drafts.writeProductDraft,fetch:async()=>Response.json({product:base})};
  await handler('saveEdit',context)();check(error,'','save succeeded');check(closed,true,'unchanged successful B edit closes');check(drafts.readProductDraft(second.storage,'cream','A')?.snapshot.editForm.name,'Cream','save in B preserves A original copy');check(second.map.has('wb-product-draft-v1:cream:B'),false,'save clears only exact B acknowledged copy');
  writeFileSync(resolve(out,'receipt.json'),JSON.stringify({ok:true,checks,sources,actualExtractedHandlers:['reloadSavedProduct','saveEdit'],externalCalls:0,databasesOpened:0},null,2));console.log(JSON.stringify({ok:true,checks,receipt:resolve(out,'receipt.json')}));
}catch(error){writeFileSync(resolve(out,'receipt.json'),JSON.stringify({ok:false,checks,sources,error:String(error.stack)},null,2));throw error;}
