#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo -e "\nRun this script from the parent directory\n"
  exit 1
fi
NODE_ENV=development serverless offline --port 3001 start
