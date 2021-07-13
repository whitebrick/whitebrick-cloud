#!/usr/bin/env bash
if [[ $(basename $(pwd)) != "db" ]]; then
  echo -e "\nRun this script from the ./scridbpts directory\n"
  exit 1
fi
export $(cat ../.env.development | sed 's/#.*//g' | xargs)
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -p $DB_PORT $DB_NAME < seed.sql
