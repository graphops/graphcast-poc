#!/bin/bash
echo "Starting integration tests..."
touch db.log
docker-compose up -d wiremock mock-instance-1 mock-instance-2 mock-instance-3 mock-instance-4 mock-instance-5 mock-instance-6 mock-instance-7 mock-instance-8
docker compose run -d -e TEST_TOPIC="QmacQnSgia4iDPWHpeY6aWxesRFdb8o5DKZUx96zZqEWrB" -e TEST_ENVIRONMENT=true -e REGISTRY_SUBGRAPH="http://host.docker.internal:8031/mock-registry-subgraph" --name real-indexer poi-crosschecker

containers=$(docker container ls --format "{{.Names}}")
echo "⌛ Waiting for containers to be running and messages to start flowing."
sleep 2

while :;
do
    docker exec -it real-indexer sqlite3 poi_crosschecker.db "select * from npois;" ".exit" > db.log
    if [ $(wc -l < db.log) -gt 2 ]; then
        sleep 10
        docker exec -it real-indexer node tests/integration/integrationTests.js containers=$containers
    fi

    sleep 2
done
