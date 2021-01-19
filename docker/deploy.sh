#!/bin/bash
if [[ -n "$HEROKU_EMAIL" && -n "$HEROKU_API_KEY" ]]; then
	sed -Ei "s/login/login "$HEROKU_EMAIL"/g" .netrc
	sed -Ei "s/password/password "$HEROKU_API_KEY"/g" .netrc
	mv .netrc ~/.netrc
else
	echo "Heroku Credentials Not Found, Add them in secrets"
	exit 2
fi

if [[ -n "$REGION" && -n "$HEROKU_APP" ]]; then
	heroku container:login
	echo "Creating App"
	heroku apps:create "$HEROKU_APP" --stack=container --region=eu
	if [[ $? -eq 0 ]]; then
		echo "Successfully created app"
		export APP_SUC=true
	else
		echo "Could not create app, Trying to push to Registry"
		echo "Building and pushing the app to Heroku Registry"
		heroku container:push worker -a "$HEROKU_APP"
		echo "Deploying"
		if [[ $? -eq 0 ]]; then
			heroku container:release worker -a "$HEROKU_APP"
			export APP_SUC=true
			echo "Deployment Success"
		else
			echo "App Name is not available, Please select another"
			exit 2
		fi
	fi
elif [[ -n "$HEROKU_APP" ]]; then
	heroku container:login
	echo "Creating App"
	heroku apps:create "$HEROKU_APP" --stack=container
	if [[ $? -eq 0 ]]; then
		echo "Successfully created app"
		export APP_SUC=true
	else
		echo "Could not create app, Trying to push to Registry"
		echo "Building and pushing the app to Heroku Registry"
		heroku container:push worker -a "$HEROKU_APP"
		echo "Deploying"
		if [[ $? -eq 0 ]]; then
			heroku container:release worker -a "$HEROKU_APP"
			export APP_SUC=true
			echo "Deployment Success"
		else
			echo "App Name is not available, Please select another"
			exit 2
		fi
	fi
else 
	echo "Heroku App name Not Provided"
fi


echo "Setting Config Vars"
if [[ -n "$APP_SUC" ]]; then 
	if [[ -n "$SA_ZIP_URL" && -n "$CONFIG_URL" ]]; then
		heroku config:set -a "$HEROKU_APP" SA_ZIP_URL="$SA_ZIP_URL" CONFIG_URL="$CONFIG_URL" 
	elif [[ -n "$CLIENT_SECRET" && -n "$CREDENTIALS" && -n "$CONFIG_URL" ]]; then
		heroku config:set -a "$HEROKU_APP" CONFIG_URL="$CONFIG_URL" CREDENTIALS="$CREDENTIALS" CLIENT_SECRET="$CLIENT_SECRET"		
	else
		echo "Config error Check Secrets For Reference check README"
		exit 2
	fi
	
	if [[ -n "$MAX_CONCURRENT_DOWNLOADS" ]]; then
		heroku config:set -a "$HEROKU_APP" } MAX_CONCURRENT_DOWNLOADS="$MAX_CONCURRENT_DOWNLOADS"
		heroku ps:scale worker=1 -a "$HEROKU_APP"
	else
		echo "Max Concurrent Downloads Var Not given so Defaults to 3"
		heroku ps:scale worker=1 -a "$HEROKU_APP"
	fi
	echo "Deployment Completed"
else
	echo "App Deployment Failed"
	exit 1
fi