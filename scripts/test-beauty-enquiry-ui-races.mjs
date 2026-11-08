import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual component callbacks and hooks. Only its final JSX is replaced
// by a test API; no callback bodies are copied, rewritten or reimplemented here.
// Effects (polling/unload) and browser painting are outside this deterministic test.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const path='src/app/admin/enquiries/page.tsx';
const source=readFileSync(resolve(root,path),'utf8');
const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='AdminEnquiriesPage');
const terminalReturn=component?.body?.statements.findLast(node=>ts.isReturnStatement(node));
assert(terminalReturn,'Component final render must be found');
const testApi=`return {restoreDraft,saveDraft,sendReply,prepareAutomatedDraft,toggleEnquiry,load,
drafts,draftFormats,orderDrafts,automatedDrafts,draftReady,draftBusyId,sendingId,openId,replyFeedbacks,
enquiries,nextOffset,loading,loadingMore,error,draftVersions,draftEditGeneration,draftWork,
setDrafts,setDraftReady,setOpenId,setFilter,setSource};`;
const transformed=source.slice(0,terminalReturn.getStart(ast))+testApi+source.slice(terminalReturn.end);
const compiled=ts.transpileModule(transformed,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
let checks=0;
function check(actual,expected,note){assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),note);checks++;}
function harness(){
  const cells=[];let cursor=0,api,confirmResult=true,confirms=0;
  const calls=[];
  const react={
    useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
    useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
    useEffect(){cursor++;},
    useCallback(fn,deps){const i=cursor++,before=cells[i];if(!before||deps.some((v,j)=>!Object.is(v,before.deps[j])))cells[i]={fn,deps};return cells[i].fn;},
  };
  const module={exports:{}};
  const dependencies={react,'react/jsx-runtime':{jsx(){},jsxs(){}},
    '@/lib/email/contactAddress':{BEAUTY_CONTACT_EMAIL:'suite@example.invalid'},
    '@/components/admin/AdminStickyControls':()=>null,'@/components/admin/AdminSidebar':()=>null,
    '@/lib/email/greeting':{emailGreetingName:()=> 'Test'},
    '@/lib/email/inboundRouting':{visibleInboundEmailText:value=>value},
    '@/lib/adminEnquiryPolling':{refreshAdminEnquiryCount(){}},
  };
  vm.runInNewContext(compiled,{module,exports:module.exports,require:name=>{if(!(name in dependencies))throw Error('Unmapped dependency '+name);return dependencies[name];},
    Date,JSON,console,window:{confirm:()=>{confirms++;return confirmResult;}},
    fetch:(url,options={})=>new Promise((resolve,reject)=>calls.push({url,options,resolve:(data,status=200)=>resolve({ok:status>=200&&status<300,json:async()=>data}),reject})),
  },{filename:path});
  const render=()=>{cursor=0;api=module.exports.default();return api;};
  return {render,calls,get api(){return api;},get confirms(){return confirms;},set confirm(value){confirmResult=value;},
    seed(id,text='Staff draft',revision=2){render();api.draftVersions.current[id]={revision,baseReplyId:0};api.setDraftReady(prev=>({...prev,[id]:true}));api.setDrafts(prev=>({...prev,[id]:text}));render();},
    type(id,text){api.draftEditGeneration.current[id]=(api.draftEditGeneration.current[id]??0)+1;api.setDrafts(prev=>({...prev,[id]:text}));render();},
  };
}
const a={id:1,email:'a@example.invalid'},b={id:2,email:'b@example.invalid'};
const saved=(payload={message:'Saved reply',format:'standard'},revision=2)=>({draft:{revision,payload,latest_reply_id:0,base_reply_id:0}});
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

// A restore owns the global draft operation until every nested request completes.
{
  const h=harness();h.render();const pending=h.api.restoreDraft(a);h.render();
  check(h.api.draftBusyId,1,'restore marks correct enquiry busy');
  h.api.toggleEnquiry(b);await h.api.prepareAutomatedDraft(b,true);await h.api.saveDraft(b);
  check(h.calls.length,1,'other restore/refresh/save cannot start over active restore');
  h.calls[0].resolve(saved());await pending;h.render();
  check(h.api.drafts[1],'Saved reply','restore applies saved reply');
  check(h.api.draftBusyId,null,'owned restore releases busy state');
  check(h.api.draftVersions.current[1],{revision:2,baseReplyId:0},'restore tracks saved revision');
}
{
  const h=harness();h.render();const pending=h.api.restoreDraft(a);h.type(1,'Newer typed reply');
  h.calls[0].resolve(saved());await pending;h.render();
  check(h.api.drafts[1],'Newer typed reply','late restore cannot overwrite newer typing');
  check(h.api.draftReady[1]??false,false,'stale restore cannot mark unsynchronised draft ready');
}
{
  const h=harness();h.seed(1);h.confirm=false;await h.api.restoreDraft(a,true);
  check(h.calls.length,0,'cancel replacing saved draft makes no request');
  check(h.api.drafts[1],'Staff draft','cancel keeps manual text');
  const nested=harness();nested.render();const pending=nested.api.restoreDraft(a);
  nested.calls[0].resolve(saved(null,0));await tick();nested.render();
  check(nested.calls.length,2,'empty restore starts actual automatic order lookup');
  check(nested.api.draftBusyId,1,'outer operation remains busy during nested order lookup');
  nested.api.toggleEnquiry(b);check(nested.calls.length,2,'nested lookup prevents another enquiry restore');
  nested.calls[1].resolve({draft:{format:'standard',message:'Prepared reply'}});await pending;nested.render();
  check(nested.api.drafts[1],'Prepared reply','nested response populates composer');
  check(nested.api.draftBusyId,null,'nested operation releases only after both requests');
}
// Saved text is protected while PUT is pending, including on a stale-write failure.
{
  const h=harness();h.seed(1);const pending=h.api.saveDraft(a);h.render();
  await h.api.prepareAutomatedDraft(a,true);await h.api.restoreDraft(a,true);h.api.toggleEnquiry(b);
  check(h.calls.length,1,'save excludes refresh, restore and enquiry switching');
  check(JSON.parse(h.calls[0].options.body).revision,2,'PUT carries actual optimistic revision');
  h.calls[0].resolve({error:'A colleague saved newer work'},409);check(await pending,null,'stale save reports failure');h.render();
  check(h.api.drafts[1],'Staff draft','stale save keeps unsent text');
  check(h.api.draftVersions.current[1].revision,2,'stale save does not invent revision');
  check(h.api.replyFeedbacks[1].tone,'error','stale save shows feedback');
  h.confirm=false;await h.api.saveDraft(a,true);check(h.calls.length,1,'cancel discard cannot clear stored draft');
}
{
  const h=harness();h.seed(1);const pending=h.api.saveDraft(a);h.calls[0].resolve(saved(null,3));
  check(await pending,{revision:3,baseReplyId:0},'save returns next revision for sending');h.render();
  check(h.api.drafts[1],'Staff draft','save leaves composer text intact');
  check(h.api.draftBusyId,null,'save releases its operation');
}
// Check again must confirm replacement and cannot let a late response win an edit.
{
  const h=harness();h.seed(1);h.confirm=false;await h.api.prepareAutomatedDraft(a,true);
  check(h.calls.length,0,'cancel check-again protects manual reply');check(h.confirms,1,'check-again asks before replacement');
  h.confirm=true;const pending=h.api.prepareAutomatedDraft(a,true);h.render();
  h.type(1,'Newer edit');h.calls[0].resolve({draft:{format:'standard',message:'Obsolete generated reply'}});await pending;h.render();
  check(h.api.drafts[1],'Newer edit','late automatic draft cannot replace newer edit');
  check(h.api.draftBusyId,null,'stale generation still releases its own operation');
}
// Send saves first, blocks replacement throughout, and never invites resend after
// provider acceptance with a database recording warning.
{
  const h=harness();h.seed(1);const pending=h.api.sendReply(a);h.render();
  check(h.api.sendingId,1,'send marks current enquiry');
  check(h.calls[0].options.method,'PUT','send persists current reply before delivery');
  h.calls[0].resolve(saved(null,3));await tick();h.render();
  check(h.calls.length,2,'accepted save starts one actual send');
  check(JSON.parse(h.calls[1].options.body).draftRevision,3,'send references acknowledged revision');
  await h.api.prepareAutomatedDraft(a,true);await h.api.restoreDraft(a,true);h.api.toggleEnquiry(b);await h.api.sendReply(a);
  check(h.calls.length,2,'sending blocks generation, restore, switching and repeat send');
  h.calls[1].resolve({success:true,recorded:false,draftCleared:true,providerMessageId:'synthetic-delivery',warning:'Email sent. Do not send it again.'});await tick();
  check(h.calls.length,3,'accepted send refreshes enquiry list');h.calls[2].resolve({enquiries:[],nextOffset:null});await pending;h.render();
  check(h.api.drafts[1],'','accepted send clears local composer');
  check(h.api.draftVersions.current[1]??null,null,'accepted send cannot reuse stale version');
  check(h.api.replyFeedbacks[1].tone,'warning','accepted but unrecorded email stays warning');
  check(h.api.replyFeedbacks[1].text.includes('Do not send it again.'),true,'recording warning prevents unsafe resend instruction');
  check(h.api.sendingId,null,'send releases state after refresh');
}
{
  const h=harness();h.seed(1);const pending=h.api.sendReply(a);h.calls[0].resolve({error:'Newer reply'},409);await pending;h.render();
  check(h.calls.length,1,'failed save cannot send');check(h.api.drafts[1],'Staff draft','failed save retains response');
}
// A slow old page or failed refresh cannot replace the newer view.
{
  const h=harness();h.render();const older=h.api.load();const newer=h.api.load();
  h.calls[1].resolve({enquiries:[{id:2}],nextOffset:200});await newer;h.render();
  h.calls[0].resolve({error:'Old server failure'},500);await older;h.render();
  check(h.api.enquiries,[{id:2}],'late failed load preserves newer results');check(h.api.error,'','late failed load does not add obsolete error');
  check(h.api.nextOffset,200,'late load preserves next page position');
  const more=h.api.load(false,200);h.calls[2].resolve({enquiries:[{id:2,updated:true},{id:3}],pinned:{id:1},nextOffset:null});await more;h.render();
  check(h.api.enquiries,[{id:2,updated:true},{id:3},{id:1}],'pagination merges without duplicates and retains open pinned case');
  check(h.api.loadingMore,false,'pagination releases loading state');
}
// Load more refreshes existing cases in place. In particular, appending a pinned
// open urgent case from the response must not move that case below older rows.
{
  const h=harness();h.render();const first=h.api.load();
  h.calls[0].resolve({enquiries:[{id:1,subject:'Open urgent case',status:'new'},{id:2,subject:'Existing case'},{id:4,subject:'Untouched case'}],nextOffset:200});
  await first;h.render();h.api.setOpenId(1);h.render();
  const more=h.api.load(false,200);
  h.calls[1].resolve({enquiries:[{id:2,subject:'Existing case updated'},{id:3,subject:'Next page new case'}],pinned:{id:1,subject:'Open urgent case refreshed',status:'new'},nextOffset:null});
  await more;h.render();
  check(h.api.enquiries.map(item=>item.id),[1,2,4,3],'load more keeps existing order and appends only new IDs');
  check(h.api.enquiries[0].subject,'Open urgent case refreshed','pinned case content refreshes in its original position');
  check(h.api.enquiries[1].subject,'Existing case updated','repeated page ID updates in its original position');
  check(h.api.enquiries[2].subject,'Untouched case','unreturned existing case stays in place');
  check(new Set(h.api.enquiries.map(item=>item.id)).size,4,'pinned and repeated IDs never duplicate rows');
  check(h.api.openId,1,'load more preserves the open case');
}
const evidence=resolve(root,'.local-evidence/beauty-admin-parity-20261108/enquiry-ui-races');mkdirSync(evidence,{recursive:true});
writeFileSync(resolve(evidence,'RECEIPT.json'),JSON.stringify({at:new Date().toISOString(),checks,source:path,sha256:createHash('sha256').update(source).digest('hex'),scope:'Actual transpiled component callback/hook tests with controlled fetch promises. No network, email, database or browser effects.',excluded:['Rendered browser UI','Polling effects','Real providers']},null,2)+'\n');
console.log(`${checks} Beauty enquiry UI race checks passed. No network or email used.`);
