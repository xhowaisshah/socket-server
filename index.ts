import express, { Application } from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import redis from './utils/redis';
import { configDotenv } from 'dotenv';

configDotenv();

const initializeSocketServer = (app: Application, socketPort: number): Server => {
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['*'],
            credentials: true
        }
    });

    server.listen(socketPort, () => {
        console.log(`Socket server is running at http://localhost:${socketPort}`);
    });

    io.on('connection', (socket: Socket) => {
        console.log('A user connected:', socket.id);

        socket.on('register_user', async (userId: string) => {
            console.log('register_user', userId, typeof userId);

            const existingSocketId = await redis.get(userId);
            if (existingSocketId !== socket.id) {
                await redis.set(userId, socket.id);
                console.log(`User ${userId} registered with socket ID: ${socket.id}`);
                socket.emit('register_user', { message: 'User registered successfully', socketId: socket.id });
            } else {
                console.log(`User ${userId} is already registered with socket ID: ${existingSocketId}`);
                socket.emit('register_user', { error: 'User is already registered with this socket ID.' });
            }
        });

        const handle2faResponse = async (event: string, userData: string) => {
            console.log(event, typeof userData);
            let data;
            try {
                data = JSON.parse(userData);
            } catch (error) {
                console.error('Failed to parse userData:', error);
                return;
            }
            console.log('Data', data, typeof data);
            const existingData = await redis.get(`${data.userId}_${event}`);
            if (existingData) {
                await redis.del(`${data.userId}_${event}`).catch(err => {
                    console.error(`Error deleting existing data for ${data.userId}_${event}:`, err);
                });
            }
            await redis.set(`${data.userId}_${event}`, data.data).catch(err => {
                console.error(`Error setting data for ${data.userId}_${event}:`, err);
            });
        };

        socket.on('response_2fa_app', (userData: string) => handle2faResponse('2fa_app', userData));
        socket.on('response_2fa_otp_phone', (userData: string) => handle2faResponse('2fa_otp_phone', userData));
        socket.on('response_2fa_otp_whatsapp', (userData: string) => handle2faResponse('2fa_otp_whatsapp', userData));
        
        socket.on('disconnect', async () => {
            console.log('User disconnected:', socket.id);
            const userIds = await redis.keys('*'); 
            for (const id of userIds) {
                const socketId = await redis.get(id);
                console.log('socketId', socketId, typeof socketId);
                if (typeof socketId === 'string' && socketId === socket.id) {
                    try {
                        console.log('Deleting key', id, socketId);
                        await redis.del(id);
                        console.log(`User ${id} unregistered on disconnect.`);
                    } catch (error: unknown) {
                        console.error(`Error deleting key ${id}:`, error);
                    }
                    break;
                }
            }
        });
    });

    return io;
};

const app = express();
const io = initializeSocketServer(app, Number(process.env.PORT));

export default io;