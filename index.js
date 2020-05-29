const MongoClient = require("mongodb").MongoClient;

const config = require("./config.json");

(async function() {
    const dbClient = new MongoClient(config.mongo, {useUnifiedTopology: true});

    // Connect to database
    try {
        await dbClient.connect();
        const db = {
            bowser: dbClient.db('bowser'),
            modmail: dbClient.db('modmail')
        };
        console.log("Connected to database.")
    } catch (err) {
        console.log("Failed to connect to database:", err.stack);
        process.exit(1);
    }

    
    // TODO: MAGIC

    dbClient.close();
})();