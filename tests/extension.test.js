import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,isClaude,isWebUrl,matchTask,validateTask,nearestColor} from '../model.js';
import {THEMES} from '../themes.js';
const event = () => ({listeners:[],addListener(fn){this.listeners.push(fn);}});
let storage,session,tabs,groups,nextGroup;
const copy = value => structuredClone(value);
globalThis.chrome = {
  runtime:{id:'test',onMessage:event(),onInstalled:event()},
  storage:{
    local:{async get(){return copy(storage);},async set(value){Object.assign(storage,copy(value));}},
    session:{async get(key){return {[key]:copy(session[key])};},async set(value){Object.assign(session,copy(value));},async remove(key){delete session[key];}}
  },
  tabs:{
    onUpdated:event(),
    async query(query){return copy(tabs.filter(tab=>Object.entries(query).every(([key,value])=>tab[key]===value)));},
    async get(id){const tab=tabs.find(tab=>tab.id===id);if(!tab)throw Error('Tab closed');return copy(tab);},
    async update(id,patch){Object.assign(tabs.find(tab=>tab.id===id),patch);},
    async group({tabIds,groupId,createProperties}){
      if(groupId===undefined){groupId=nextGroup++;groups.push({id:groupId,windowId:createProperties.windowId,collapsed:false});}
      tabs.filter(tab=>tabIds.includes(tab.id)).forEach(tab=>tab.groupId=groupId);return groupId;
    },
    async ungroup(ids){tabs.filter(tab=>[ids].flat().includes(tab.id)).forEach(tab=>tab.groupId=-1);},
    async create({url,windowId,active}){const tab={id:tabs.length+100,url,windowId,active,groupId:-1};tabs.push(tab);return copy(tab);}
  },
  tabGroups:{
    async query(query){return copy(groups.filter(group=>Object.entries(query).every(([key,value])=>group[key]===value)));},
    async update(id,patch){const group=groups.find(group=>group.id===id);if(!group)throw Error('Group closed');Object.assign(group,patch);}
  }
};
await import('../background.js');
const send = (type,extra={}) => new Promise(resolve=>chrome.runtime.onMessage.listeners[0]({type,windowId:1,...extra},{id:'test'},resolve));
beforeEach(()=>{
  storage={tasks:copy(DEFAULTS),autoGroup:false};session={};groups=[];nextGroup=10;
  tabs=[
    {id:1,windowId:1,url:'https://claude.ai/chat/one',title:'Anatomy notes',groupId:-1},
    {id:2,windowId:1,url:'https://claude.ai/chat/two',title:'Algebra practice',groupId:-1},
    {id:3,windowId:2,url:'https://claude.ai/chat/three',title:'Medical study',groupId:-1},
    {id:4,windowId:1,url:'https://example.com/research',title:'Medical research',groupId:-1}
  ];
});
test('Claude detection excludes lookalikes and other protocols',()=>{
  assert.ok(isClaude('https://claude.ai/chat/x'));
  for(const url of ['https://claude.ai.evil.test','http://claude.ai','https://other.test','bad']) assert.equal(isClaude(url),false);
});
test('web tab support accepts other AI tools and rejects privileged URLs',()=>{
  for(const url of ['https://chatgpt.com','https://gemini.google.com','http://localhost:3000']) assert.ok(isWebUrl(url));
  for(const url of ['chrome://settings','file:///tmp/test','javascript:alert(1)','data:text/html,test','about:blank']) assert.equal(isWebUrl(url),false);
});
test('keyword matches are case-insensitive and ambiguous matches remain unassigned',()=>{
  assert.equal(matchTask('ANATOMY notes',DEFAULTS).id,'medical');
  assert.equal(matchTask('Algebra and anatomy',DEFAULTS),null);assert.equal(matchTask('Untitled',DEFAULTS),null);
});
test('task validation rejects duplicate names and invalid colors',()=>{
  assert.throws(()=>validateTask({...DEFAULTS[0],id:undefined},DEFAULTS),/already/);
  assert.throws(()=>validateTask({...DEFAULTS[0],color:'red'},DEFAULTS),/hex/);
  assert.throws(()=>validateTask({...DEFAULTS[0],nativeColor:'black'},DEFAULTS),/browser/);
});
test('v1 preferences migrate without overwriting existing task colors',async()=>{
  const {data}=await send('state');assert.deepEqual(data.tasks,DEFAULTS);assert.equal(data.theme,'paper');assert.deepEqual(data.collections,[]);
});
test('state includes research tabs but excludes other windows and Chrome pages',async()=>{
  tabs.push({id:5,windowId:1,url:'chrome://extensions',groupId:-1});
  assert.deepEqual((await send('state')).data.tabs.map(tab=>tab.id),[1,2,4]);
});
test('assignment reuses mixed groups and isolates browser windows',async()=>{
  await send('assign',{tabId:1,taskId:'medical'});await send('assign',{tabId:4,taskId:'medical'});await send('assign',{tabId:3,taskId:'medical'});
  assert.equal(groups.length,2);assert.equal(tabs[0].groupId,tabs[3].groupId);assert.notEqual(tabs[0].groupId,tabs[2].groupId);assert.equal(groups[0].color,'purple');
});
test('assignment rejects pinned and privileged tabs',async()=>{
  tabs[3].url='chrome://settings';assert.equal((await send('assign',{tabId:4,taskId:'medical'})).ok,false);
  tabs[0].pinned=true;assert.equal((await send('assign',{tabId:1,taskId:'medical'})).ok,false);assert.equal(groups.length,0);
});
test('Claude keyword organization leaves matching research titles alone',async()=>{
  tabs[1].groupId=88;tabs.push({id:5,windowId:1,url:'https://claude.ai/chat/five',title:'Medical algebra',groupId:-1});
  assert.equal((await send('organize')).data.count,1);assert.equal(tabs[1].groupId,88);assert.equal(tabs[2].groupId,-1);assert.equal(tabs[3].groupId,-1);assert.equal(tabs[4].groupId,-1);
});
test('renaming and recoloring updates mixed groups across windows',async()=>{
  await send('assign',{tabId:4,taskId:'medical'});await send('assign',{tabId:3,taskId:'medical'});
  await send('save',{task:{...DEFAULTS[0],name:'Health',nativeColor:'pink'}});
  assert.ok(groups.every(group=>group.title==='Health · Claude'&&group.color==='pink'));
});
test('deleting a task ungroups research and chats without closing tabs',async()=>{
  await send('assign',{tabId:1,taskId:'medical'});await send('assign',{tabId:4,taskId:'medical'});await send('delete',{taskId:'medical'});
  assert.equal(tabs.length,4);assert.equal(tabs[0].groupId,-1);assert.equal(tabs[3].groupId,-1);assert.equal(storage.tasks.length,2);
});
test('concurrent assignments serialize into one native group',async()=>{
  await Promise.all([send('assign',{tabId:1,taskId:'math'}),send('assign',{tabId:2,taskId:'math'})]);assert.equal(groups.length,1);
});
test('bulk moves report closed, pinned, and other-window tabs as skipped',async()=>{
  tabs[1].pinned=true;
  const result=await send('assignMany',{taskId:'medical',tabIds:[1,2,3,4,999,1]});
  assert.deepEqual(result.data,{count:2,skipped:3});assert.equal(tabs[0].groupId,tabs[3].groupId);assert.equal(tabs[2].groupId,-1);
});
test('new chats and research links open inside a task in the background',async()=>{
  await send('new',{taskId:'todo'});assert.equal(tabs.at(-1).url,'https://claude.ai/new');
  await send('new',{taskId:'todo',url:'https://chatgpt.com/'});assert.equal(tabs.at(-1).active,false);assert.equal(groups.length,1);
  const count=tabs.length;assert.equal((await send('new',{taskId:'todo',url:'javascript:alert(1)'})).ok,false);assert.equal(tabs.length,count);
});
test('auto grouping is opt-in, Claude-only, and preserves assignments',async()=>{
  const handler=chrome.tabs.onUpdated.listeners[0];handler(1,{title:'Anatomy notes'},tabs[0]);await send('state');assert.equal(groups.length,0);
  storage.autoGroup=true;handler(4,{title:'Medical research'},tabs[3]);handler(1,{title:'Anatomy notes'},tabs[0]);await send('state');
  assert.equal(tabs[3].groupId,-1);assert.equal(groups[0].title,'Medical · Claude');
  tabs[0].title='Algebra';handler(1,{title:'Algebra'},tabs[0]);await send('state');assert.equal(groups.length,1);
});
test('focus collapses other groups and restores their original states',async()=>{
  await send('assign',{tabId:1,taskId:'medical'});await send('assign',{tabId:2,taskId:'math'});
  groups[0].collapsed=true;groups[1].collapsed=false;
  await send('focus',{taskId:'medical'});assert.equal(groups[0].collapsed,false);assert.equal(groups[1].collapsed,true);
  assert.equal((await send('state')).data.focus.taskId,'medical');
  await send('focus',{taskId:'math'});await send('endFocus');
  assert.equal(groups[0].collapsed,true);assert.equal(groups[1].collapsed,false);assert.equal((await send('state')).data.focus,null);
});
test('focus tolerates closed groups on exit and does not touch other windows',async()=>{
  await send('assign',{tabId:1,taskId:'medical'});await send('assign',{tabId:3,taskId:'math'});
  await send('focus',{taskId:'medical'});assert.equal(groups[1].collapsed,false);
  groups=groups.filter(group=>group.windowId===2);assert.equal((await send('endFocus')).ok,true);
});
test('cannot focus an empty task',async()=>{assert.equal((await send('focus',{taskId:'medical'})).ok,false);assert.deepEqual(session,{});});
test('all twelve themes have valid colors and native mappings',()=>{
  assert.equal(THEMES.length,12);assert.equal(new Set(THEMES.map(theme=>theme.id)).size,12);
  for(const theme of THEMES) for(const color of theme.palette) assert.match(color,/^#[a-f0-9]{6}$/i);
  assert.equal(nearestColor('#ac8bca'),'purple');
});
test('theme changes preserve task colors unless applying palette explicitly',async()=>{
  await send('assign',{tabId:1,taskId:'medical'});
  await send('theme',{themeId:'midnight'});assert.equal(storage.theme,'midnight');assert.deepEqual(storage.tasks,DEFAULTS);assert.equal(groups[0].color,'purple');
  await send('theme',{themeId:'ocean',applyPalette:true});assert.equal(storage.tasks[0].color,THEMES[2].palette[0]);assert.equal(groups[0].color,nearestColor(THEMES[2].palette[0]));
  assert.equal((await send('theme',{themeId:'missing'})).ok,false);
});
test('saving deduplicates exact URLs and keeps all tabs open',async()=>{
  await send('assign',{tabId:1,taskId:'medical'});await send('assign',{tabId:4,taskId:'medical'});
  tabs.push({...tabs[0],id:5});
  const result=await send('saveCollection',{taskId:'medical'});assert.equal(result.data.count,2);assert.equal(tabs.length,5);
  assert.equal(storage.collections[0].links[1].url,'https://example.com/research');assert.equal(storage.collections[0].task.id,'medical');
});
test('collection restore skips links already in target task and is repeatable',async()=>{
  await send('assign',{tabId:1,taskId:'medical'});await send('assign',{tabId:4,taskId:'medical'});await send('saveCollection',{taskId:'medical'});
  const collectionId=storage.collections[0].id;tabs=tabs.filter(tab=>tab.id!==4);
  assert.equal((await send('restoreCollection',{collectionId})).data.count,1);
  assert.equal((await send('restoreCollection',{collectionId})).data.count,0);
  assert.equal(tabs.at(-1).url,'https://example.com/research');
});
test('saved collection recreates a deleted task and leaves unrelated tabs in place',async()=>{
  await send('assign',{tabId:4,taskId:'medical'});await send('saveCollection',{taskId:'medical'});
  const collectionId=storage.collections[0].id;await send('delete',{taskId:'medical'});
  assert.equal((await send('restoreCollection',{collectionId})).data.count,1);
  assert.equal(storage.tasks.length,3);assert.equal(storage.tasks.at(-1).name,'Medical');assert.equal(tabs[3].groupId,-1);
});
test('collections reject unsafe URLs on restore and removal never closes tabs',async()=>{
  storage.collections=[{id:'x',name:'Medical',task:DEFAULTS[0],links:[{url:'javascript:alert(1)'},{url:'file:///test'},{url:'https://example.com/safe'}]}];
  assert.equal((await send('restoreCollection',{collectionId:'x'})).data.count,1);
  const count=tabs.length;await send('deleteCollection',{collectionId:'x'});assert.equal(tabs.length,count);assert.deepEqual(storage.collections,[]);
});
test('collection limits and empty tasks return useful errors without modifying saved data',async()=>{
  assert.equal((await send('saveCollection',{taskId:'medical'})).ok,false);
  storage.collections=Array.from({length:50},(_,id)=>({id:String(id)}));
  const result=await send('saveCollection',{taskId:'medical'});assert.match(result.error,/50/);assert.equal(storage.collections.length,50);
});
test('Claude content scripts cannot invoke management actions or retrieve settings',async()=>{
  const listener=chrome.runtime.onMessage.listeners[0];let called=false;
  const sender={id:'test',frameId:0,url:'https://claude.ai/chat/one',tab:{id:1}};
  assert.equal(listener({type:'delete',taskId:'medical'},sender,()=>{called=true;}),undefined);
  assert.equal(called,false);assert.equal(storage.tasks.length,3);
  const response=await new Promise(resolve=>listener({type:'insightConfig'},sender,resolve));
  assert.deepEqual(response.data,{enabled:false,quietSeconds:60});
  assert.equal(listener({type:'insightConfig'},{...sender,url:'https://evil.test'},()=>{called=true;}),undefined);
});
