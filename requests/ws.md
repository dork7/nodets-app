To connet with websocket

localhost:2020/ws/mcp?type=mcp


payload
{
  "type": "request",
  "id": "1234",
  "method": "getTime",
  "params": { "userId": 42 }
}


For streaming 

localhost:2020/ws/stream


{
  "type": "request",
  "id": "1234",
  "method": "stream",
  "params": { "n": 42 }
}
