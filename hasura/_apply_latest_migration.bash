#!/usr/bin/env bash
latest_version=$(ls -1 migrations/default/ | tail -n 1 | sed 's/\_.*//')
hasura migrate apply --version "$latest_version" --database-name default