#!/usr/bin/env bash
if [[ $(basename $(pwd)) != "hasura" ]]; then
  echo "Run this script from the ./hasura directory"
  exit 1
fi
latest_version=$(ls -1 ./migrations/default/ | tail -n 1 | sed 's/\_.*//')
hasura migrate apply --version "$latest_version" --database-name default
