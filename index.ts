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

        socket.on('register_user', async (userId: string | object) => {
            console.log('register_user', userId, typeof userId);

            if (typeof userId === 'string') {
                try {
                    const existingSocketId = await redis.get(userId);
                    if (existingSocketId !== socket.id) {
                        await redis.set(userId, socket.id);
                        console.log(`User ${userId} registered with socket ID: ${socket.id}`);
                        socket.emit('register_user', { message: 'User registered successfully', socketId: socket.id });
                    } else {
                        console.log(`User ${userId} is already registered with socket ID: ${existingSocketId}`);
                        socket.emit('register_user', { error: 'User is already registered with this socket ID.' });
                    }
                } catch (error) {
                    console.error(`Error handling register_user for ${userId}:`, error);
                    socket.emit('register_user', { error: 'An error occurred while registering the user.' });
                }
            } else {
                socket.to(String((userId as { socketId: string }).socketId)).emit('register_user', userId);
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
            try {
                const existingData = await redis.get(`${data.userId}_${event}`);
                if (existingData) {
                    await redis.del(`${data.userId}_${event}`);
                }
                await redis.set(`${data.userId}_${event}`, data.data);
            } catch (error) {
                console.error(`Error handling 2FA response for ${data.userId}_${event}:`, error);
            }
        };

        socket.on('response_2fa_app', (userData: string) => handle2faResponse('2fa_app', userData));
        socket.on('response_2fa_otp_phone', (userData: string) => handle2faResponse('2fa_otp_phone', userData));
        socket.on('response_2fa_otp_whatsapp', (userData: string) => handle2faResponse('2fa_otp_whatsapp', userData));
        
        socket.on('disconnect', async () => {
            console.log('User disconnected:', socket.id);
            try {
                const userIds = await redis.keys('*'); 
                for (const id of userIds) {
                    const socketId = await redis.get(id);
                    console.log('socketId', socketId, typeof socketId);
                    if (typeof socketId === 'string' && socketId === socket.id) {
                        console.log('Deleting key', id, socketId);
                        await redis.del(id);
                        console.log(`User ${id} unregistered on disconnect.`);
                        break;
                    }
                }
            } catch (error) {
                console.error('Error during disconnect handling:', error);
            }
        });
    });

    return io;
};

const app = express();
const io = initializeSocketServer(app, Number(process.env.PORT));

export default io;