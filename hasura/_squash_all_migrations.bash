#!/usr/bin/env bash
earliest_version=$(ls -1 migrations/default/ | head -n 1 | sed 's/\_.*//')
hasura migrate squash --name "WbConsolidatedMigrations" --from "$earliest_version" --database-name default
