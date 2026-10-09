import {DEFAULTS, isClaude, isWebUrl, groupTitle, validateTask, matchTask, nearestColor} from './model.js';
import {THEMES} from './themes.js';
import {createInsights} from './insights.js';
const insights=createInsights(chrome);

// One mutation at a time avoids duplicate native groups and lost storage updates.
let queue = Promise.resolve();
function serialize(fn) {
  const next = queue.then(fn);
  queue = next.catch(() => {});
  return next;
}
async function settings() {
  const value = await chrome.storage.local.get(['tasks','autoGroup','theme','collections']);
  if (!value.tasks) {
    value.tasks = structuredClone(DEFAULTS);
    await chrome.storage.local.set({tasks:value.tasks});
  }
  return {tasks:value.tasks, autoGroup:!!value.autoGroup, theme:value.theme || 'paper', collections:value.collections || []};
}
async function webTabs(windowId) {
  return (await chrome.tabs.query(windowId == null ? {} : {windowId})).filter(tab => isWebUrl(tab.url || tab.pendingUrl));
}
async function taskGroups(task, windowId) {
  // Keep the v1 title convention so existing and session-restored groups still work.
  return (await chrome.tabGroups.query(windowId == null ? {} : {windowId})).filter(group => group.title === groupTitle(task));
}
async function assign(tabId, task) {
  const tab = await chrome.tabs.get(tabId);
  if (!isWebUrl(tab.url || tab.pendingUrl)) throw new Error('Choose a regular website tab. Chrome pages and local files cannot be added.');
  if (tab.pinned) throw new Error('Unpin this tab in Chrome before grouping it.');
  if (!task) { await chrome.tabs.ungroup(tabId); return; }
  const existing = (await taskGroups(task, tab.windowId))[0];
  const groupId = await chrome.tabs.group(existing
    ? {tabIds:[tabId],groupId:existing.id}
    : {tabIds:[tabId],createProperties:{windowId:tab.windowId}});
  await chrome.tabGroups.update(groupId,{title:groupTitle(task),color:task.nativeColor});
}
async function members(task, windowId) {
  const ids = new Set((await taskGroups(task,windowId)).map(group => group.id));
  return (await webTabs(windowId)).filter(tab => ids.has(tab.groupId));
}
const focusKey = windowId => `focus:${windowId}`;
async function focusState(windowId) {
  return (await chrome.storage.session.get(focusKey(windowId)))[focusKey(windowId)] || null;
}
async function endFocus(windowId) {
  const previous = await focusState(windowId);
  if (!previous) return;
  const live = await chrome.tabGroups.query({windowId});
  for (const group of previous.groups) {
    // Group IDs are session-scoped; session storage clears when the browser exits.
    if (live.some(current => current.id === group.id)) await chrome.tabGroups.update(group.id,{collapsed:group.collapsed});
  }
  await chrome.storage.session.remove(focusKey(windowId));
}
async function dispatch(message) {
  const config = await settings();
  const task = config.tasks.find(item => item.id === message.taskId);
  if (['new','collapse','delete','focus','saveCollection'].includes(message.type) && !task) throw new Error('This task no longer exists.');
  switch (message.type) {
    case 'state':
      return {...config,tabs:await webTabs(message.windowId),groups:await chrome.tabGroups.query({windowId:message.windowId}),focus:await focusState(message.windowId)};
    case 'assign':
      if (message.taskId && !task) throw new Error('This task no longer exists.');
      await assign(message.tabId,task);
      break;
    case 'assignMany': {
      if (!task) throw new Error('Choose a task for these tabs.');
      const ids = [...new Set(message.tabIds || [])];
      if (!ids.length || ids.length > 200) throw new Error('Select between 1 and 200 tabs.');
      let count = 0;
      // A closed or pinned tab should not prevent the remaining selections moving.
      for (const id of ids) {
        try {
          const tab = await chrome.tabs.get(id);
          if (tab.windowId !== message.windowId) continue;
          await assign(id,task);
          count++;
        } catch { /* Report skipped tabs to the popup. */ }
      }
      return {count,skipped:ids.length-count};
    }
    case 'new': {
      const url = message.url?.trim() || 'https://claude.ai/new';
      if (!isWebUrl(url)) throw new Error('Enter a complete http:// or https:// link.');
      const tab = await chrome.tabs.create({url,windowId:message.windowId,active:false});
      await assign(tab.id,task);
      break;
    }
    case 'collapse':
      for (const group of await taskGroups(task,message.windowId)) await chrome.tabGroups.update(group.id,{collapsed:message.collapsed});
      break;
    case 'focus': {
      const targetGroups = await taskGroups(task,message.windowId);
      const targetTabs = await members(task,message.windowId);
      if (!targetTabs.length) throw new Error('Add a tab to this task before focusing.');
      const groups = await chrome.tabGroups.query({windowId:message.windowId});
      const previous = await focusState(message.windowId);
      const original = previous?.groups || [];
      for (const group of groups) if (!original.some(saved => saved.id===group.id)) original.push({id:group.id,collapsed:group.collapsed});
      await chrome.storage.session.set({[focusKey(message.windowId)]:{taskId:task.id,groups:original}});
      // Activate a target first, otherwise Chrome may keep the previous active group expanded.
      await chrome.tabs.update(targetTabs[0].id,{active:true});
      for (const group of groups) await chrome.tabGroups.update(group.id,{collapsed:!targetGroups.some(target=>target.id===group.id)});
      break;
    }
    case 'endFocus': await endFocus(message.windowId); break;
    case 'save': {
      const old = config.tasks.find(item => item.id===message.task.id);
      if (message.task.id && !old) throw new Error('This task no longer exists.');
      if (!old && config.tasks.length >= 24) throw new Error('You can have up to 24 tasks.');
      const updated = validateTask(message.task,config.tasks);
      if (old) for (const group of await taskGroups(old)) await chrome.tabGroups.update(group.id,{title:groupTitle(updated),color:updated.nativeColor});
      await chrome.storage.local.set({tasks:old ? config.tasks.map(item=>item.id===old.id?updated:item) : [...config.tasks,updated]});
      break;
    }
    case 'delete':
      for (const group of await taskGroups(task)) {
        const tabs = await chrome.tabs.query({groupId:group.id});
        if (tabs.length) await chrome.tabs.ungroup(tabs.map(tab=>tab.id));
      }
      await chrome.storage.local.set({tasks:config.tasks.filter(item=>item.id!==task.id)});
      break;
    case 'theme': {
      const theme = THEMES.find(item => item.id===message.themeId);
      if (!theme) throw new Error('Choose an available theme.');
      const update = {theme:theme.id};
      if (message.applyPalette) {
        update.tasks = config.tasks.map((item,index) => {
          const color = theme.palette[index % theme.palette.length];
          return {...item,color,nativeColor:nearestColor(color)};
        });
        for (const item of update.tasks) for (const group of await taskGroups(item)) await chrome.tabGroups.update(group.id,{color:item.nativeColor});
      }
      await chrome.storage.local.set(update);
      break;
    }
    case 'saveCollection': {
      if (config.collections.length >= 50) throw new Error('Your shelf has 50 collections. Remove one before saving another.');
      const tabs = await members(task,message.windowId);
      if (!tabs.length) throw new Error('Add tabs to this task before saving it.');
      if (tabs.length > 200) throw new Error('A collection can contain up to 200 links. Split this task before saving.');
      const seen = new Set();
      const links = tabs.filter(tab => {
        const url = tab.url || tab.pendingUrl;
        if (seen.has(url)) return false;
        seen.add(url); return true;
      }).map(tab=>({url:tab.url || tab.pendingUrl,title:(tab.title || '').slice(0,300)}));
      const collection = {id:crypto.randomUUID(),name:task.name,task:{...task},savedAt:Date.now(),links};
      await chrome.storage.local.set({collections:[collection,...config.collections]});
      return {count:links.length};
    }
    case 'restoreCollection': {
      const collection = config.collections.find(item=>item.id===message.collectionId);
      if (!collection) throw new Error('That collection no longer exists.');
      let destination = config.tasks.find(item=>item.id===collection.task.id || item.name.toLowerCase()===collection.task.name.toLowerCase());
      if (!destination) {
        if (config.tasks.length >= 24) throw new Error('Make room for the saved task before restoring it (24-task limit).');
        destination = validateTask({...collection.task,id:undefined},config.tasks);
        await chrome.storage.local.set({tasks:[...config.tasks,destination]});
      }
      const inTask = new Set((await members(destination,message.windowId)).map(tab=>tab.url || tab.pendingUrl));
      let count = 0;
      for (const link of collection.links) {
        if (!isWebUrl(link.url) || inTask.has(link.url)) continue;
        const tab = await chrome.tabs.create({url:link.url,windowId:message.windowId,active:false});
        await assign(tab.id,destination);
        inTask.add(link.url);
        count++;
      }
      return {count};
    }
    case 'deleteCollection':
      await chrome.storage.local.set({collections:config.collections.filter(item=>item.id!==message.collectionId)});
      break;
    case 'auto': await chrome.storage.local.set({autoGroup:!!message.enabled}); break;
    case 'organize': {
      let count=0;
      // Automation remains Claude-only; adding broad tab access must not expand old rules silently.
      for (const tab of await webTabs(message.windowId)) {
        if (!isClaude(tab.url) || tab.groupId !== -1 || tab.pinned) continue;
        const matched = matchTask(tab.title,config.tasks);
        if (matched) { await assign(tab.id,matched); count++; }
      }
      return {count};
    }
    default: throw new Error('Unknown action.');
  }
  return {};
}
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const telemetry=['insightConfig','insightPulse','insightBoundary'].includes(message.type);
  if (sender.tab && !telemetry) return;
  if (telemetry && (!sender.tab || sender.frameId!==0 || !isClaude(sender.url))) return;
  serialize(()=>message.type?.startsWith('insight') ? insights.handle(message,sender) : dispatch(message))
    .then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.runtime.onInstalled.addListener(()=>{serialize(settings).catch(console.error);});
chrome.tabs.onUpdated.addListener((tabId,change,tab) => {
  if (!change.title || !isClaude(tab.url) || tab.groupId !== -1 || tab.pinned) return;
  serialize(async()=>{
    const config = await settings();
    if (!config.autoGroup) return;
    const fresh = await chrome.tabs.get(tabId);
    if (fresh.groupId !== -1 || fresh.pinned || !isClaude(fresh.url)) return;
    const task = matchTask(fresh.title,config.tasks);
    if (task) await assign(tabId,task);
  }).catch(console.error);
});

// Drop timing checkpoints on foreground changes: a later pulse starts a fresh interval.
for (const event of [chrome.tabs.onActivated,chrome.windows?.onFocusChanged]) {
  event?.addListener(()=>{serialize(()=>insights.boundary()).catch(console.error);});
}
chrome.idle?.onStateChanged.addListener(state=>{
  if(state==='locked') serialize(()=>insights.boundary()).catch(console.error);
});
// Content scripts receive only their minimal config through the guarded message route.
chrome.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'}).catch(console.error);
