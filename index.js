const express = require("express");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
app.use(cors());
const port = process.env.PORT || 8000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        await client.connect();
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
        const database = client.db("ideavault");
        const ideasCollection = database.collection("ideas");
        // Get all ideas
        app.get("/ideas", async(req, res) => {
            const cursor = ideasCollection.find();
            const result = await cursor.toArray();
            res.json(result);
        })
        // Get single idea
        app.get("/ideas/:ideaId", async(req, res) => {
            const ideaId = req.params.ideaId;
            const query = {
                _id: new ObjectId(ideaId)
            }
            const result = await ideasCollection.findOne(query);
            res.json(result);
        })
    } finally {
        //await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Server is running on ${port}`);
});
