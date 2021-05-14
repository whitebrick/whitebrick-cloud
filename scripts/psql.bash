#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo "Run this script from the parent directory"
  exit 1
fi
export $(cat .env.development | sed 's/#.*//g' | xargs)
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -p $DB_PORT $DB_NAME
