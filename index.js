const MongoClient = require("mongodb").MongoClient;
const config = require("./config.json");

const dbClient = new MongoClient(config.mongo, {useUnifiedTopology: true});

// CONSTANTS
const HEADER_OLDSTYLE = /^# Message archive for \"#(.+)\" \((\d{10,})\) in guild ".+" \((\d{10,})\)\n{1,2}# Format:\n\[date \+ time] Member ID\/Message ID\/Username - Message content\n----------------$/;
const HEADER_NEWSTYLE = /^# Message archive for guild ".+" \((\d{10,})\)\nIncluded channels: .+\n# Format:\n\[date \+ time] Member ID\/Message ID\/Channel\/Username - Message content\n----------------$/;
const MESSAGE_OLDSTYLE = /^\[([0-9/]{10} [0-9:]{8} UTC)\] \((\d{10,})\/(\d{10,})\/(.+)#(.{4})\): (.+)$/;
const MESSAGE_NEWSTYLE = /^\[([0-9/]{10} [0-9:]{8} UTC)\] \((\d{10,})\/(\d{10,})\/#(.+)\/(.+)#(.{4})\): (.+$)/;

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
            logDoc = await logsCursor.next();
            if(logDoc) {
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
            var messagesStartAt = Number(i) + 1;

            // Test Header
            const matchOld = header.match(HEADER_OLDSTYLE);
            const matchNew = header.match(HEADER_NEWSTYLE);
            var style, guildid, channel;
            if(matchOld) {
                style = "old";
                channel = {
                    name: matchOld[1],
                    id: matchOld[2],
                }
                guildid = matchOld[3];
            } else if(matchNew) {
                channel = {
                    name: "unknown",
                    id: "0",
                }
                style = "new";
                guildid = matchNew[1];
            }
            else throw new Error(`Document ${id || "[Unknown]"} does not have any known header.`);

            // We need to do some weird string manip to convert '2012-11-04T14:51:06.157Z' to '2012-11-04 14:51:06.157'
            const createdAt = new Date(doc.timestamp * 1000).toISOString().replace(/T/, ' ').replace(/Z/, '');
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
            
            // Default message values
            var time = new Date(0);
            var user = {
                id: 0,
                name: "Unknown",
                discriminator: "0000"
            };
            var text = "*unknown text*";
            var messageid = 0;

            // For each actual message
            for (i = messagesStartAt; i < lines.length; i++) {
                line = lines[i];

                if(style == 'old') {
                    const match = line.match(MESSAGE_OLDSTYLE);
                    if(match) {
                        time = match[1];
                        memberid = match[2];
                        messageid = match[3];
                        user = {
                            id: match[2],
                            name: match[4],
                            discrim: match[5]
                        };
                        text = match[6];
                    } else { // if not match assume part of last message, but add as new message
                        text = line;
                    }
                } else if(style == 'new') {
                    const match = line.match(MESSAGE_NEWSTYLE);
                    if(match) {
                        time = match[1];
                        memberid = match[2];
                        messageid = match[3];
                        channel = {
                            name: match[4],
                            id: "0"
                        };
                        user = {
                            id: match[2],
                            name: match[5],
                            discrim: match[6]
                        };
                        text = match[7];
                    } else text = line;
                }

                // more timestamp fun
                timestamp = new Date(time).toISOString().replace(/T/, ' ').replace(/Z/, '');

                msg = {
                    'timestamp': timestamp,
                    'message_id': messageid,
                    'content': text,
                    'type': 'thread_message',
                    'author': {
                        'id': user.id,
                        'name': user.name,
                        'discriminator': user.discrim,
                        'avatar_url': "", // TODO
                        'mod': false
                    },
                    'attachments': {},
                    'channel': channel
                };
                newDoc.messages.push(msg)
            }

            // console.log(JSON.stringify(newDoc))

            await collections.modmailLogs.insertOne(newDoc);

            console.log(`Converted ${id}.`);
        } catch (err) {
            console.log("Failed to convert document:", err.stack);
        }
    }

    dbClient.close();
})();