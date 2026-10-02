import {COLORS, groupTitle, isClaude, domain, nearestColor} from './model.js';
import {THEMES, getTheme} from './themes.js';

const $ = id => document.getElementById(id);
let state, windowId, activeId, editingId, linkTaskId;
let view = 'live', filter = 'all', previewTheme = null, busy = false;
const selected = new Set(), expanded = new Set();
async function send(type,extra={}) {
  const result = await chrome.runtime.sendMessage({type,windowId,...extra});
  if (!result?.ok) throw new Error(result?.error || 'Could not connect. Reopen the extension and try again.');
  return result.data;
}
function status(message) { $('status').textContent = message; }
async function action(fn) {
  if (busy) return;
  busy = true;
  try { await fn(); await refresh(); } catch(error) { status(error.message); }
  finally { busy = false; }
}
function node(tag,className,text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function button(text,label,fn) {
  const el = node('button','',text);
  el.type = 'button'; el.title = label; el.setAttribute('aria-label',label);
  el.onclick = () => action(fn);
  return el;
}
function options(select,value='',placeholder='Unassigned') {
  select.replaceChildren();
  for (const [id,name] of [['',placeholder],...state.tasks.map(task=>[task.id,task.name])]) {
    const option = node('option','',name); option.value = id; select.append(option);
  }
  select.value = value;
}
function taskOf(tab) {
  const group = state.groups.find(item=>item.id===tab.groupId);
  return state.tasks.find(task=>group && groupTitle(task)===group.title);
}
function applyAppearance(id) {
  const theme = getTheme(id);
  for (const key of ['paper','surface','soft','ink','muted','line','accent']) document.documentElement.style.setProperty(`--${key}`,theme[key]);
  document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light';
}
function renderSelection() {
  $('bulk').hidden = !selected.size;
  $('selection-count').textContent = `${selected.size} selected`;
  options($('bulk-task'),$('bulk-task').value,'Move to…');
  $('move-selected').disabled = !$('bulk-task').value;
}
function tabRow(tab) {
  const row = node('div','tab');
  const check = node('input'); check.type = 'checkbox'; check.checked = selected.has(tab.id);
  check.disabled = !!tab.pinned;
  check.setAttribute('aria-label',`Select ${tab.title || domain(tab.url)}`);
  check.onchange = () => { if(check.checked) selected.add(tab.id); else selected.delete(tab.id); renderSelection(); };
  const link = button('',`Switch to ${tab.title || domain(tab.url)}`,async()=>{
    if (tab.groupId !== -1) await chrome.tabGroups.update(tab.groupId,{collapsed:false});
    await chrome.tabs.update(tab.id,{active:true}); window.close();
  });
  link.className = 'tab-link';
  link.append(node('span','tab-title',tab.title || 'Untitled page'),node('span','tab-domain',`${domain(tab.url)}${tab.pinned?' · Pinned':''}`));
  const select = node('select'); select.setAttribute('aria-label',`Move ${tab.title || 'tab'} to task`);
  options(select,taskOf(tab)?.id); select.disabled = !!tab.pinned;
  select.onchange = () => action(()=>send('assign',{tabId:tab.id,taskId:select.value}));
  row.append(check,link,select); return row;
}
function showLinkEditor(task) {
  linkTaskId = task.id; $('link-task-name').textContent = `Add to ${task.name}`;
  $('link-url').value = ''; $('link-error').textContent = ''; $('link-editor').showModal(); $('link-url').focus();
}
function renderLive() {
  const search = $('search').value.trim().toLowerCase();
  const matches = tab => (!search || `${tab.title} ${tab.url}`.toLowerCase().includes(search))
    && (filter!=='claude' || isClaude(tab.url)) && (filter!=='outside' || tab.groupId===-1);
  const current = state.tabs.find(tab=>tab.id===activeId);
  $('current-title').textContent = current?.title || 'Open a website to add it';
  options($('current-task'),current?taskOf(current)?.id:'');
  $('current-task').disabled = !current || !!current.pinned;
  $('current-task').title = current?.pinned ? 'Unpin this tab in Chrome first' : 'Assign this tab';
  $('focus-banner').hidden = !state.focus;
  $('focus-label').textContent = `Focusing: ${state.tasks.find(task=>task.id===state.focus?.taskId)?.name || 'task'}`;
  for (const id of selected) if (!state.tabs.some(tab=>tab.id===id&&!tab.pinned)) selected.delete(id);
  renderSelection(); $('tasks').replaceChildren();
  for (const task of state.tasks) {
    const all = state.tabs.filter(tab=>taskOf(tab)?.id===task.id), tabs = all.filter(matches);
    if ((search || filter!=='all') && !tabs.length) continue;
    const open = expanded.has(task.id) || !!search || filter!=='all';
    const card = node('section','task'); card.style.setProperty('--task',task.color);
    const head = node('div','task-head');
    const toggle = button('',`${open?'Hide':'Show'} ${task.name} tabs`,()=>{
      if(expanded.has(task.id)) expanded.delete(task.id); else expanded.add(task.id);
    });
    toggle.className = 'task-toggle'; toggle.setAttribute('aria-expanded',String(open));
    toggle.append(node('span','task-name',task.name));
    const groups = state.groups.filter(group=>group.title===groupTitle(task));
    const collapsed = groups.length>0 && groups.every(group=>group.collapsed);
    const collapse = button(collapsed?'▸':'▾',`${collapsed?'Expand':'Collapse'} ${task.name} in Chrome`,()=>send('collapse',{taskId:task.id,collapsed:!collapsed}));
    collapse.className = 'icon'; collapse.disabled = !all.length;
    const edit = button('⋯',`Edit ${task.name}`,()=>openEditor(task)); edit.className='icon';
    head.append(node('span','dot'),toggle,node('span','count',String(all.length)),collapse,edit); card.append(head);
    if (open) {
      const tools = node('div','task-tools');
      const focus = button('Focus',`Focus ${task.name}`,()=>send('focus',{taskId:task.id})); focus.disabled=!all.length;
      const save = button('Save',`Save ${task.name} collection`,async()=>{
        const {count} = await send('saveCollection',{taskId:task.id}); status(`Saved ${count} links. Your tabs are still open.`);
      }); save.disabled=!all.length;
      tools.append(focus,save,button('+ Link',`Add link to ${task.name}`,()=>showLinkEditor(task)),button('+ Chat',`New Claude chat in ${task.name}`,()=>send('new',{taskId:task.id})));
      card.append(tools);
      for (const tab of tabs) card.append(tabRow(tab));
      if (!all.length) card.append(node('p','empty','Add a chat, research link, or current tab.'));
    }
    $('tasks').append(card);
  }
  $('unassigned').replaceChildren();
  const outside = state.tabs.filter(tab=>!taskOf(tab)).filter(matches);
  if (outside.length) {
    $('unassigned').append(node('h2','unassigned-title',`Outside your tasks · ${outside.length}`));
    for (const tab of outside) $('unassigned').append(tabRow(tab));
  }
  if ((search || filter!=='all') && !state.tabs.some(matches)) $('unassigned').append(node('p','empty','No tabs match. Try another title or website.'));
  if (!state.tasks.length) $('tasks').append(node('p','empty','Create your first task with the + button above.'));
}
function renderSaved() {
  $('collections').replaceChildren();
  if (!state.collections.length) $('collections').append(node('p','empty','Your next session starts here. Open a task and choose Save to keep its links for later. Saving never closes your tabs.'));
  for (const collection of state.collections) {
    const card = node('article','collection');
    card.append(node('h3','',collection.name),node('p','',`${collection.links.length} links · ${new Date(collection.savedAt).toLocaleDateString()}`));
    const actions = node('div','collection-actions');
    actions.append(button('Restore',`Restore ${collection.name}`,async()=>{
      const {count} = await send('restoreCollection',{collectionId:collection.id});
      status(count?`Opened ${count} links in this window.`:'All saved links are already in this task.');
    }),button('Remove',`Remove saved ${collection.name}`,async()=>{
      await send('deleteCollection',{collectionId:collection.id}); status('Saved collection removed. Open tabs are unchanged.');
    }));
    const details=node('details'); details.append(node('summary','','Preview links'));
    const list=node('ul'); for(const link of collection.links) list.append(node('li','',`${link.title || domain(link.url)} · ${domain(link.url)}`));
    details.append(list); card.append(actions,details); $('collections').append(card);
  }
}
function renderThemes() {
  $('theme-grid').replaceChildren();
  for (const theme of THEMES) {
    const card = button('',`Preview ${theme.name}`,()=>{previewTheme=theme.id;});
    card.className='theme-card'; card.setAttribute('aria-pressed',String(theme.id===(previewTheme || state.theme)));
    card.style.setProperty('--preview-paper',theme.paper); card.style.setProperty('--preview-ink',theme.ink); card.style.setProperty('--preview-line',theme.line);
    card.append(node('strong','',theme.name),node('small','',theme.mood));
    const colors=node('div','swatches'); for(const color of theme.palette) {const swatch=node('span');swatch.style.background=color;colors.append(swatch);}
    card.append(colors); $('theme-grid').append(card);
  }
}
function render() {
  applyAppearance(previewTheme || state.theme);
  $('summary').textContent=`${state.tabs.length} tabs · ${state.tasks.length} tasks · This window`;
  $('saved-count').textContent=state.collections.length; $('auto').checked=state.autoGroup;
  renderLive(); renderSaved(); renderThemes();
}
async function refresh() {
  state = await send('state');
  const [active] = await chrome.tabs.query({active:true,windowId}); activeId = active?.id;
  render();
}
function openEditor(task) {
  editingId=task?.id; $('editor-title').textContent=task?'Make it yours':'A new task';
  $('name').value=task?.name || ''; $('color').value=task?.color || getTheme(state.theme).palette[state.tasks.length%6];
  $('hex').value=$('color').value; $('native-color').value=task?.nativeColor || nearestColor($('color').value);
  $('keywords').value=task?.keywords || ''; $('delete').hidden=!task; $('form-error').textContent='';
  $('palette-swatches').replaceChildren();
  for (const color of getTheme(state.theme).palette) {
    const swatch=button('',`Use ${color}`,()=>{$('color').value=color;$('hex').value=color;$('native-color').value=nearestColor(color);});
    swatch.style.background=color; $('palette-swatches').append(swatch);
  }
  $('editor').showModal(); $('name').focus();
}
for (const name of Object.keys(COLORS)) { const option=node('option','',name[0].toUpperCase()+name.slice(1));option.value=name;$('native-color').append(option); }
for (const button of document.querySelectorAll('[data-view]')) button.onclick=()=>{
  view=button.dataset.view; previewTheme=null; $('apply-palette').checked=false; status('');
  for(const item of document.querySelectorAll('[data-view]')) {if(item===button)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');}
  for(const name of ['live','saved','themes']) $(`${name}-view`).hidden=name!==view;
  if(state)render();
  document.querySelector('main').scrollTop=0;
};
for(const button of document.querySelectorAll('[data-filter]')) button.onclick=()=>{
  filter=button.dataset.filter;for(const item of document.querySelectorAll('[data-filter]'))item.setAttribute('aria-pressed',String(item===button));if(state)renderLive();
};
$('add').onclick=()=>state&&openEditor(); $('cancel').onclick=()=>$('editor').close();
$('cancel-link').onclick=()=>$('link-editor').close();
$('color').oninput=()=>$('hex').value=$('color').value;
$('hex').oninput=()=>{if(/^#[a-f\d]{6}$/i.test($('hex').value))$('color').value=$('hex').value;};
$('task-form').onsubmit=async event=>{
  event.preventDefault(); const submit=event.submitter; submit.disabled=true;
  try {
    await send('save',{task:{id:editingId,name:$('name').value,color:$('hex').value,nativeColor:$('native-color').value,keywords:$('keywords').value}});
    $('editor').close(); await refresh(); status('Task saved.');
  } catch(error) { $('form-error').textContent=error.message; } finally { submit.disabled=false; }
};
$('link-form').onsubmit=async event=>{
  event.preventDefault();const submit=event.submitter;submit.disabled=true;
  try {await send('new',{taskId:linkTaskId,url:$('link-url').value});$('link-editor').close();await refresh();status('Link added to your task.');}
  catch(error){$('link-error').textContent=error.message;}finally{submit.disabled=false;}
};
$('delete').onclick=()=>action(async()=>{
  try {await send('delete',{taskId:editingId});$('editor').close();status('Task deleted. Its tabs and saved collections remain available.');}
  catch(error){$('form-error').textContent=error.message;}
});
$('search').oninput=()=>state&&renderLive();
$('current-task').onchange=()=>action(()=>send('assign',{tabId:activeId,taskId:$('current-task').value}));
$('auto').onchange=()=>action(()=>send('auto',{enabled:$('auto').checked}));
$('end-focus').onclick=()=>action(()=>send('endFocus'));
$('organize').onclick=()=>action(async()=>{
  const {count}=await send('organize');status(count?`Organized ${count} Claude tabs.`:'No unique keyword matches. Edit a task to add Claude title keywords.');
});
$('bulk-task').onchange=()=>{$('move-selected').disabled=!$('bulk-task').value;};
$('move-selected').onclick=()=>action(async()=>{
  const {count,skipped}=await send('assignMany',{tabIds:[...selected],taskId:$('bulk-task').value});
  selected.clear();status(`Moved ${count} tabs.${skipped?` ${skipped} closed, pinned, or unavailable tabs skipped.`:''}`);
});
$('clear-selected').onclick=()=>{selected.clear();renderLive();};
$('apply-theme').onclick=()=>action(async()=>{
  await send('theme',{themeId:previewTheme || state.theme,applyPalette:$('apply-palette').checked});
  previewTheme=null;status($('apply-palette').checked?'Theme and task palette applied.':'Theme applied. Your task colors are unchanged.');$('apply-palette').checked=false;
});
document.addEventListener('keydown',event=>{
  if(event.key==='/' && !event.ctrlKey && !event.metaKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !$('editor').open && !$('link-editor').open && view==='live') {event.preventDefault();$('search').focus();}
});
try {
  windowId=(await chrome.windows.getCurrent()).id;
  await refresh();
  const current=state.tabs.find(tab=>tab.id===activeId); expanded.add(taskOf(current || {})?.id || state.tasks[0]?.id); renderLive();
  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>refresh().catch(error=>status(error.message)),150);};
  for(const event of [chrome.tabs.onUpdated,chrome.tabs.onRemoved,chrome.tabs.onCreated,chrome.tabs.onActivated,chrome.tabs.onAttached,chrome.tabs.onDetached,chrome.tabGroups.onUpdated,chrome.tabGroups.onRemoved,chrome.storage.onChanged]) event.addListener(schedule);
} catch(error) {status(error.message);$('current-title').textContent='Could not load tabs. Reopen the popup to retry.';}
