#!/bin/bash
echo "Starting integration tests..."
touch ./db.log
docker exec -it graphcast-poc-indexer-1-1 sqlite3 poi_crosschecker.db "select * from poi_crosschecker;" ".exit" >./db.log

if [ -s ./db.log ]; then
    docker exec -it graphcast-poc-indexer-1-1 node tests/integration/compareAttestations.js
    printf "\n"
    rm -rf ./db.log
else
    echo "⚠️ DB is empty. Please ensure that the relevant Docker containers are up and running."
fi
