#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo "Run this script from the parent directory"
  exit 1
fi
latest_version=$(ls -1 migrations/default/ | tail -n 1 | sed 's/\_.*//')
hasura migrate apply --version "$latest_version" --skip-execution --database-name default
