#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo -e "\nRun this script from the parent directory\n"
  exit 1
fi
export $(cat .env.development | sed 's/ /-/g' | sed 's/#.*//g' | xargs)
PGPASSWORD=$DB_PASSWORD pg_restore -c --no-owner -Fc -U $DB_USER -h $DB_HOST_DIRECT -p $DB_PORT -d $DB_NAME db/dumps/prod_latest.psql