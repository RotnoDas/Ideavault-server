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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(" ")[1];
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
                    IdeaTitle: { 
                        $regex: search,
                        $options: "i"
                    },
                });
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
            let userName = req.user?.name || req.user?.username || req.user?.user?.name || req.user?.user?.username;
            
            const potentialIds = [
                req.user?.sub, 
                req.user?.userId, 
                req.user?.id, 
                req.user?.user?.id,
                req.user?.session?.userId
            ];
            
            if (!userName) {
                let userObj = null;
                for (const candidate of potentialIds) {
                    if (candidate) {
                        try {
                            if (ObjectId.isValid(candidate)) {
                                userObj = await database.collection("user").findOne({ _id: new ObjectId(candidate) });
                            } else {
                                const session = await database.collection("session").findOne({ token: candidate });
                                if (session && session.userId) {
                                    userObj = await database.collection("user").findOne({ _id: session.userId });
                                }
                            }
                            if (userObj) break;
                        } catch(e) {}
                    }
                }
                if (userObj && userObj.name) {
                    userName = userObj.name;
                }
            }
            const result = await ideasCollection.findOneAndUpdate(query, {
                $push: {
                    comments: {
                        comment,
                        user: userName || "Unknown User",
                        date: new Date()
                    }
                }
            });
            res.json(result);
        })
        // My interactions
        app.get("/my-interactions", logger, verifyToken, async(req, res) => {
            const database = client.db("ideavault");
            
            // Better-auth JWT payload can have different structures.
            // It could be at req.user.name, req.user.user.name, etc.
            let userName = req.user?.name || req.user?.username || req.user?.user?.name || req.user?.user?.username;
            
            // Try to find an ID to look up in the DB
            const potentialIds = [
                req.user?.sub, 
                req.user?.userId, 
                req.user?.id, 
                req.user?.user?.id,
                req.user?.session?.userId
            ];

            // If we don't have a name, let's try the DB
            if (!userName) {
                let userObj = null;
                for (const candidate of potentialIds) {
                    if (candidate) {
                        try {
                            if (ObjectId.isValid(candidate)) {
                                userObj = await database.collection("user").findOne({ _id: new ObjectId(candidate) });
                            } else {
                                // Maybe candidate is a session token string
                                const session = await database.collection("session").findOne({ token: candidate });
                                if (session && session.userId) {
                                    userObj = await database.collection("user").findOne({ _id: session.userId });
                                }
                            }
                            if (userObj) break;
                        } catch(e) {
                            // ignore and try next
                        }
                    }
                }
                if (userObj && userObj.name) {
                    userName = userObj.name;
                }
            }

            // Fallback if absolutely nothing works (just to avoid undefined search which returns nothing)
            if (!userName) {
                console.log("[/my-interactions] userName could not be resolved from JWT or DB!");
                return res.json([]);
            }

            console.log(`[/my-interactions] Fetching comments for resolved userName: "${userName}"`);

            // Case-insensitive regex search in DB
            const cursor = ideasCollection.find({ "comments.user": new RegExp(`^${userName}$`, 'i') });
            const ideas = await cursor.toArray();
            
            let userComments = [];
            ideas.forEach(idea => {
                if (idea.comments && Array.isArray(idea.comments)) {
                    idea.comments.forEach(c => {
                        // Case-insensitive check in JS as well
                        if (c.user && typeof c.user === 'string' && c.user.toLowerCase() === userName.toLowerCase()) {
                            userComments.push({
                                ideaId: idea._id,
                                IdeaTitle: idea.IdeaTitle,
                                comment: c.comment,
                                date: c.date || idea.createdAt || new Date()
                            });
                        }
                    });
                }
            });
            
            console.log(`[/my-interactions] Found ${userComments.length} comments for "${userName}"`);
            
            // Sort by date descending (newest first)
            userComments.sort((a, b) => new Date(b.date) - new Date(a.date));

            res.json(userComments);
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
