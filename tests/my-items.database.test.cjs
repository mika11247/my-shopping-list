// Real PostgreSQL 17, disposable synthetic cluster. Never reads .env or connects remotely.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
process.env.PGCLIENTENCODING='UTF8';
const bin=process.env.MY_ITEMS_PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'my-items-quota-'));
let port;
let sequence=0; function command(name,args){const output=path.join(folder,'command-'+(sequence++)+'.log');const fd=fs.openSync(output,'w');let r;try{r=spawnSync(path.join(bin,name+'.exe'),args,{windowsHide:true,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}const text=fs.readFileSync(output,'utf8');if(r.status!==0)throw Error(name+': '+text);return text;}
function args(sql){const input=path.join(folder,'query-'+(sequence++)+'.sql');fs.writeFileSync(input,sql);return ['-X','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt','-f',input];}
function sql(query){return command('psql',args(query)).trim();}
function asyncSql(query){return new Promise(resolve=>{const p=spawn(path.join(bin,'psql.exe'),args(query),{windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',code=>resolve({code,out,err}));});}
const owner=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');
const asUser=(id,query)=>"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','"+id+"',true); "+query+"; COMMIT;";
function addUser(n,plan='free',role='user'){const id=owner(n);sql("INSERT INTO auth.users(id) VALUES('"+id+"'); INSERT INTO profiles(user_id,plan,role) VALUES('"+id+"','"+plan+"','"+role+"')");return id;}
function insert(id,count,start=0){return "INSERT INTO user_item_master(user_id,name) SELECT '"+id+"','item-'||n FROM generate_series("+start+","+(start+count-1)+")n";}
test('database quota and security regressions on isolated real PostgreSQL',async t=>{
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;await new Promise(r=>server.close(r));
 command('initdb',['-D',path.join(folder,'data'),'-U','postgres','-A','trust','--locale=C','--encoding=UTF8']);
 command('pg_ctl',['-D',path.join(folder,'data'),'-l',path.join(folder,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);
 try{
  sql(fs.readFileSync('tests/fixtures/security-schema.sql','utf8'));
  sql(fs.readFileSync('security/sql/authorization.sql','utf8'));
  sql('CREATE UNIQUE INDEX user_item_master_user_id_name_key ON user_item_master(user_id,name)');

  // Same aggregate shape as the read-only production preflight: 90 rows,
  // 6 owners, 1 Auth-absent item, one special user above 50. All values synthetic.
  const legacy=addUser(1,'special');sql(insert(legacy,51));
  const second=addUser(2,'special');sql(insert(second,4));
  for(const [id,count] of [[3,10],[4,10],[5,14]])sql(insert(addUser(id),count));
  const orphan=owner(6);sql(insert(orphan,1));
  sql("UPDATE user_item_master SET image_url='http://127.0.0.1/storage/v1/object/public/item-images/"+legacy+"/shared.jpg' WHERE user_id='"+legacy+"' AND name='item-0';"+
   "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('item-images','"+legacy+"/shared.jpg','"+legacy+"');"+
   "INSERT INTO recipes(id,user_id,name) VALUES('"+owner(900)+"','"+legacy+"','synthetic recipe');"+
   "INSERT INTO recipe_items(recipe_id,user_item_master_id) SELECT '"+owner(900)+"',id FROM user_item_master WHERE user_id='"+legacy+"' AND name='item-0';"+
   "INSERT INTO shopping_items(user_id,name,image_url) VALUES('"+second+"','shared image','http://127.0.0.1/storage/v1/object/public/item-images/"+legacy+"/shared.jpg');"+
   "INSERT INTO meal_plans(id,user_id,name,start_date,end_date) VALUES('"+owner(901)+"','"+legacy+"','synthetic menu','2026-10-26','2026-11-01');"+
   "INSERT INTO meal_plan_entries(meal_plan_id,meal_date,title,recipe_id) VALUES('"+owner(901)+"','2026-10-26','synthetic dinner','"+owner(900)+"')");
  const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_my_items_quota.sql'));
  const migrationSql=fs.readFileSync('supabase/migrations/'+migration,'utf8');
  const integrity=fs.readFileSync('security/sql/my-items-integrity-readonly.sql','utf8');
  sql(fs.readFileSync('security/sql/my-items-preflight-readonly.sql','utf8'));
  const before=sql(integrity);
  await t.test('90-row migration rehearsal ROLLBACK preserves IDs, images, references, ACLs and policies',()=>{
   sql(migrationSql.replace('COMMIT;','ROLLBACK;'));
   assert.equal(sql(integrity),before);
   assert.equal(sql("SELECT to_regclass('app_private.my_item_usage') IS NULL"),'t');
  });
  await t.test('mid-migration error rolls back every new object and retains original fingerprints',()=>{
   assert.throws(()=>sql(migrationSql.replace('COMMIT;','SELECT 1/0; COMMIT;')),/division by zero/);
   assert.equal(sql(integrity),before);
   assert.equal(sql("SELECT to_regclass('app_private.my_item_usage') IS NULL"),'t');
  });
  await t.test('migration lock timeout leaves original data and schema unchanged',async()=>{
   const blocker=asyncSql("BEGIN; SET application_name='quota_test_blocker'; LOCK TABLE user_item_master IN ROW EXCLUSIVE MODE; SELECT pg_sleep(2); COMMIT;");
   let locked=false;
   for(let i=0;i<12;i++){
    if(sql("SELECT exists(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='quota_test_blocker' AND l.relation='user_item_master'::regclass AND l.granted)") === 't'){locked=true;break;}
    await new Promise(r=>setTimeout(r,20));
   }
   assert.ok(locked);assert.throws(()=>sql(migrationSql.replace("lock_timeout = '5s'","lock_timeout = '100ms'")),/lock timeout/);
   assert.equal((await blocker).code,0);
   assert.equal(sql(integrity),before);assert.equal(sql("SELECT to_regclass('app_private.my_item_usage') IS NULL"),'t');
  });
  sql(migrationSql);
  await t.test('COMMIT keeps all 90 existing rows and security/reference fingerprints identical',()=>{
   assert.equal(sql(integrity),before);
   assert.equal(sql("SELECT count(*) FROM user_item_master"),'90');
   assert.equal(sql("SELECT sum(item_count) FROM app_private.my_item_usage"),'90');
   sql(fs.readFileSync('security/sql/my-items-postflight-readonly.sql','utf8'));
  });
  await t.test('migration preserves preexisting over-limit rows and allows edits',()=>{
   assert.equal(sql("SELECT count(*) FROM user_item_master WHERE user_id='"+legacy+"'"),'51');
   assert.throws(()=>sql(asUser(legacy,insert(legacy,1,100))),/MY_ITEMS_LIMIT/);
   sql(asUser(legacy,"UPDATE user_item_master SET yomi='edited' WHERE name='item-0'"));
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+legacy+"'"),'51');
  });
  let n=20;
  for(const [plan,role,limit] of [['free','user',30],['special','user',50],['pro','user',200],['free','admin',9999],['unknown','user',30]]){
   const id=addUser(n++,plan,role);
   await t.test('direct INSERT limit matches planLimits: '+plan+'/'+role,()=>{
    sql(asUser(id,insert(id,limit)));
    assert.throws(()=>sql(asUser(id,insert(id,1,limit))),/MY_ITEMS_LIMIT/);
    assert.equal(sql("SELECT count(*) FROM user_item_master WHERE user_id='"+id+"'"),String(limit));
   });
  }
  await t.test('bulk rollback leaves rows and quota unchanged',()=>{
   const id=addUser(n++);sql(asUser(id,insert(id,29)));
   assert.throws(()=>sql(asUser(id,insert(id,2,100))),/MY_ITEMS_LIMIT/);
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'29');
   assert.equal(sql("SELECT count(*) FROM user_item_master WHERE user_id='"+id+"'"),'29');
  });
  await t.test('upsert and ON CONFLICT DO NOTHING do not consume capacity',()=>{
   const id=addUser(n++);sql(asUser(id,insert(id,30)));
   sql(asUser(id,"INSERT INTO user_item_master(user_id,name,yomi) VALUES('"+id+"','item-0','updated') ON CONFLICT(user_id,name) DO UPDATE SET yomi=excluded.yomi"));
   sql(asUser(id,"INSERT INTO user_item_master(user_id,name) VALUES('"+id+"','item-0') ON CONFLICT DO NOTHING"));
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'30');
   assert.throws(()=>sql(asUser(id,insert(id,1,100)+' ON CONFLICT(user_id,name) DO UPDATE SET name=excluded.name')),/MY_ITEMS_LIMIT/);
  });
  for(const isolation of ['READ COMMITTED','REPEATABLE READ','SERIALIZABLE']){
   await t.test('two connections race for one slot: '+isolation,async()=>{
    const id=addUser(n++);sql(asUser(id,insert(id,29)));
    const first=asyncSql(asUser(id,insert(id,1,100)+'; SELECT pg_sleep(0.5)'));
    const second=asyncSql(asUser(id,insert(id,1,101)).replace('BEGIN;', 'BEGIN ISOLATION LEVEL '+isolation+';'));
    const results=await Promise.all([first,second]);assert.equal(results.filter(x=>x.code===0).length,1,JSON.stringify(results));
    assert.match(results.find(x=>x.code!==0).err,/MY_ITEMS_LIMIT|could not serialize/i);
    assert.equal(sql("SELECT count(*) FROM user_item_master WHERE user_id='"+id+"'"),'30');
    assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'30');
   });
  }
  await t.test('concurrent first ever registrations initialize one accurate counter',async()=>{
   const id=addUser(n++);const results=await Promise.all([asyncSql(asUser(id,insert(id,1,1)+'; SELECT pg_sleep(0.3)')),asyncSql(asUser(id,insert(id,1,2)))]);
   assert.ok(results.every(x=>x.code===0),JSON.stringify(results));assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'2');
  });
  await t.test('deletion releases a slot, rollback does not',()=>{
   const id=addUser(n++);sql(asUser(id,insert(id,30)));
   sql("BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','"+id+"',true); DELETE FROM user_item_master WHERE name='item-0'; ROLLBACK");
   assert.throws(()=>sql(asUser(id,insert(id,1,100))),/MY_ITEMS_LIMIT/);
   sql(asUser(id,"DELETE FROM user_item_master WHERE name='item-0'"));sql(asUser(id,insert(id,1,100)));
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'30');
  });
  await t.test('recipe FK failure preserves master, counter and image reference',()=>{
   const id=addUser(n++);sql(asUser(id,insert(id,1)));
   sql("INSERT INTO recipes(id,user_id,name) VALUES('"+owner(999)+"','"+id+"','recipe'); INSERT INTO recipe_items(recipe_id,user_item_master_id) SELECT '"+owner(999)+"',id FROM user_item_master WHERE user_id='"+id+"'");
   assert.throws(()=>sql(asUser(id,"DELETE FROM user_item_master")),/foreign key/i);
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'1');
  });
  await t.test('ownership, private-counter access, spoofing plan and deleted identity stay denied',()=>{
   const id=addUser(n++),other=addUser(n++);
   assert.throws(()=>sql(asUser(id,insert(other,1))),/row-level security|ownership/i);
   assert.throws(()=>sql(asUser(id,'UPDATE app_private.my_item_usage SET item_count=0')),/permission denied/);
   assert.throws(()=>sql(asUser(id,"UPDATE profiles SET plan='pro' WHERE user_id='"+id+"'")),/permission denied/);
   sql(asUser(id,insert(id,1)));
   assert.throws(()=>sql(asUser(id,"UPDATE user_item_master SET user_id='"+other+"'")),/owner|row-level/i);
   sql("DELETE FROM auth.users WHERE id='"+other+"'");
   assert.throws(()=>sql(asUser(other,insert(other,1))),/row-level security|ownership/i);
  });
  await t.test('Auth deletion retains quota for retained master and same-UUID restoration cannot reset usage',()=>{
   const id=addUser(n++);sql(asUser(id,insert(id,1)));sql("DELETE FROM auth.users WHERE id='"+id+"'");
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'1');
   assert.throws(()=>sql(asUser(id,insert(id,1,100))),/row-level security|ownership/i);
   sql("INSERT INTO auth.users(id) VALUES('"+id+"'); INSERT INTO profiles(user_id,plan,role) VALUES('"+id+"','free','user')");
   sql(asUser(id,insert(id,29,100)));assert.throws(()=>sql(asUser(id,insert(id,1,200))),/MY_ITEMS_LIMIT/);
   sql(asUser(id,'DELETE FROM user_item_master'));
   assert.equal(sql("SELECT count(*) FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'0');
  });

  await t.test('orphan My Item survives and consumes capacity when same Auth UUID is restored',()=>{
   assert.equal(sql("SELECT count(*) FROM user_item_master WHERE user_id='"+orphan+"'"),'1');
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+orphan+"'"),'1');
   sql("INSERT INTO auth.users(id) VALUES('"+orphan+"'); INSERT INTO profiles(user_id,plan,role) VALUES('"+orphan+"','free','user')");
   sql(asUser(orphan,insert(orphan,29,100)));
   assert.throws(()=>sql(asUser(orphan,insert(orphan,1,200))),/MY_ITEMS_LIMIT/);
   assert.equal(sql("SELECT count(*) FROM user_item_master WHERE user_id='"+orphan+"'"),'30');
  });
  await t.test('over-limit special user can edit/delete but not insert until count drops below 50',()=>{
   sql(asUser(legacy,"UPDATE user_item_master SET yomi='new reading' WHERE name='item-0'"));
   assert.throws(()=>sql(asUser(legacy,insert(legacy,1,100))),/MY_ITEMS_LIMIT/);
   sql(asUser(legacy,"DELETE FROM user_item_master WHERE name='item-1'"));
   assert.throws(()=>sql(asUser(legacy,insert(legacy,1,100))),/MY_ITEMS_LIMIT/);
   sql(asUser(legacy,"DELETE FROM user_item_master WHERE name='item-2'"));sql(asUser(legacy,insert(legacy,1,100)));
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+legacy+"'"),'50');
  });
  await t.test('589ff9e shopping INSERT, existing master upsert/edit/delete remain compatible at cap',()=>{
   const id=addUser(n++);sql(asUser(id,insert(id,30)));
   sql(asUser(id,"INSERT INTO shopping_items(user_id,name,category,checked) VALUES('"+id+"','normal quick add','その他',false)"));
   sql(asUser(id,"INSERT INTO user_item_master(user_id,name,yomi,category) VALUES('"+id+"','item-0','reading','その他') ON CONFLICT(user_id,name) DO UPDATE SET yomi=excluded.yomi,category=excluded.category"));
   sql(asUser(id,"UPDATE user_item_master SET image_url='🛒' WHERE name='item-0'"));
   sql(asUser(id,"DELETE FROM user_item_master WHERE name='item-1'"));sql(asUser(id,insert(id,1,100)));
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'30');
   assert.equal(sql("SELECT count(*) FROM shopping_items WHERE user_id='"+id+"'"),'1');
  });
  await t.test('4 concurrent terminals cannot claim the final slot twice',async()=>{
   const id=addUser(n++);sql(asUser(id,insert(id,29)));
   const results=await Promise.all([0,1,2,3].map(k=>asyncSql(asUser(id,insert(id,1,100+k)))));
   assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
   assert.equal(sql("SELECT item_count FROM app_private.my_item_usage WHERE user_id='"+id+"'"),'30');
  });
  await t.test('reconcile repairs only derived metadata without modifying original rows/policies',()=>{
   const before=sql(integrity);
   sql("UPDATE app_private.my_item_usage SET item_count=item_count+5 WHERE user_id='"+legacy+"'");
   sql(fs.readFileSync('security/sql/my-items-reconcile.sql','utf8'));
   assert.equal(sql(integrity),before);
   assert.equal(sql("SELECT item_count=(SELECT count(*) FROM user_item_master WHERE user_id='"+legacy+"') FROM app_private.my_item_usage WHERE user_id='"+legacy+"'"),'t');
   sql(fs.readFileSync('security/sql/my-items-postflight-readonly.sql','utf8'));
  });

  await t.test('post-COMMIT emergency guard withdrawal preserves every original row and security setting',()=>{
   const snapshot=sql(integrity);
   sql(fs.readFileSync('security/sql/my-items-remove-guard.sql','utf8'));
   assert.equal(sql(integrity),snapshot);
   assert.equal(sql("SELECT to_regclass('app_private.my_item_usage') IS NULL"),'t');
  });
  await t.test('reapplying after local withdrawal rebuilds exact usage without deleting over-limit rows',()=>{
   const snapshot=sql(integrity);
   sql(fs.readFileSync('security/sql/my-items-preflight-readonly.sql','utf8'));
   sql(migrationSql);
   assert.equal(sql(integrity),snapshot);
   assert.equal(sql("SELECT (SELECT sum(item_count) FROM app_private.my_item_usage)=(SELECT count(*) FROM user_item_master)"),'t');
   sql(fs.readFileSync('security/sql/my-items-postflight-readonly.sql','utf8'));
  });
  await t.test('Storage policies and own-master RLS were not replaced',()=>{
   assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN ('secure_image_read','secure_image_insert','secure_image_update','secure_image_delete')"),'4');
   assert.match(sql("SELECT with_check FROM pg_policies WHERE policyname='secure_own_master'"),/live_user/);
  });
 }finally{command('pg_ctl',['-D',path.join(folder,'data'),'-m','fast','-w','stop']);console.log('Retained synthetic test cluster (stopped): '+folder);}
});
