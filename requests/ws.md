To connet with websocket

ws://localhost:2020/ws/mcp?type=mcp

payload
{
  "type": "request",
  "id": "1234",
  "method": "getTime",
  "params": { "userId": 42 }
}


For streaming 

ws://localhost:2020/ws/stream


{
  "type": "request",
  "id": "1234",
  "method": "stream",
  "params": { "n": 42 }
}


ws://localhost:2020/ws/chatAI


{
    "sender": "User",
    "type": "request",
    "id": "sess-emsshns3n",
    "method": "chatAI",
    "stream": false,
    "model": "ai/gemma3",
    "params": {
        "prompt": "hello"
    }
}