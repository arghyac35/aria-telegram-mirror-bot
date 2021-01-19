#!/bin/bash
if [[ -n ${{secrets.HEROKU_EMAIL}} && -n ${{secrets.HEROKU_API_KEY}} ]]; then
	cat >~/.netrc <<EOF
	machine api.heroku.com
	    login ${{secrets.HEROKU_EMAIL}}
	    password ${{secrets.HEROKU_API_KEY}}
	machine git.heroku.com
	    login ${{secrets.HEROKU_EMAIL}}
	    password ${{secrets.HEROKU_API_KEY}}
	EOF
else
	echo "Heroku Credentials Not Found, Add them in secrets"
	exit 2
fi

if [[ -n ${{secrets.REGION}} && -n ${{secrets.HEROKU_APP}} ]]; then
	heroku container:login
	echo "Creating App"
	heroku apps:create ${{secrets.HEROKU_APP}} --stack=container --region=eu
	if [[ $? -eq 0 ]]; then
		echo "Successfully created app"
	else
		echo "Could not create app, May be it exist already"
		exit 2
	fi
	echo "Building and pushing the app to Heroku Registry"
	heroku container:push worker -a ${{secrets.HEROKU_APP}}
	echo "Deploying"
	heroku container:release worker -a ${{secrets.HEROKU_APP}}
elif [[ -n ${{secrets.HEROKU_APP}} ]]; then
	heroku container:login
	echo "Creating App"
	heroku apps:create ${{secrets.HEROKU_APP}} --stack=container
	if [[ $? -eq 0 ]]; then
		echo "Successfully created app"
	else
		echo "Could not create app, May be it exist already"
		exit 2
	fi
	echo "Building and pushing the app to Heroku Registry"
	heroku container:push worker -a ${{secrets.HEROKU_APP}}
	echo "Deploying"
	heroku container:release worker -a ${{secrets.HEROKU_APP}}
else 
	echo "Heroku App name Not Provided"
fi

echo "Deployment Success"

echo "Setting Config Vars"

if [[ -n ${{secrets.SA_ZIP_URL}} && -n ${{secrets.CONFIG_URL}} ]]; then
	heroku config:set -a ${{secrets.HEROKU_APP}} SA_ZIP_URL=${{secrets.SA_ZIP_URL}} CONFIG_URL=${{secrets.CONFIG_URL}} 
elif [[ -n ${{secrets.CLIENT_SECRET}} && -n ${{secrets.CREDENTIALS}} && -n ${{secrets.CONFIG_URL}} ]]; then
	heroku config:set -a ${{secrets.HEROKU_APP}} CONFIG_URL=${{secrets.CONFIG_URL}} CREDENTIALS=${{secrets.CREDENTIALS}} CLIENT_SECRET=${{secrets.CLIENT_SECRET}}
else
	echo "Config error Check Secrets For Reference check README"
	exit 2
	
if [[ -n ${{secrets.MAX_CONCURRENT_DOWNLOADS}} ]]; then
	heroku config:set -a ${{secrets.HEROKU_APP}} MAX_CONCURRENT_DOWNLOADS=${{secrets.MAX_CONCURRENT_DOWNLOADS}}
else
	echo "Max Concurrent Downloads Var Not given so Defaults to 3"
fi

echo "Deployment Completed"