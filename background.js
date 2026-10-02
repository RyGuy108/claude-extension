import {DEFAULTS, isClaude, groupTitle, validateTask, matchTask} from './model.js';
let queue = Promise.resolve();
function serialize(fn) { const next = queue.then(fn); queue = next.catch(()=>{}); return next; }
async function settings() {
  const value = await chrome.storage.local.get(['tasks','autoGroup']);
  if (!value.tasks) { value.tasks = structuredClone(DEFAULTS); await chrome.storage.local.set({tasks:value.tasks}); }
  return {tasks:value.tasks, autoGroup:!!value.autoGroup};
}
async function claudeTabs(windowId) { return (await chrome.tabs.query(windowId == null ? {} : {windowId})).filter(t=>isClaude(t.url || t.pendingUrl)); }
async function taskGroups(task, windowId) {
  const groups = await chrome.tabGroups.query(windowId == null ? {} : {windowId});
  const candidates = groups.filter(g=>g.title === groupTitle(task));
  const result = [];
  for (const group of candidates) {
    const members = await chrome.tabs.query({groupId:group.id});
    if (members.length && members.every(t=>isClaude(t.url || t.pendingUrl))) result.push(group);
  }
  return result;
}
async function assign(tabId, task) {
  const tab = await chrome.tabs.get(tabId);
  if (!isClaude(tab.url || tab.pendingUrl)) throw new Error('Choose a Claude tab to assign.');
  if (tab.pinned) throw new Error('Unpin this tab in Chrome before grouping it.');
  if (!task) { await chrome.tabs.ungroup(tabId); return; }
  const existing = (await taskGroups(task, tab.windowId))[0];
  const groupId = await chrome.tabs.group(existing ? {tabIds:[tabId],groupId:existing.id} : {tabIds:[tabId],createProperties:{windowId:tab.windowId}});
  await chrome.tabGroups.update(groupId,{title:groupTitle(task),color:task.nativeColor});
}
async function dispatch(message) {
  const config = await settings();
  const task = config.tasks.find(t=>t.id === message.taskId);
  if (['new','collapse'].includes(message.type) && !task) throw new Error('This task no longer exists.');
  switch (message.type) {
    case 'state': {
      const tabs = await claudeTabs(message.windowId);
      const groups = await chrome.tabGroups.query({windowId:message.windowId});
      return {...config,tabs,groups};
    }
    case 'assign':
      if (message.taskId && !task) throw new Error('This task no longer exists.');
      await assign(message.tabId, task); break;
    case 'new': {
      const tab = await chrome.tabs.create({url:'https://claude.ai/new',windowId:message.windowId});
      await assign(tab.id,task); break;
    }
    case 'collapse':
      for (const group of await taskGroups(task,message.windowId)) await chrome.tabGroups.update(group.id,{collapsed:message.collapsed});
      break;
    case 'save': {
      const old = config.tasks.find(t=>t.id===message.task.id);
      if (message.task.id && !old) throw new Error('This task no longer exists.');
      if (!old && config.tasks.length >= 24) throw new Error('You can have up to 24 tasks.');
      const updated = validateTask(message.task,config.tasks);
      if (old) for (const group of await taskGroups(old)) await chrome.tabGroups.update(group.id,{title:groupTitle(updated),color:updated.nativeColor});
      await chrome.storage.local.set({tasks:old ? config.tasks.map(t=>t.id===old.id?updated:t) : [...config.tasks,updated]}); break;
    }
    case 'delete':
      if (!task) throw new Error('This task no longer exists.');
      for (const group of await taskGroups(task)) {
        const members = await chrome.tabs.query({groupId:group.id});
        await chrome.tabs.ungroup(members.map(t=>t.id));
      }
      await chrome.storage.local.set({tasks:config.tasks.filter(t=>t.id!==task.id)}); break;
    case 'auto': await chrome.storage.local.set({autoGroup:!!message.enabled}); break;
    case 'organize': {
      let count=0;
      for (const tab of await claudeTabs(message.windowId)) {
        if (tab.groupId !== -1 || tab.pinned) continue;
        const matched = matchTask(tab.title,config.tasks);
        if (matched) { await assign(tab.id,matched); count++; }
      }
      return {count};
    }
    default: throw new Error('Unknown action.');
  }
  return {};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if (sender.id !== chrome.runtime.id || sender.tab) return;
  serialize(()=>dispatch(message)).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.runtime.onInstalled.addListener(()=>{serialize(settings).catch(console.error);});
chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{
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
