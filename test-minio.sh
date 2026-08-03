#!/bin/bash

echo "=== Minio Integration Tests ==="
echo

# Function to run tests
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    
    echo "Testing: $name"
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST "$url" $data)
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -X DELETE "$url")
    elif [ "$method" = "GET" ]; then
        response=$(curl -s "$url")
    fi
    
    echo "Response: $response"
    echo
}

# Test 1: Check if server is running
echo "1. Checking server status..."
if curl -s http://localhost:2020/v1/health-check > /dev/null 2>&1; then
    echo "✓ Server is running"
else
    echo "✗ Server is not running. Starting server..."
    npm run dev &
    sleep 5
fi

echo
echo "2. Testing Minio single file upload..."
curl -X POST 'http://localhost:2020/v1/minio/upload' \
    -F 'file=@package.json' \
    -H 'Accept: application/json'

echo
echo
echo "3. Testing Minio multiple file upload..."
curl -X POST 'http://localhost:2020/v1/minio/upload/multiple' \
    -F 'files=@package.json' \
    -F 'files=@tsconfig.json' \
    -H 'Accept: application/json'

echo
echo
echo "4. Testing Minio file deletion (using example filename)..."
curl -X DELETE 'http://localhost:2020/v1/minio/delete/example-file.txt' \
    -H 'Accept: application/json'

echo
echo "=== Tests Complete ==="