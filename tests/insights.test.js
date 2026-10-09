import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInsights,addInterval,dateKey,retainDays,summarize} from '../insights.js';
function setup() {
  let now=new Date(2026,9,9,12).getTime();
  const local={insightConfig:{enabled:true,quietSeconds:60},tasks:[{id:'medical',name:'Medical'}]},session={};
  const area=store=>({async get(){return structuredClone(store);},async set(value){Object.assign(store,structuredClone(value));},async remove(key){delete store[key];}});
  const tab={id:1,active:true,windowId:1,url:'https://claude.ai/chat/test',groupId:4};
  const window={id:1,focused:true};let idle='active';
  const api={runtime:{id:'test'},storage:{local:area(local),session:area(session)},windows:{async getLastFocused(){return window;}},idle:{async queryState(){return idle;}},tabs:{async get(id){return {...tab,id};},async query(){return [tab];},async sendMessage(){}},tabGroups:{async query(){return [{id:4,title:'Medical · Claude'}];}}};
  const tracker=createInsights(api,()=>now);
  const sender={id:'test',frameId:0,url:'https://claude.ai/chat/test',tab:{id:1}};
  return {api,clock:()=>now,local,session,tab,window,sender,tracker,advance(ms){now+=ms;},idle(value){idle=value;},async pulse(mode='quiet',extra={},from=sender){return tracker.handle({type:'insightPulse',mode,...extra},from);},async command(type,extra={}){return tracker.handle({type,...extra},{id:'test'});},total(){return summarize(local.insightDays || {},1,now);}};
}
test('quiet share uses observed Claude time; task durations contain only task IDs',async()=>{
  const h=setup();await h.pulse();h.advance(5000);await h.pulse('composing');h.advance(5000);await h.pulse();
  assert.equal(h.total().quiet,5000);assert.equal(h.total().composing,5000);assert.equal(h.total().claude,10000);assert.deepEqual(h.total().tasks,{medical:10000});
  assert.ok(!JSON.stringify(h.local.insightDays).includes('claude.ai'));
});
test('samples exclude background tabs, unfocused windows, locked screens, and incognito',async()=>{
  for(const condition of ['background','unfocused','locked','incognito']){
    const h=setup();if(condition==='background')h.tab.active=false;if(condition==='unfocused')h.window.focused=false;if(condition==='locked')h.idle('locked');if(condition==='incognito')h.tab.incognito=true;
    await h.pulse();h.advance(5000);await h.pulse();assert.equal(h.total().claude,0,condition);
  }
});
test('system idle counts as quiet rather than proof of distraction',async()=>{
  const h=setup();h.idle('idle');await h.pulse('composing');h.advance(5000);await h.pulse('composing');assert.equal(h.total().quiet,5000);assert.equal(h.total().composing,0);
});
test('sleep gaps are discarded and persisted checkpoints survive worker recreation',async()=>{
  const h=setup();await h.pulse();h.advance(600000);await h.pulse();assert.equal(h.total().claude,0);h.advance(5000);const restarted=createInsights(h.api,h.clock);await restarted.handle({type:'insightPulse',mode:'quiet'},h.sender);assert.equal(h.total().claude,5000);
});
test('popup and Claude never overlap; reopened popup gets a new session',async()=>{
  const h=setup();await h.pulse();h.advance(5000);await h.command('insightPopup',{windowId:1,focused:true,session:'a'});h.advance(5000);
  await h.pulse();await h.command('insightPopup',{windowId:1,focused:true,session:'a'});assert.equal(h.total().organizer,5000);assert.equal(h.total().claude,0);
  h.advance(5000);await h.command('insightPopup',{windowId:1,focused:true,session:'b'});assert.equal(h.total().organizer,5000);
});
test('blur boundary drops a short unobserved gap without wiping switches',async()=>{
  const h=setup();await h.pulse();await h.tracker.handle({type:'insightBoundary'},h.sender);h.advance(5000);await h.pulse();assert.equal(h.total().claude,0);
  await h.tracker.boundary();h.advance(1000);await h.pulse('quiet',{}, {...h.sender,tab:{id:2}});assert.equal(h.total().switches,1);
});
test('prompt attempts are deduplicated and invalid telemetry is rejected',async()=>{
  const h=setup();await h.pulse('interacting',{prompt:true});h.advance(500);await h.pulse('interacting',{prompt:true});assert.equal(h.total().attempts,1);
  await assert.rejects(()=>h.pulse('quiet',{}, {...h.sender,url:'https://evil.test'}),/Invalid/);
  await assert.rejects(()=>h.pulse('bad'),/Invalid/);
});
test('pause clears checkpoint, keeps old totals, and clear resets all counters',async()=>{
  const h=setup();await h.pulse();h.advance(5000);await h.pulse();await h.command('insightSettings',{enabled:false});h.advance(5000);await h.pulse();assert.equal(h.total().claude,5000);
  await h.command('insightClear');assert.equal(h.total().claude,0);assert.equal(h.local.insightConfig.enabled,false);assert.equal(h.local.tasks.length,1);
});
test('interval splits across local midnight and retention keeps exactly 30 dates',()=>{
  const days={},start=new Date(2026,9,8,23,59,58).getTime();addInterval(days,start,start+5000,'quiet','medical');
  assert.equal(days['2026-10-08'].quiet,2000);assert.equal(days['2026-10-09'].quiet,3000);
  for(let i=0;i<40;i++){const date=new Date(2026,9,9);date.setDate(date.getDate()-i);days[dateKey(date)]=days[dateKey(date)] || {};}
  assert.equal(Object.keys(retainDays(days,new Date(2026,9,9).getTime())).length,30);
});
test('focus timer persists deadline independently of analytics and can be cleared',async()=>{
  const h=setup();await h.command('insightSettings',{enabled:false});await h.command('insightTimer',{minutes:25});const end=h.local.focusTimer.endsAt;h.advance(5000);
  assert.equal((await h.command('insightState')).timer.endsAt,end);await h.command('insightTimer',{minutes:0});assert.equal(h.local.focusTimer,undefined);
});
