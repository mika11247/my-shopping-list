const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const userId='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
test('browser flows with synthetic Auth/REST/Storage only',async t=>{
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'my-items-browser-'));
 const log=fs.openSync(path.join(folder,'next.log'),'a');
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port),'--hostname','127.0.0.1'],{
  cwd:process.cwd(),windowsHide:true,stdio:['ignore',log,log],
  env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54399',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-test-key',RESEND_API_KEY:'re_local_test',NEXT_TELEMETRY_DISABLED:'1'}});
 const origin='http://127.0.0.1:'+port;
 let browser;
 try{
  let ready=false;for(let i=0;i<90;i++){try{if((await fetch(origin,{signal:AbortSignal.timeout(15000)})).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1000));}
  if(!ready)throw Error('Next server did not start: '+fs.readFileSync(path.join(folder,'next.log'),'utf8'));
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  async function fixture(options={}){
   const state={items:[],shopping:[],posts:[],uploads:[],count:options.count??0,plan:options.plan??'free',rejectMaster:false,rejectShopping:false,imageBytes:null,storageDeletes:0};
   const context=await browser.newContext();context.setDefaultTimeout(10000);
   const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
   await context.addInitScript(({token,userId})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:userId,email:'owner@example.invalid'}})),{token,userId});
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    if(url.origin===origin)return route.continue();
    if(url.origin!=='http://127.0.0.1:54399')return route.abort();
    const reply=(body,status=200,headers={})=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-expose-headers':'content-range',...headers},body:body===null?'':JSON.stringify(body)});
    if(url.pathname==='/auth/v1/user')return reply({id:userId,email:'owner@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:'2026-01-01'});
    if(url.pathname.startsWith('/storage/')){
     if(method==='DELETE')state.storageDeletes++;
     if(method==='GET' && state.imageBytes)return route.fulfill({status:200,contentType:'image/png',body:state.imageBytes,headers:{'access-control-allow-origin':'*'}});
     if(method==='POST'){state.uploads.push({method,path:url.pathname,headers:request.headers()});return reply({Key:'image'},200);}
     return reply({},200);
    }
    const table=url.pathname.split('/').pop();
    if(url.pathname.includes('/rpc/'))return reply({},200);
    if(table==='profiles')return reply({user_id:userId,role:'user',plan:state.plan});
    if(table==='user_item_master'){
     if(method==='HEAD')return reply(null,200,{'content-range':'*/'+(state.count+state.items.length)});
     if(method==='POST'){
      const payload=request.postDataJSON();state.posts.push(payload);
      if(state.rejectMaster)return reply({code:'23514',message:'MY_ITEMS_LIMIT: maximum 30 items'},400);
      const item={...payload,id:state.items.length+1};state.items.push(item);return reply(item,201);
     }
     const match=url.searchParams.get('name');return reply(match?state.items.filter(x=>x.name===match.slice(3)):state.items);
    }
    if(table==='shopping_items'){
     if(method==='POST'){if(state.rejectShopping)return reply({code:'42501',message:'synthetic shopping failure'},403);state.shopping.push(request.postDataJSON());return reply(null,201);}
     return reply(url.searchParams.has('name')?[]:state.shopping.map((item,i)=>({...item,id:i+1})));
    }
    return reply([]);
   });
   const page=await context.newPage();page.on('dialog',dialog=>dialog.dismiss());return {page,context,state};
  }
  await t.test('home detail form appears only on explicit action and carries name, reading, category, image',async()=>{
   const {page,context,state}=await fixture();
   await page.goto(origin);await page.getByPlaceholder('たまご、牛乳…').fill('テスト食材');
   await page.getByRole('button',{name:'「テスト食材」をMy itemsに追加'}).waitFor();
   assert.equal(await page.getByRole('form',{name:'My Items登録'}).count(),0);
   await page.getByRole('button',{name:'「テスト食材」をMy itemsに追加'}).click();
   const form=page.getByRole('form',{name:'My Items登録'});
   await form.getByLabel('アイテム名（必須）').waitFor();assert.equal(await form.getByLabel('アイテム名（必須）').inputValue(),'テスト食材');
   await form.getByLabel('よみ（任意）').fill('てすとしょくざい');
   await form.getByLabel('カテゴリ',{exact:true}).selectOption('肉');
   await form.getByLabel('画像URL・絵文字（任意）').fill('🥕');
   await page.screenshot({path:path.join(folder,'home-detail-desktop.png'),fullPage:true});
   await form.getByRole('button',{name:'My Itemsに登録してリストに追加'}).click();
   await form.waitFor({state:'detached'});
   assert.equal(state.posts.length,1);assert.equal(state.posts[0].name,'テスト食材');assert.equal(state.posts[0].yomi,'てすとしょくざい');assert.equal(state.posts[0].image_url,'🥕');assert.equal(state.posts[0].category,'肉');
   assert.equal(state.shopping.length,1);await context.close();
  });
  await t.test('master accepts name only and blocks a double submission',async()=>{
   const {page,context,state}=await fixture();
   await page.goto(origin+'/master');const form=page.getByRole('form',{name:'My Items登録'});
   await form.getByLabel('アイテム名（必須）').fill('タマゴ');
   await form.getByRole('button',{name:'My Itemsに登録',exact:true}).waitFor({state:'visible'});
   await form.getByRole('button',{name:'My Itemsに登録',exact:true}).evaluate(button=>{button.click();button.click();});
   await form.getByText('My Itemsに登録しました。',{exact:true}).waitFor();
   assert.equal(state.posts.length,1);assert.equal(state.posts[0].yomi,'たまご');assert.equal(state.posts[0].category,'その他');assert.equal(state.posts[0].image_url,'🛒');
   await context.close();
  });
  await t.test('cap blocks both detailed registration pages and shows explanation',async()=>{
   for(const suffix of ['/master','']){
    const {page,context,state}=await fixture({count:30});await page.goto(origin+suffix);
    if(!suffix){await page.getByPlaceholder('たまご、牛乳…').fill('上限');await page.getByRole('button',{name:'「上限」をMy itemsに追加'}).click();}
    const form=page.getByRole('form',{name:'My Items登録'});await form.getByLabel('アイテム名（必須）').fill('上限');
    await form.getByText(/上限に達しています/).waitFor();
    assert.ok(await form.getByRole('button',{name:suffix?'My Itemsに登録':'My Itemsに登録してリストに追加',exact:true}).isDisabled());
    assert.equal(state.posts.length,0);await context.close();
   }
  });
  await t.test('normal add and Enter remain quick, Enter cannot bypass the cap',async()=>{
   const {page,context,state}=await fixture({count:30});await page.goto(origin);
   const input=page.getByPlaceholder('たまご、牛乳…');await input.fill('通常追加');
   await page.getByRole('button',{name:'追加',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('input[placeholder="たまご、牛乳…"]').value==='');
   assert.equal(state.shopping.length,1);assert.equal(state.posts.length,0);assert.equal(await page.getByRole('form',{name:'My Items登録'}).count(),0);
   await input.fill('Enter追加');await input.press('Enter');
   await page.waitForTimeout(500);assert.equal(state.shopping.length,2);assert.equal(state.posts.length,0);
   assert.equal(await input.inputValue(),'Enter追加');await context.close();
  });
  await t.test('DB rejection keeps form input and does not add shopping data',async()=>{
   const {page,context,state}=await fixture();state.rejectMaster=true;
   await page.goto(origin+'/master');const form=page.getByRole('form',{name:'My Items登録'});
   await form.getByLabel('アイテム名（必須）').fill('保持する入力');await form.getByRole('button',{name:'My Itemsに登録',exact:true}).click();
   await form.getByRole('alert').waitFor();assert.match(await form.getByRole('alert').textContent(),/上限/);
   assert.equal(await form.getByLabel('アイテム名（必須）').inputValue(),'保持する入力');assert.equal(state.shopping.length,0);await context.close();
  });

  await t.test('special image upload uses a new JPEG object and never deletes on save failure',async()=>{
   const {page,context,state}=await fixture({plan:'special'});state.rejectMaster=true;
   await page.setViewportSize({width:390,height:844});
   await page.goto(origin+'/master');const form=page.getByRole('form',{name:'My Items登録'});
   await form.getByLabel('アイテム名（必須）').fill('写真付き');
   const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);return canvas.toDataURL('image/png').split(',')[1];});
   state.imageBytes=Buffer.from(png,'base64');
   await form.locator('input[type=file]').setInputFiles({name:'image.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await page.waitForFunction(()=>document.querySelector('input[placeholder="未指定の場合は🛒"]').value.startsWith('http'));
   assert.equal(state.uploads.length,1);assert.match(state.uploads[0].path,/\.jpg$/);
   assert.equal(state.uploads[0].headers['x-upsert'],'false');
   await page.screenshot({path:path.join(folder,'master-detail-mobile.png'),fullPage:true});
   await form.getByRole('button',{name:'My Itemsに登録',exact:true}).click();await form.getByRole('alert').waitFor();
   assert.equal(state.uploads.length,1);assert.equal(state.storageDeletes,0);await context.close();
  });
  await t.test('shopping failure retries only shopping, without another My Items insert',async()=>{
   const {page,context,state}=await fixture();state.rejectShopping=true;await page.goto(origin);
   await page.getByPlaceholder('たまご、牛乳…').fill('部分成功');await page.getByRole('button',{name:'「部分成功」をMy itemsに追加'}).click();
   const form=page.getByRole('form',{name:'My Items登録'});
   await form.getByRole('button',{name:'My Itemsに登録してリストに追加'}).click();
   await form.getByRole('button',{name:'買い物リストへの追加を再試行'}).waitFor();
   assert.equal(state.posts.length,1);assert.equal(state.shopping.length,0);state.rejectShopping=false;
   await form.getByRole('button',{name:'買い物リストへの追加を再試行'}).click();await form.waitFor({state:'detached'});
   assert.equal(state.posts.length,1);assert.equal(state.shopping.length,1);await context.close();
  });
 }finally{
  if(browser)await browser.close();
  // Only the server process owned by this test is stopped.
  if(process.platform==='win32')spawn('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  else server.kill();
  console.log('Browser logs retained at '+folder);
 }
});
