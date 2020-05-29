const MongoClient = require("mongodb").MongoClient;
const config = require("./config.json");

const dbClient = new MongoClient(config.mongo, {useUnifiedTopology: true});

// CONSTANTS
const HEADER_OLDSTYLE = /^# Message archive for \"#.+\" \(\d{10,}\) in guild ".+" \((\d{10,})\)\n{1,2}# Format:\n\[date \+ time] Member ID\/Message ID\/Username - Message content\n----------------$/;
const HEADER_NEWSTYLE = /^# Message archive for guild ".+" \((\d{10,})\)\nIncluded channels: .+\n# Format:\n\[date \+ time] Member ID\/Message ID\/Channel\/Username - Message content\n----------------$/;

(async function() {
    // Connect to database and set exposed collections
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
            const lines = body.split('\n');

            console.log(`Converting ${id}...`);

            // Check if archive already exists
            logsCursor = collections.modmailLogs.find({"_id" : id});
            if(logsCursor) {
                console.log(`${id} already exists in the logs collection.`);
                continue;
            }

            // Extract Header
            var header = "";
            var i;
            for(i in lines) {
                const line = lines[i];
                header += line;
                if(line === "----------------") break;
                else header += '\n';
            };
            var messagesStartAt = i + 1;

            // Test Header
            const matchOld = header.match(HEADER_OLDSTYLE);
            const matchNew = header.match(HEADER_NEWSTYLE);
            var style, guildid;
            if(matchOld) {
                style = "old";
                guildid = matchOld[1];
            } else if(matchNew) {
                style = "new";
                guildid = matchNew[1];
            }
            else throw new Error(`Document ${id || "[Unknown]"} does not have any known header.`);

            // We need to do some weird string manip to convert '2012-11-04T14:51:06.157Z' to '2012-11-04 14:51:06.157'
            const createdAt = new Date(doc.timestamp * 1000) // sec * 1000 = ms
                .toISOString().replace(/T/, ' ').replace(/Z/, '');
            const closedAt = new Date().toISOString().replace(/T/, ' ').replace(/Z/, ''); 
            
            // Initialize document w/o messages
            const newDoc = {
                "_id": id,
                "key": id,
                "migrated": true,
                "open": false,
                "created_at": createdAt,
                "closed_at": closedAt,
                "channel_id": "0",
                "guild_id": guildid, 
                "bot_id": config.botid,
                "recipient": {
                    "id": 0,
                    "name": "Migrated Archive",
                    "discriminator": 0,
                    "avatar_url": config.avatar,
                    "mod": false
                },
                "creator": {
                    "id": "0",
                    "name": "migrator", 
                    "discriminator": 0,
                    "avatar_url": "",
                    "mod": false
                },
                "closer": {
                    "id": "0",
                    "name": "migrator", 
                    "discriminator": 0,
                    "avatar_url": "",
                    "mod": false
                },
                "messages": []
            };
            // TODO: DO MAGIC

            console.log(JSON.stringify(document))

            // console.log(doc);
        } catch (err) {
            console.log("Failed to convert document:", err.stack);
        }
    }

    dbClient.close();
})();