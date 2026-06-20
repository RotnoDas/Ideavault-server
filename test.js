const { MongoClient } = require('mongodb');
require('dotenv').config();
const client = new MongoClient(process.env.MONGO_URI);
async function run() {
  await client.connect();
  const db = client.db('ideavault');
  const ideas = await db.collection('ideas').find({ comments: { $exists: true } }).toArray();
  console.log('IDEAS WITH COMMENTS:');
  ideas.forEach(idea => {
    console.log(`IDEA ID: ${idea._id}`);
    console.log(JSON.stringify(idea.comments, null, 2));
  });
  await client.close();
}
run().catch(console.dir);
