import { configDotenv } from 'dotenv';
import { createClient } from 'redis';

configDotenv();
// Creating Redis client
const client = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

// Declare as global
declare global {
    var redis: typeof client;
}
global.redis = client;

client.connect().catch((err: unknown) => {
    console.error('Redis client not connected to the server:', err);
});

// Handling Redis client connection
client.on('ready', () => {
    console.log('Redis client connected to the server');
});

// Handling Redis client end
client.on('end', () => {
    console.log('Redis client disconnected from the server');
});

export default client;