const fs = require('fs');
const path = require('path');

function loadEnv(file, override = false) {
  const loaded = new Set();
  if (!fs.existsSync(file)) return loaded;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    loaded.add(key);
    if (override || !process.env[key]) process.env[key] = value;
  }
  return loaded;
}

const rootEnv = loadEnv(path.join(process.cwd(), '.env'));
const backendEnv = loadEnv(path.join(process.cwd(), 'packages', 'backend', '.env'), true);
if (!backendEnv.has('DB_NAME') && rootEnv.has('DB_NAME')) delete process.env.DB_NAME;

let mongodb;
try { mongodb = require('mongodb'); }
catch (_) { mongodb = require(path.join(process.cwd(), 'packages', 'backend', 'node_modules', 'mongodb')); }
const { MongoClient, ObjectId } = mongodb;

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
  await client.connect();
  const db = client.db(process.env.DB_NAME || 'mathai');
  const classId = '69fc002c9f998e8ddff6b32a';
  const studentId = '69e81b14eadbc114b25bca12';

  const assignments = await db.collection('teacherassignments')
    .find({ title: /Teacher Business Audit teacher-business-audit-/ })
    .project({ _id: 1, title: 1 })
    .toArray();
  const assignmentIds = assignments.map((a) => a._id);

  let deletedSubmissions = 0;
  let deletedGradebook = 0;
  let deletedAssignments = 0;
  if (assignmentIds.length) {
    deletedSubmissions = (await db.collection('studentsubmissions').deleteMany({ assignment_id: { $in: assignmentIds } })).deletedCount;
    deletedGradebook = (await db.collection('gradebookentries').deleteMany({ source_type: 'teacher_assignment', source_id: { $in: assignmentIds.map(String) } })).deletedCount;
    deletedAssignments = (await db.collection('teacherassignments').deleteMany({ _id: { $in: assignmentIds } })).deletedCount;
  }

  const proposalFilter = {
    $or: [
      { 'data.name': /^Teacher Audit Proposal / },
      { 'data.description': /^teacher-business-audit-/ },
    ],
  };
  let deletedProposals = 0;
  for (const name of ['approvalrequests', 'approvalproposals', 'adminapprovalrequests', 'proposals']) {
    try { deletedProposals += (await db.collection(name).deleteMany(proposalFilter)).deletedCount; }
    catch (_) {}
  }

  const pull = await db.collection('teacherclasses').updateOne(
    { _id: new ObjectId(classId) },
    { $pull: { student_ids: new ObjectId(studentId) }, $set: { updatedAt: new Date() } }
  );
  const cls = await db.collection('teacherclasses').findOne({ _id: new ObjectId(classId) }, { projection: { student_ids: 1 } });

  console.log(JSON.stringify({
    dbName: db.databaseName,
    staleAssignments: assignments.map((a) => String(a._id)),
    deleted: {
      submissions: deletedSubmissions,
      gradebook: deletedGradebook,
      assignments: deletedAssignments,
      proposals: deletedProposals,
    },
    pulledDemoStudentFromSeedClass: pull.modifiedCount,
    classStudentCount: cls?.student_ids?.length ?? null,
  }, null, 2));
  await client.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
