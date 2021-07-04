#!/usr/bin/env bash
export $(cat ../.env.development | sed 's/#.*//g' | xargs)
echo "*** test/report_permissions.bash: Reporting permissions..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < ./db/report_permissions.sql
