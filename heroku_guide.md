# Heroku Guide for setting up gdrive mirror bot.

## Pre-requisites (Not to be followed while using Service Account, skip to [Deployment](#Deployment))

1. Generate the credentials.json using below steps

2. Set up OAuth:

   * Visit the [Google Cloud Console](https://console.developers.google.com/apis/credentials)
   * Go to the OAuth Consent tab, fill it, and save.
   * Go to the Credentials tab and click Create Credentials -> OAuth Client ID
   * Choose Application Type as Desktop app and Create.
   * Use the download button to download your credentials.
   * Move that file to the root of aria-telegram-mirror-bot, and rename it to `client_secret.json`

3. Enable the Drive API:

   * Visit the [Google API Library](https://console.developers.google.com/apis/library) page.
   * Search for Drive.
   * Make sure that it's enabled. Enable it if not.

4. Install nodejs

5. Clone the repo:

   ```bash
   git clone https://github.com/arghyac35/aria-telegram-mirror-bot
   cd aria-telegram-mirror-bot
   ```

6. Run `npm install`

7. Run `npm run generateDriveCredentials` only if 6th step is successfull

## Deployment

1. Fork this repo

2. Go to Project->Settings->Secrects and Click *New repository secret*.

	![Example Manually Deploy to heroku](.github/secrets.png?raw=true)

3. Add the below variables one by one

	* All the URLs should be direct and publicly accessible, Example of a CONFIG_URL https://gist.githubusercontent.com/arghyac35/04c2e78a89f00b21303dd45274b2c4c4/raw/4182c22062b80072b82ab0c290ed40784752dd48/.constants.js.
	* It will be easier to create this URLs using secret github [gists](https://gist.github.com/), don't create public gists cause this files will contain you credentials
	```
	CLIENT_SECRET
	CREDENTIALS							
	CONFIG_URL
	MAX_CONCURRENT_DOWNLOADS

	GIT_TOKEN
	GIT_USER
	GIT_REPO

	HEROKU_API_KEY
	HEROKU_APP_NAME
	HEROKU_EMAIL
	```
	### Description of the above variables
	* `CLIENT_SECRET` is url for client_secret.json *# Not required if `SA_ZIP_URL` is given*
	* `CREDENTIALS` is url for credentials.json *# Not required if `SA_ZIP_URL` is given*
	* `CONFIG_URL` is for .constants.js, not sure about .constants.js? then read the description for it in actual [Readme](README.md) *# Required*
	* `MAX_CONCURRENT_DOWNLOADS` maximum number of download jobs that will be active at a time
	* `HEROKU_API_KEY` Go to your Heroku account and go to Account Settings. Scroll to the bottom until you see API Key. Copy this key and add it *# Required*
	* `HEROKU_APP_NAME` Heroku appname *# Required*
	* `HEROKU_EMAIL` Heroku Account email Id in which the above app will be deployed *# Required*
		### _Below three are only needed when using SAs, it will clone the SAs from a github repo using token_
		- Create a github private repo and upload all the service accounts
	* `GIT_TOKEN` Create a Personal Access Token with repo scope. Go to github profile settings->Developer Settings->Personal Access Tokens->Generate new token->Add any note and then select only repo scope save it and copy the token->add in this secrect.
	* `GIT_USER` Your github username
	* `GIT_REPO` Repo name in which the SAs are.

4. After adding all the above required variables go to github Actions tab in your repo
5. Select `Manually Deploy to heroku` workflow as shown below:

	![Example Manually Deploy to heroku](.github/manually_deploy_workflow.png?raw=true)

6. Then click on Run workflow

	![Run workflow](.github/run_workflow.png?raw=true)

7. _Voila!_ your bot will be deployed now.

8. For updating the bot just run the action again, it will handle the rest. Also, while updating do keep a look at the .constants.js if anything new got added then you need to add that too in your link.