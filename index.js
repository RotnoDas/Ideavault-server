const dns = require("dns");
dns.setServers(["8.8.8.8"], ["8.8.4.4"]);
const express = require("express");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 8000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const uri = process.env.MONGO_URI;

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
)
console.log(JWKS);

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

const logger = (req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
}

const verifyToken = async(req, res, next) => {
    const token = req.headers.authorization.split(" ")[1];
    if(!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const JWKS = createRemoteJWKSet(
        new URL('http://localhost:3000/api/auth/jwks')
        )
        const { payload } = await jwtVerify(token, JWKS)
        req.user = payload;
        console.log(req.user);
        next();
    } catch (error) {
        console.error('Token validation failed:', error)
        return res.status(401).json({ message: "Unauthorized" });
    }
}

async function run() {
    try {
        await client.connect();
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
        const database = client.db("ideavault");
        const ideasCollection = database.collection("ideas");
        // Get all ideas
        app.get("/ideas", async(req, res) => {
            const {search} = req.query;
            let cursor;
            if(search) {
                cursor = ideasCollection.find({
                    title: { $eq: search }
                })
            } else {
                cursor = ideasCollection.find();
            }
            const result = await cursor.toArray();
            res.json(result);
        })
        // Get single idea
        app.get("/ideas/:ideaId", logger, verifyToken, async(req, res) => {
            const ideaId = req.params.ideaId;
            const query = {
                _id: new ObjectId(ideaId)
            }
            const result = await ideasCollection.findOne(query);
            res.json(result);
        })
        // Featured ideas
        app.get("/featured", async(req, res) => {
            const cursor = ideasCollection.find().limit(6);
            const result = await cursor.toArray();
            res.json(result);
        })
        // Comment on idea
        app.post("/ideas/:ideaId/comment", logger, verifyToken, async(req, res) => {
            const ideaId = req.params.ideaId;
            const comment = req.body.comment;
            const query = {
                _id: new ObjectId(ideaId)
            }
            
            let userName = req.user.name || req.user.username;
            const userIdString = req.user.sub || req.user.userId || req.user.id;
            
            if (userIdString) {
                try {
                    const userObj = await database.collection("user").findOne({ _id: new ObjectId(userIdString) });
                    if (userObj && userObj.name) {
                        userName = userObj.name;
                    }
                } catch(e) {
                    console.log("Failed to lookup user by ID:", e);
                }
            }

            const result = await ideasCollection.findOneAndUpdate(query, {
                $push: {
                    comments: {
                        comment,
                        user: userName || "Unknown User"
                    }
                }
            });
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
