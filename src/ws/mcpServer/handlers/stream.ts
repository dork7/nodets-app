export const name = 'stream';
export const handler = async (ws: any, message: any) => {
 const n = message.params?.n || 5;
  ws.send(JSON.stringify({ type: 'stream_start', id: message.id }));
 for (let i = 1; i <= n; i++) {
  ws.send(JSON.stringify({ type: 'stream_chunk', id: message.id, chunk: i.toString() }));
//   await new Promise((resolve) => setTimeout(resolve, 500)); // simulate delay
 }
 ws.send(JSON.stringify({ type: 'stream_end', id: message.id }));
};
