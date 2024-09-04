import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const users: { [keys: string]: { ws: WebSocket, rooms: string[] } } = {};

async function main() {
    // a single client can either publish or subscribe
    // hence we need to create two redis clients 
    // one is for publishing an event and another one 
    // is for subscribing the events

    const publishClient = createClient();
    const subscribeClient = createClient();

    await publishClient.connect();
    await subscribeClient.connect();

    const PORT = process.argv[2] || 8080;
    const wss = new WebSocketServer({ port: Number(PORT) });


    wss.on('connection', function connection(userSocket: WebSocket) {
        const id = Math.random();
        users[id] = {
            ws: userSocket,
            rooms: []
        }

        userSocket.on('message', function message(data, isBinary) {
            const parsedMessage = JSON.parse(data as unknown as string);

            if (parsedMessage.type === 'SUBSCRIBE') {
                users[id].rooms.push(parsedMessage.room);
                console.log(id);
                if (isFirstUserSubscribing(parsedMessage.room)) {
                    console.log("subscribing to room ", parsedMessage.room);
                    subscribeClient.subscribe(parsedMessage.room, (message) => {
                        Object.keys(users).forEach((userId) => {
                            const { ws, rooms } = users[userId];
                            if (rooms.includes(parsedMessage.room)) {
                                const data = JSON.parse(message);
                                console.log("data", data.message);
                                ws.send(data.message);
                            }
                        });
                    });
                }
            }

            if (parsedMessage.type == 'UNSUBSCRIBE') {
                const index = users[id].rooms.indexOf(parsedMessage.room);
                users[id].rooms.splice(index, 1);
                if(isLastUserUnsubscribing(parsedMessage.room)) {
                    console.log("Unsubscribing from pub sub ");
                    subscribeClient.unsubscribe(parsedMessage.room);
                }
            }

            if (parsedMessage.type === 'sendMessage') {
                const { message, roomId } = parsedMessage;
                publishClient.publish(roomId, JSON.stringify({
                    type: "sendMessage",
                    roomId,
                    message
                }));
            }
        });
    });
}

function isFirstUserSubscribing(roomId: string): boolean {
    let totalSubscribedUsers = 0;
    Object.keys(users).forEach((userId) => {
        if (users[userId].rooms.includes(roomId)) {
            totalSubscribedUsers++;
        }
    });
    return totalSubscribedUsers === 1;
}

function isLastUserUnsubscribing(roomId: string): boolean {
    let totalSubscribedUsers = 0;
    Object.keys(users).forEach((userId) => {
        if (users[userId].rooms.includes(roomId)) {
            totalSubscribedUsers++;
        }
    });
    return totalSubscribedUsers === 0;
}

main();