#!/usr/bin/env bash
if [[ $(basename $(pwd)) == "scripts" ]]; then
  echo -e "\nRun this script from the parent directory\n"
  exit 1
fi
echo -e "\nNote: If you stop the script before completion run the mv command below to restore your serverless.yml"
echo -e "    mv serverless.yml.tmp serverless.yml\n"
export $(cat .env.prod | sed 's/ /-/g' | sed 's/#.*//g' | xargs)
cp serverless.yml serverless.yml.tmp
sed -i '' "s/SECURITY_GROUP_1/$SECURITY_GROUP_1/g" serverless.yml
sed -i '' "s/SECURITY_GROUP_2/$SECURITY_GROUP_2/g" serverless.yml
sed -i '' "s/SUBNET_1/$SUBNET_1/g" serverless.yml
sed -i '' "s/SUBNET_2/$SUBNET_2/g" serverless.yml
cat serverless.yml
#NODE_ENV=prod SLS_DEBUG=* serverless deploy --stage prod
mv serverless.yml.tmp serverless.yml
