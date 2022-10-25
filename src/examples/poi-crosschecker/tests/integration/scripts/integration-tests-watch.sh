#!/bin/bash
echo "Starting integration tests..."
touch db.log
docker-compose up -d wiremock mock-indexer-1 mock-indexer-2 mock-indexer-3 mock-indexer-4 mock-indexer-5 mock-indexer-6 mock-indexer-7 mock-indexer-8
docker compose run -d -e TEST_TOPIC="QmacQnSgia4iDPWHpeY6aWxesRFdb8o5DKZUx96zZqEWrB" -e TEST_ENVIRONMENT=true -e REGISTRY_SUBGRAPH="http://host.docker.internal:8031/mock-registry-subgraph" --name mock-indexer-1 indexer-1

containers=$(docker container ls --format "{{.Names}}")
echo "⌛ Waiting for containers to be running and messages to start flowing."

while :;
do
    docker exec -it graphcast-poc-mock-indexer-1-1 sqlite3 npois.db "select * from npois;" ".exit" > db.log
    if [ $(wc -l < db.log) -gt 2 ]; then
        sleep 3
        docker exec -it graphcast-poc-mock-indexer-1-1 node tests/integration/integrationTests.js containers=$containers
    fi

    sleep 2
done