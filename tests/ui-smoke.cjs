// Requires Playwright and Chrome. All tabs are synthetic; no personal browser data is accessed.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const server=http.createServer((req,res)=>{
    const name=path.resolve(root,'.'+req.url.split('?')[0]);
    if(!name.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    try{
      res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');
      let content=fs.readFileSync(name);
      if(name.endsWith('popup.html'))content=content.toString().replace('src="popup.js"','src="tests/browser-fixture.js"');
      res.end(content);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true});
    const page=await browser.newPage({viewport:{width:440,height:600},deviceScaleFactor:2});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const click=async name=>{await page.getByRole('button',{name,exact:true}).click();};
    const waitStatus=async text=>{await page.locator('#status').filter({hasText:text}).waitFor();};
    const snapshot=async name=>{await page.screenshot({path:path.join(root,`docs/${name}.png`)});};
    await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);
    await page.getByRole('button',{name:'Focus Medical',exact:true}).waitFor();
    await snapshot('popup');
    await page.keyboard.press('/');assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);
    await page.getByRole('searchbox').fill('example.org');assert.equal(await page.locator('.tab').count(),1);
    await page.getByRole('searchbox').fill('');
    await page.getByRole('checkbox',{name:'Select Research with ChatGPT',exact:true}).check();
    await page.getByLabel('Destination task').selectOption('medical');await click('Move');await waitStatus('Moved 1 tabs');
    assert.equal(await page.evaluate(()=>fixture.tabs.find(tab=>tab.id===5).groupId),10);
    await click('Add link to Medical');await page.getByLabel('Website URL').fill('https://example.org/paper');await click('Add link');await waitStatus('Link added');
    assert.equal(await page.evaluate(()=>fixture.tabs.at(-1).groupId),10);
    await click('Focus Medical');await page.locator('#focus-banner').waitFor();
    assert.equal(await page.evaluate(()=>fixture.groups.find(group=>group.id===12).collapsed),true);
    await click('Exit focus');await page.locator('#focus-banner').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>fixture.groups.find(group=>group.id===12).collapsed),false);
    await click('Save Medical collection');await waitStatus('Saved 4 links');
    await page.locator('[data-view="saved"]').click();await page.getByText('Your saved collections',{exact:true}).waitFor();
    await snapshot('saved');await click('Restore Medical');await waitStatus('already in this task');
    await page.locator('[data-view="themes"]').click();assert.equal(await page.locator('.theme-card').count(),12);
    await click('Preview Midnight Ink');await page.waitForFunction(()=>document.documentElement.style.colorScheme==='dark');
    await snapshot('themes');await click('Apply theme');await waitStatus('Your task colors are unchanged');
    assert.equal(await page.evaluate(()=>fixture.store.tasks[0].color),'#9878B5');
    await page.locator('[data-view="live"]').click();await snapshot('dark');
    await click('Edit Medical');await snapshot('editor');await page.getByLabel('Hex code').fill('#aabbcc');await click('Save task');await waitStatus('Task saved');
    assert.equal(await page.evaluate(()=>fixture.store.tasks[0].color),'#aabbcc');
    await page.locator('[data-view="themes"]').click();await click('Preview Ocean Air');await page.getByRole('checkbox',{name:'Also recolor my task groups'}).check();await click('Apply theme');await waitStatus('Theme and task palette applied');
    assert.equal(await page.evaluate(()=>fixture.store.tasks[0].color),'#689fc6');
    await page.reload();await page.getByRole('button',{name:'Focus Medical',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--paper')),'#eff5fa');
    await click('Add task');await page.getByLabel('Task name',{exact:true}).fill('Research');await click('Save task');await waitStatus('Task saved');
    assert.equal(await page.locator('.task-name').filter({hasText:'Research'}).count(),1);
    // Check all bundled appearances for width overflow and successful preview.
    await page.locator('[data-view="themes"]').click();
    for(const name of ['Claude Paper','Sage Garden','Ocean Air','Lavender Study','Rose Quartz','Desert Sand','Fresh Mint','Peach Morning','Midnight Ink','Forest Night','Velvet Plum','Graphite']){
      await click(`Preview ${name}`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>440),false,name);
    }
    assert.deepEqual(errors,[]);
    console.log('UI integration passed: real worker + popup, mixed tabs, domain search, bulk move, research link, focus restore, collection save/restore, theme persistence, palette opt-in, editor, 12 theme layouts.');
  }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exit(1);});
