const MongoClient = require("mongodb").MongoClient;
const config = require("./config.json");

const dbClient = new MongoClient(config.mongo, {useUnifiedTopology: true});

// CONSTANTS
const HEADER_OLDSTYLE = /^# Message archive for \"#.{10,}\" \(\d+\) in guild ".+" \((\d{10,})\)\n{1,2}# Format:\n\[date \+ time] Member ID\/Message ID\/Username - Message content\n----------------$/;
const HEADER_NEWSTYLE = /^# Message archive for guild ".+" \((\d{10,})\)\nIncluded channels: .+\n# Format:\n\[date \+ time] Member ID\/Message ID\/Channel\/Username - Message content\n----------------$/;

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
            const id = doc._id;
            const body = doc.body;
            const timestamp = doc.timestamp;
            // console.log(`Converting ${id}...`);

            
            const lines = body.split('\n');
            
            // Extract Header
            var header = "";
            for(i in lines) {
                const line = lines[i];
                header += line;
                if(line === "----------------") break;
                else header += '\n';
            };

            // Test Header
            if(header.match(HEADER_OLDSTYLE)) console.log(`👌 ${id} matches old-style header`);
            else if(header.match(HEADER_NEWSTYLE)) console.log(`👌 ${id} matches new-style header`);
            else console.log(`⚠️ ${id} does not match any known header type`);

            // TODO: DO MAGIC

            // console.log(doc);
        } catch (err) {
            console.log("Failed to convert document:", err.stack);
            process.exit(1);
        }
    }
})();