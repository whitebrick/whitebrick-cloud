#!/usr/bin/env bash
if [[ $(basename $(pwd)) != "functional" ]]; then
  echo -e "\nRun this script from within the ./test/functional directory\n"
  exit 1
fi

KARATE_CMD="karate --format='~html,~json,~txt,~cucumber:json' --threads=1"

echo -e "Checking for karate..."
which karate
if [ $? -ne 0 ]; then
  echo -e "\nThe karate command could not be found\n"
  exit $retVal
fi

rm -Rf ./target

# Comment out below to debug
tests=(
  "reset"
  "users"
  "organizations"
  "schemas"
  "tables"
  "permissions"
)

if [ $# -gt 0 ]; then
  if [[ "$1" == "importDBs" ]]; then
    tests=("import_dbs")
  elif [[ "$1" == "withImportDBs" ]]; then
    tests+=("import_dbs")
  else
    echo -e "Error: $1 argument not recognized."
    exit 1;
  fi
fi

for test in "${tests[@]}"
do
  cmd="${KARATE_CMD} ${test}/${test}.feature"
  echo -e "\n\n******************************************************"
  echo -e "** Running Test: ${test}"
  echo -e "******************************************************\n"
  echo -e "${cmd}"
  eval $cmd
  retVal=$?
  if [ $retVal -ne 0 ]; then
    exit $retVal
  fi
done
