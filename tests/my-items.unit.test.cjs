const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../node_modules/typescript');
function load(path){const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(name=>name==='./planLimits'?load('lib/planLimits.ts'):require(name),m,m.exports);return m.exports;}
const {normalizeMyItem,myItemError,createMyItem,getMyItemCapacity}=load('lib/myItems.ts');
test('name-only defaults and kana reading preserve existing contract',()=>{
 assert.deepEqual(normalizeMyItem({name:'  タマゴ  '}),{name:'タマゴ',yomi:'たまご',category:'その他',image_url:'🛒'});
 assert.equal(normalizeMyItem({name:'牛乳',yomi:' ぎゅうにゅう ',category:'乳製品',image_url:'🥛'}).yomi,'ぎゅうにゅう');
 assert.equal(normalizeMyItem({name:'牛乳'}).yomi,'牛乳');
 assert.throws(()=>normalizeMyItem({name:'  '}));
});
function client({count=0,plan='free',role='user',auth='owner',countError=null,insertError=null}={}){
 const calls=[];return {calls,auth:{getUser:async()=>({data:{user:auth?{id:auth}:null}})},from(table){
 let inserted=false;const q={select(...args){calls.push([table,'select',...args]);return q;},eq(){return q;},single:async()=>inserted?{data:{id:1,user_id:'owner',name:'a'},error:insertError}:{data:{plan,role}},insert(data){inserted=true;calls.push([table,'insert',data]);return q;},then(resolve,reject){return Promise.resolve({count,error:countError}).then(resolve,reject);}};return q;
 }};
}
for(const [plan,role,limit] of [['free','user',30],['special','user',50],['pro','user',200],['free','admin',9999],['unknown','user',30]]){
 test(plan+'/'+role+' capacity and no insert at limit',async()=>{
  const c=client({plan,role,count:limit});assert.equal((await getMyItemCapacity(c,'owner')).limit,limit);
  await assert.rejects(()=>createMyItem(c,'owner',{name:'a'}),/登録できます/);assert.equal(c.calls.filter(x=>x[1]==='insert').length,0);
 });
}
test('capacity failure and different identity fail closed',async()=>{
 await assert.rejects(()=>createMyItem(client({countError:{message:'offline'}}),'owner',{name:'a'}),/確認できません/);
 await assert.rejects(()=>createMyItem(client({auth:'other'}),'owner',{name:'a'}),/ログイン/);
});
test('stale UI maps DB quota error, duplicate cannot overwrite',async()=>{
 await assert.rejects(()=>createMyItem(client({insertError:{code:'23514',message:'MY_ITEMS_LIMIT'}}),'owner',{name:'a'}),/上限/);
 await assert.rejects(()=>createMyItem(client({insertError:{code:'23505'}}),'owner',{name:'a'}),/すでに/);
});
test('successful create uses INSERT and owner from verified identity',async()=>{
 const c=client();await createMyItem(c,'owner',{name:' a '});assert.equal(c.calls.find(x=>x[1]==='insert')[2].user_id,'owner');
});
test('permission errors are actionable',()=>assert.match(myItemError({code:'42501'}),/ログイン/));
