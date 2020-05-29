const MongoClient = require("mongodb").MongoClient;

const config = require("./config.json");

const dbClient = new MongoClient(config.mongo, {useUnifiedTopology: true});

(async function() {
    // --- Connect to database and set exposed collections
    let collections = {};
    try {
        await dbClient.connect();

        const bowser = dbClient.db('bowser');
        const modmail =  dbClient.db('modmail');
        
        collections = {
            bowserArchive: bowser.collection('archive'),
            modmailLogs: modmail.collection('logs')
        };

        console.log("Connected to database.");
    } catch (err) {
        console.log("Could not connect to database:", err.stack);
        process.exit(1);
    }

    // Setup archive cursor and test/report on collections
    let archiveCursor;
    try {
        archiveCursor = collections.bowserArchive.find({});
        logsCursor = collections.modmailLogs.find({});


        archiveCount = await archiveCursor.count();
        logsCount = await logsCursor.count();

        console.log(`Bowser archive collection reports ${archiveCount} items.`);
        console.log(`Modmail logs collection reports ${logsCount} items.`);
    } catch (err) {
        console.log("Failed to check collections:", err.stack);
        process.exit(1);
    }
    
    for await(const doc of archiveCursor) {
        try {
            console.log(`Converting ${doc._id}...`)
            
            // TODO: Magic
            console.log(doc)
        } catch (err) {
            console.log("Failed to convert document:", err.stack);
            process.exit(1);
        }
    }
})();