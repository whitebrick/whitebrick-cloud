#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo -e "\nRun this script from the parent directory\n"
  exit 1
fi
echo -e "\n\n ** NB: If responses are hanging check your version of node **"
echo -e "    See: https://github.com/dherault/serverless-offline/issues/1150\n\n"
NODE_ENV=development serverless offline --port 3000 start
