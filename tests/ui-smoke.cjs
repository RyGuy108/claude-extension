// Run with NODE_PATH pointing to a Playwright installation. Uses synthetic tabs only.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const name=path.join(root,req.url.split('?')[0]);try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(name));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');
 const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}),headless:true});
 try{
 const page=await browser.newPage({viewport:{width:420,height:600},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
 const tasks=[{id:'medical',name:'Medical',color:'#9878b5',nativeColor:'purple',keywords:'anatomy'},{id:'todo',name:'To-do',color:'#77947a',nativeColor:'green',keywords:'checklist'},{id:'math',name:'Math',color:'#728fb4',nativeColor:'blue',keywords:'algebra'}];
 const state={tasks,autoGroup:false,tabs:[{id:1,title:'Understanding the cardiac cycle',groupId:10},{id:2,title:'A calmer plan for the week',groupId:11},{id:3,title:'Working through linear algebra',groupId:12},{id:4,title:'Ideas for a weekend project',groupId:-1}],groups:[{id:10,title:'Medical · Claude'},{id:11,title:'To-do · Claude'},{id:12,title:'Math · Claude'}]};
 const event={addListener(){}};window.chrome={runtime:{async sendMessage(m){if(m.type==='save'){const i=tasks.findIndex(t=>t.id===m.task.id);if(i<0)tasks.push({...m.task,id:'new'});else tasks[i]=m.task;}if(m.type==='assign')state.tabs.find(t=>t.id===m.tabId).groupId=state.groups.find(g=>g.title===tasks.find(t=>t.id===m.taskId)?.name+' · Claude')?.id??-1;if(m.type==='auto')state.autoGroup=m.enabled;return {ok:true,data:m.type==='state'?structuredClone(state):{count:0}};}},windows:{async getCurrent(){return {id:1};}},tabs:{async query(){return [{id:1}];},onUpdated:event,onRemoved:event,onCreated:event},tabGroups:{onUpdated:event},storage:{onChanged:event}};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);
 await page.getByText('Understanding the cardiac cycle',{exact:true}).first().waitFor();
 await page.screenshot({path:path.join(root,'docs/popup.png')});
 await page.getByRole('button',{name:'Add task',exact:true}).click();await page.getByLabel('Task name',{exact:true}).fill('Research');await page.getByLabel('Hex code').fill('#00aabb');await page.getByRole('button',{name:'Save task'}).click();await page.locator('.task-name').filter({hasText:'Research'}).waitFor();
 await page.getByRole('searchbox').fill('linear');if(await page.locator('.task').count()!==1)throw Error('Search did not filter groups');await page.getByRole('searchbox').fill('');
 await page.getByRole('button',{name:'Edit Medical'}).click();await page.screenshot({path:path.join(root,'docs/editor.png')});await page.getByRole('button',{name:'Cancel',exact:true}).click();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>420))throw Error('Horizontal overflow');if(errors.length)throw Error(errors.join('\n'));console.log('UI smoke passed: rendering, add task, search, editor, layout, no script errors.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
