#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo "Run this script from the parent directory"
  exit 1
fi
if [ $# -eq 0 ]; then
  echo "Pass a name for the migration"
  exit 2
fi
hasura migrate create "$1" --database-name default
