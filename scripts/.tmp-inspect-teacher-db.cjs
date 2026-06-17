const fs = require('fs');
const path = require('path');
for (const f of ['.env', 'packages/backend/.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const i = l.indexOf('=');
    process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
let mongodb;
try { mongodb = require('mongodb'); } catch (_) { mongodb = require(path.join(process.cwd(), 'packages', 'backend', 'node_modules', 'mongodb')); }
const { MongoClient, ObjectId } = mongodb;
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mathai';
let dbName = process.env.DB_NAME || process.env.MONGODB_DB;
if (!dbName) {
  try { dbName = new URL(uri).pathname.replace(/^\//, '') || 'mathai'; }
  catch (_) { dbName = 'mathai'; }
}
(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(JSON.stringify({ dbName, uri: uri.replace(/:\/\/[^@]+@/, '://[redacted]@') }, null, 2));
  const collections = (await db.listCollections().toArray()).map((x) => x.name).filter((n) => /user|student|teacher|profile/i.test(n));
  console.log('collections', JSON.stringify(collections, null, 2));
  const user = await db.collection('users').findOne({ email: 'student@mathai.vn' }, { projection: { _id: 1, email: 1, role: 1 } });
  console.log('studentUser', JSON.stringify(user, null, 2));
  console.log('studentprofiles', JSON.stringify(await db.collection('studentprofiles').find({}).project({ _id: 1, user_id: 1, userId: 1 }).limit(10).toArray(), null, 2));
  console.log('profiles', JSON.stringify(await db.collection('profiles').find({}).project({ _id: 1, user_id: 1, userId: 1 }).limit(10).toArray().catch(() => []), null, 2));
  console.log('roleprofiles', JSON.stringify(await db.collection('roleprofiles').find({}).project({ _id: 1, user_id: 1, userId: 1, role: 1 }).limit(10).toArray().catch(() => []), null, 2));
  console.log('teacherClass', JSON.stringify(await db.collection('teacherclasses').findOne({ _id: new ObjectId('69fc002c9f998e8ddff6b32a') }, { projection: { _id: 1, student_ids: 1, teacher_id: 1 } }), null, 2));
  await client.close();
})().catch((e) => { console.error(e); process.exit(1); });
