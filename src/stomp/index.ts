import { Client } from '@stomp/stompjs';

export const client = new Client({
  brokerURL: 'ws://localhost:15674/ws', // STOMP over WebSocket
  connectHeaders: {
    login: 'guest',
    passcode: 'guest',
  },
  debug: (str) => console.log(str),
});

client.onConnect = (frame) => {
  console.log('Connected:', frame);

  // Subscribe to a topic
  client.subscribe('/topic/chat', (message) => {
    console.log('Received:', message.body);
  });

  // Send a message
  client.publish({ destination: '/topic/chat', body: 'Hello STOMP!' });
};

client.onStompError = (frame) => {
  console.error('Broker reported error:', frame.headers['message']);
  console.error('Additional details:', frame.body);
};
