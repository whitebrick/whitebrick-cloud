#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo "Run this script from the parent directory"
  exit 1
fi
NODE_ENV=development serverless offline start
