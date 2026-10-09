import {summarize} from './insights.js';
const $=id=>document.getElementById(id);
const duration=ms=>ms<60000?`${Math.floor(ms/1000)}s`:ms<3600000?`${Math.floor(ms/60000)}m`:`${(ms/3600000).toFixed(1)}h`;
const share=(part,total)=>total?`${Math.round(part/total*100)}%`:'—';
export async function mountInsights({send,status,tasks}) {
  const session=crypto.randomUUID();
  let data,refreshing=false,changing=false;
  function timer() {
    const remaining=(data?.timer?.endsAt || 0)-Date.now();
    $('timer-status').textContent=!data?.timer?'Choose a little time for one thing.':remaining<=0?'Time’s up. A good moment for a break.':`${Math.floor(remaining/60000)}:${String(Math.floor(remaining/1000)%60).padStart(2,'0')} remaining`;
    $('timer-start').textContent=data?.timer?'Restart':'Start';$('timer-stop').hidden=!data?.timer;
  }
  function render() {
    const total=summarize(data.days,Number($('insight-range').value));
    $('tracking-enabled').checked=data.config.enabled;$('quiet-threshold').value=data.config.quietSeconds;
    $('tracking-status').textContent=data.config.enabled?'Measuring only observed foreground time. Refresh existing Claude tabs after updating the extension.':'Tracking paused. Turn on to begin or resume; previous totals remain.';
    $('quiet-share').textContent=share(total.quiet,total.claude);$('claude-time').textContent=duration(total.claude);
    $('send-attempts').textContent=total.attempts;$('chat-switches').textContent=total.switches;
    $('organizer-time').textContent=duration(total.organizer);$('organizer-share').textContent=`${share(total.organizer,total.claude+total.organizer)} of Claude + organizer`;
    $('composing-share').textContent=share(total.composing,total.claude);
    $('time-bar').replaceChildren();$('time-legend').replaceChildren();
    for(const [key,label,color] of [['composing','Composing','#77947a'],['interacting','Viewing / interaction','#728fb4'],['quiet','Quiet viewing','#9878b5']]) {
      const bar=document.createElement('span');bar.style.width=`${total.claude?total[key]/total.claude*100:0}%`;bar.style.background=color;$('time-bar').append(bar);
      const row=document.createElement('div');row.className='legend-row';
      const name=document.createElement('span');name.textContent=label;
      const value=document.createElement('span');value.textContent=`${duration(total[key])} · ${share(total[key],total.claude)}`;
      row.append(name,value);$('time-legend').append(row);
    }
    $('task-times').replaceChildren();
    const entries=Object.entries(total.tasks).sort((a,b)=>b[1]-a[1]);
    const other=total.claude-entries.reduce((sum,[,time])=>sum+time,0);if(other>0)entries.push(['ungrouped',other]);
    if(!entries.length)$('task-times').textContent='No observed Claude time in this period yet.';
    for(const [id,time] of entries) {
      const task=tasks().find(item=>item.id===id),row=document.createElement('div');row.className='legend-row';
      const name=document.createElement('span');name.textContent=task?.name || (id==='ungrouped'?'Outside tasks':'Deleted task');name.style.borderLeft=`3px solid ${task?.color || 'var(--muted)'}`;name.style.paddingLeft='7px';
      const value=document.createElement('span');value.textContent=duration(time);row.append(name,value);$('task-times').append(row);
    }
    timer();
  }
  async function refresh() {if(refreshing)return;refreshing=true;try{data=await send('insightState');render();}finally{refreshing=false;}}
  async function change(type,values={}) {
    if(changing)return;changing=true;
    try {await send(type,values);await refresh();return true;}catch(error){status(error.message);return false;}finally{changing=false;}
  }
  $('tracking-enabled').onchange=()=>change('insightSettings',{enabled:$('tracking-enabled').checked});
  $('quiet-threshold').onchange=()=>change('insightSettings',{quietSeconds:Number($('quiet-threshold').value)});
  $('insight-range').onchange=()=>data&&render();
  $('clear-insights').onclick=async()=>{if(await change('insightClear'))status('Statistics cleared. Your tasks and collections are unchanged.');};
  $('timer-start').onclick=()=>change('insightTimer',{minutes:Number($('timer-length').value)});
  $('timer-stop').onclick=()=>change('insightTimer',{minutes:0});
  await refresh();
  setInterval(timer,1000);
  // Sampling stops naturally when the popup closes; no worker keepalive is needed.
  setInterval(async()=>{
    try {
      if(data?.config.enabled && document.hasFocus())await send('insightPopup',{focused:true,session});
      await refresh();
    }catch(error){status(error.message);}
  },5000);
}
