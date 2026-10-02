import {COLORS, groupTitle, isClaude} from './model.js';
const $ = id => document.getElementById(id);
let state, windowId, activeId, editingId;
async function send(type,extra={}) { const result=await chrome.runtime.sendMessage({type,windowId,...extra}); if (!result?.ok) throw new Error(result?.error || 'Could not connect. Reopen the extension and try again.'); return result.data; }
function status(message) { $('status').textContent=message; }
async function action(fn) { try { await fn(); await refresh(); } catch(error) { status(error.message); } }
function node(tag,className,text) { const el=document.createElement(tag); if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; }
function button(text,label,fn) { const el=node('button','',text);el.title=label;el.setAttribute('aria-label',label);el.onclick=()=>action(fn);return el; }
function options(select,selected='') {select.replaceChildren();for(const [value,label] of [['','Unassigned'],...state.tasks.map(t=>[t.id,t.name])]) {const option=node('option','',label);option.value=value;select.append(option);} select.value=selected;}
function taskOf(tab) {const group=state.groups.find(g=>g.id===tab.groupId);return state.tasks.find(t=>group && groupTitle(t)===group.title);}
function tabRow(tab) {
  const row=node('div','tab');const link=button(tab.title || 'New conversation','Switch to '+(tab.title || 'conversation'),async()=>{await chrome.tabs.update(tab.id,{active:true});window.close();});link.className='tab-link';row.append(link);
  const select=node('select');select.setAttribute('aria-label','Move '+(tab.title || 'conversation')+' to task');options(select,taskOf(tab)?.id);select.onchange=()=>action(()=>send('assign',{tabId:tab.id,taskId:select.value}));row.append(select);return row;
}
function render() {
  const filter=$('search').value.trim().toLowerCase();
  const visible=tab=>!filter||(tab.title||'').toLowerCase().includes(filter);
  $('summary').textContent=`${state.tabs.length} Claude ${state.tabs.length===1?'tab':'tabs'} · ${state.tasks.length} tasks · This window`;
  $('task-count').textContent=state.tasks.length;
  const current=state.tabs.find(t=>t.id===activeId);
  $('current-title').textContent=current?.title || (current?'New conversation':'Open a Claude conversation to get started');
  options($('current-task'),current?taskOf(current)?.id:'');$('current-task').disabled=!current;
  $('auto').checked=state.autoGroup;
  $('tasks').replaceChildren();
  for(const task of state.tasks) {
    const all=state.tabs.filter(t=>taskOf(t)?.id===task.id),tabs=all.filter(visible);
    if(filter&&!tabs.length)continue;
    const card=node('section','task');card.style.setProperty('--task',task.color);
    const head=node('div','task-head');head.append(node('span','dot'),node('span','task-name',task.name),node('span','count',String(all.length)));
    const actions=node('div','task-actions');
    const groups=state.groups.filter(g=>g.title===groupTitle(task));const collapsed=groups.length>0&&groups.every(g=>g.collapsed);
    const collapse=button(collapsed?'▸':'▾',`${collapsed?'Expand':'Collapse'} ${task.name} in Chrome`,()=>send('collapse',{taskId:task.id,collapsed:!collapsed}));collapse.disabled=!all.length;
    actions.append(collapse,button('+',`New Claude chat in ${task.name}`,()=>send('new',{taskId:task.id})),button('⋯',`Edit ${task.name}`,()=>openEditor(task)));
    head.append(actions);card.append(head);
    for(const tab of tabs)card.append(tabRow(tab));
    if(!all.length)card.append(node('p','empty','Ready for your next conversation.'));
    $('tasks').append(card);
  }
  $('unassigned').replaceChildren();
  const unassigned=state.tabs.filter(t=>!taskOf(t));
  if(unassigned.length) { $('unassigned').append(node('h2','unassigned-title',`Outside your tasks · ${unassigned.length}`));for(const tab of unassigned.filter(visible))$('unassigned').append(tabRow(tab)); }
  if(filter&&!state.tabs.some(visible))$('unassigned').append(node('p','empty','No conversations match your search.'));
  if(!state.tasks.length)$('tasks').append(node('p','empty','Create your first task with the + button above.'));
}
async function refresh() { state=await send('state');render(); }
function openEditor(task) {
  editingId=task?.id;$('editor-title').textContent=task?'Make it yours':'A new task';$('name').value=task?.name||'';$('color').value=task?.color||'#9878b5';$('hex').value=$('color').value;$('native-color').value=task?.nativeColor||'purple';$('keywords').value=task?.keywords||'';$('delete').hidden=!task;$('form-error').textContent='';$('editor').showModal();$('name').focus();
}
for(const name of Object.keys(COLORS)) { const option=node('option','',name[0].toUpperCase()+name.slice(1));option.value=name;$('native-color').append(option); }
$('add').onclick=()=>openEditor();$('cancel').onclick=()=>$('editor').close();
$('color').oninput=()=>$('hex').value=$('color').value;
$('hex').oninput=()=>{if(/^#[a-f\d]{6}$/i.test($('hex').value))$('color').value=$('hex').value;};
$('task-form').onsubmit=async event=>{event.preventDefault();const submit=event.submitter;submit.disabled=true;try{await send('save',{task:{id:editingId,name:$('name').value,color:$('hex').value,nativeColor:$('native-color').value,keywords:$('keywords').value}});$('editor').close();await refresh();status('Task saved.');}catch(error){$('form-error').textContent=error.message;}finally{submit.disabled=false;}};
$('delete').onclick=async()=>{try{await send('delete',{taskId:editingId});$('editor').close();await refresh();status('Task deleted. Its conversations are still open.');}catch(error){$('form-error').textContent=error.message;}};
$('search').oninput=()=>state&&render();
$('current-task').onchange=()=>action(()=>send('assign',{tabId:activeId,taskId:$('current-task').value}));
$('auto').onchange=()=>action(()=>send('auto',{enabled:$('auto').checked}));
$('organize').onclick=()=>action(async()=>{const {count}=await send('organize');status(count?`Organized ${count} ${count===1?'conversation':'conversations'}.`:'No unique keyword matches. Add keywords in a task’s settings.');});
try {
  const currentWindow=await chrome.windows.getCurrent();windowId=currentWindow.id;
  const [active]=await chrome.tabs.query({active:true,windowId});activeId=active?.id;
  await refresh();
  let timer;const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>refresh().catch(error=>status(error.message)),150);};
  chrome.tabs.onUpdated.addListener(schedule);chrome.tabs.onRemoved.addListener(schedule);chrome.tabs.onCreated.addListener(schedule);chrome.tabGroups.onUpdated.addListener(schedule);chrome.storage.onChanged.addListener(schedule);
} catch(error) {status(error.message);$('current-title').textContent='Could not load tabs. Reopen the popup to retry.';}
