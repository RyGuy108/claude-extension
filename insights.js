import {isClaude,groupTitle} from './model.js';

export const INSIGHT_DEFAULTS = {enabled:false,quietSeconds:60};
export const MAX_GAP = 15000;
export function dateKey(time) {
  const date=new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function bucket(days,time) {
  const key=dateKey(time);
  return days[key] ||= {composing:0,interacting:0,quiet:0,organizer:0,attempts:0,switches:0,tasks:{}};
}
export function addInterval(days,start,end,mode,taskId) {
  if(end<=start || end-start>MAX_GAP) return;
  while(start<end) {
    const midnight=new Date(start);midnight.setHours(24,0,0,0);
    const stop=Math.min(end,midnight.getTime()),ms=stop-start;
    const day=bucket(days,start);day[mode]+=ms;
    if(taskId && mode!=='organizer') day.tasks[taskId]=(day.tasks[taskId] || 0)+ms;
    start=stop;
  }
}
export function retainDays(days,now) {
  const cutoff=new Date(now);cutoff.setDate(cutoff.getDate()-29);
  const minimum=dateKey(cutoff);
  return Object.fromEntries(Object.entries(days).filter(([key])=>key>=minimum && key<=dateKey(now)));
}
export function summarize(days,range,now=Date.now()) {
  const cutoff=new Date(now);cutoff.setDate(cutoff.getDate()-(range-1));
  const total={composing:0,interacting:0,quiet:0,organizer:0,attempts:0,switches:0,tasks:{}};
  for(const [key,day] of Object.entries(days)) if(key>=dateKey(cutoff)&&key<=dateKey(now)) {
    for(const metric of ['composing','interacting','quiet','organizer','attempts','switches']) total[metric]+=day[metric] || 0;
    for(const [id,time] of Object.entries(day.tasks || {})) total.tasks[id]=(total.tasks[id] || 0)+time;
  }
  total.claude=total.composing+total.interacting+total.quiet;
  return total;
}
export function createInsights(api,clock=()=>Date.now()) {
  async function config() {
    return {...INSIGHT_DEFAULTS,...(await api.storage.local.get('insightConfig')).insightConfig};
  }
  async function reset() { await api.storage.session.remove('insightRuntime'); }
  async function boundary() {
    const state=(await api.storage.session.get('insightRuntime')).insightRuntime;
    if(state) {delete state.last;delete state.popupAt;await api.storage.session.set({insightRuntime:state});}
  }
  async function trustedContent(sender) {
    return sender.id===api.runtime.id && sender.frameId===0 && isClaude(sender.url) && sender.tab?.id!=null && !sender.tab.incognito;
  }
  async function sample(message,sender,options) {
    const now=clock();
    const state=(await api.storage.session.get('insightRuntime')).insightRuntime || {};
    const window=await api.windows.getLastFocused();
    if(!window.focused || window.incognito) {await reset();return {};}
    const idle=await api.idle.queryState(options.quietSeconds);
    if(idle==='locked') {await reset();return {};}
    let source,mode,taskId;
    if(message.type==='insightPopup') {
      if(message.windowId!==window.id || message.focused!==true) return {};
      if(typeof message.session!=='string' || !/^[a-zA-Z0-9-]{1,64}$/.test(message.session)) throw new Error('Invalid organizer session.');
      source=`popup:${message.session}`; mode='organizer';state.popupAt=now;
    } else {
      if(!await trustedContent(sender)) throw new Error('Invalid activity source.');
      const tab=await api.tabs.get(sender.tab.id);
      if(!tab.active || tab.windowId!==window.id || tab.incognito || !isClaude(tab.url)) return {};
      if(state.popupAt && now-state.popupAt<6000) return {};
      if(!['composing','interacting','quiet'].includes(message.mode)) throw new Error('Invalid activity signal.');
      source=String(tab.id);mode=idle==='idle'?'quiet':message.mode;
      const tasks=(await api.storage.local.get('tasks')).tasks || [];
      if(tab.groupId!==-1) {
        const groups=await api.tabGroups.query({windowId:window.id});
        const group=groups.find(item=>item.id===tab.groupId);
        taskId=tasks.find(task=>group?.title===groupTitle(task))?.id;
      }
    }
    const stored=await api.storage.local.get('insightDays');
    const days=retainDays(stored.insightDays || {},now);
    if(state.last?.source===source) addInterval(days,state.last.at,now,state.last.mode,state.last.taskId);
    if(mode!=='organizer') {
      if(state.chat && state.chat.source!==source && now-state.chat.at<30000) bucket(days,now).switches++;
      state.chat={source,at:now};
      if(message.prompt===true && (!state.promptAt || now-state.promptAt>=1500)) {bucket(days,now).attempts++;state.promptAt=now;}
    }
    state.last={at:now,source,mode,taskId};
    await api.storage.local.set({insightDays:days});
    await api.storage.session.set({insightRuntime:state});
    return {};
  }
  async function handle(message,sender) {
    const options=await config();
    switch(message.type) {
      case 'insightConfig':
        if(!await trustedContent(sender)) throw new Error('Invalid activity source.');
        return options;
      case 'insightBoundary': {
        if(!await trustedContent(sender)) throw new Error('Invalid activity source.');
        const runtime=(await api.storage.session.get('insightRuntime')).insightRuntime;
        if(runtime?.last?.source===String(sender.tab.id)) {delete runtime.last;await api.storage.session.set({insightRuntime:runtime});}
        return {};
      }
      case 'insightPulse':
      case 'insightPopup':
        if(!options.enabled) return {};
        return sample(message,sender,options);
      case 'insightState': {
        const stored=await api.storage.local.get(['insightDays','focusTimer']);
        const days=retainDays(stored.insightDays || {},clock());
        if(Object.keys(days).length!==Object.keys(stored.insightDays || {}).length) await api.storage.local.set({insightDays:days});
        return {config:options,days,timer:stored.focusTimer || null};
      }
      case 'insightSettings': {
        const update={...options};
        if(typeof message.enabled==='boolean') update.enabled=message.enabled;
        if(message.quietSeconds!==undefined) {
          if(![30,60,120].includes(message.quietSeconds)) throw new Error('Choose a supported inactivity threshold.');
          update.quietSeconds=message.quietSeconds;
        }
        await reset();await api.storage.local.set({insightConfig:update});
        const tabs=await api.tabs.query({});
        await Promise.allSettled(tabs.filter(tab=>isClaude(tab.url)&&!tab.incognito).map(tab=>api.tabs.sendMessage(tab.id,{type:'insightConfigChanged'})));
        return {};
      }
      case 'insightClear':
        await reset();await api.storage.local.set({insightDays:{}});return {};
      case 'insightTimer': {
        if(message.minutes===0) {await api.storage.local.remove('focusTimer');return {};}
        if(![15,25,45].includes(message.minutes)) throw new Error('Choose a 15, 25, or 45 minute block.');
        await api.storage.local.set({focusTimer:{endsAt:clock()+message.minutes*60000,minutes:message.minutes}});return {};
      }
      default:throw new Error('Unknown insight action.');
    }
  }
  return {handle,reset,boundary};
}
