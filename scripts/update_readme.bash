#!/usr/bin/env bash

SITE="whitebrick-cloud"
if [[ $(basename $(pwd)) != "$SITE" ]]; then
  echo -e "\nError: Run this script from the top level '$SITE' directory.\n"
  exit 1
fi

# for osx: brew install gnu-sed; brew info gnu-sed

FROM_FILES="../whitebrick-web/docs/docs/*.md"
TO_FILE="README.md"
FROM_IMAGES="../whitebrick-web/docs/assets/whitebrick-*.png"
TO_IMAGES="doc/"

PARTIALS=(
  "LICENSING"
  "SUMMARY"
  "BACKEND_SETUP"
)

read_txt() {
  cat $2 > temp.md
  gsed -i 's/`/BACKTICK/g' temp.md
  gsed -i "s/'/SINGLEQUOTE/g" temp.md
  gsed -i 's/"/DOUBLEQUOTE/g' temp.md
  gsed -i 's/ /WHITESPACE/g' temp.md
  local cmd="gsed -n '/START:$1/,/END:$1/{/START:$1/!{/END:$1/!p}}' temp.md"
  eval "$cmd"
}

find_replace() {
  local cmd="gsed -n -i '/START:'$1'/{p;:a;N;/END:'$1'/!ba;s^.*\n^'\"${2//$'\n'/\\n}\"'\n^};p' $3"
  echo "* find_replace"
  echo "===================================================================================================="
  echo $cmd
  echo "===================================================================================================="
  eval $cmd
}

update_txt() {
  echo -e "\nProcessing $1 from $2 to $3"
  local txt="$(read_txt "$1" "$2")"
  local preview=$(echo $txt | gsed -z 's/\n/ /g')
  echo "* read_txt ~ ${preview:0:50}..."
  find_replace "$1" "$txt\n" "$3"
}

for i in "${PARTIALS[@]}"
do
  update_txt "$i" "$FROM_FILES" "$TO_FILE"
done

# copy images
cp $FROM_IMAGES $TO_IMAGES

gsed -i 's/BACKTICK/`/g' $TO_FILE
gsed -i "s/SINGLEQUOTE/'/g" $TO_FILE
gsed -i 's/DOUBLEQUOTE/"/g' $TO_FILE
gsed -i 's/WHITESPACE/ /g' $TO_FILE
rm temp.md
