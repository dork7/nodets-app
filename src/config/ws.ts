import { wss } from '@/server';

wss.on('connection', (ws) => {
 console.log('Client connected');

 ws.on('message', (message) => {
  console.log(`Received message: ${message}`);
 });

 // Send real-time updates
 setInterval(() => {
  ws.send(JSON.stringify({ data: 'Real-time data update' }));
 }, 1000);

 ws.on('close', () => {
  console.log('Client disconnected');
 });
});
