#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo -e "\nRun this script from the parent directory\n"
  exit 1
fi
export $(cat .env.staging | sed 's/ /-/g' | sed 's/#.*//g' | xargs)
PGPASSWORD=$DB_PASSWORD pg_dump -c --no-owner -Fc -U $DB_USER -h $DB_HOST_DIRECT -p $DB_PORT $DB_NAME > db/dumps/staging_latest.psql