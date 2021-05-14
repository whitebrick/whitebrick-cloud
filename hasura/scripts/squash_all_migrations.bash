#!/usr/bin/env bash
if [[ $(basename $(pwd)) != "hasura" ]]; then
  echo "Run this script from the ./hasura directory"
  exit 1
fi
earliest_version=$(ls -1 migrations/default/ | head -n 1 | sed 's/\_.*//')
hasura migrate squash --name "WbConsolidatedMigrations" --from "$earliest_version" --database-name default
