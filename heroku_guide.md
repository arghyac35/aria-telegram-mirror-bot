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

2. Create github secret for each variables below. Click [here](#How-to-create-github-secrets) for how to create github secrets.

3. Add the below variables one by one by clicking *New repository secret* everytime.

	```
	CLIENT_SECRET
	CREDENTIALS							
	CONSTANTS_URL
	MAX_CONCURRENT_DOWNLOADS

	GIT_TOKEN
	GIT_USER
	GIT_REPO

	HEROKU_API_KEY
	HEROKU_APP_NAME
	HEROKU_EMAIL
	```

	### Description of the above variables
	* `CLIENT_SECRET` is URL for client_secret.json, see [below](#how-to-create-urls-using-github-gists) for creating URLs &nbsp;&nbsp;&nbsp;&nbsp;*# Not required when using SA*
	* `CREDENTIALS` is URL for credentials.json, see [below](#how-to-create-urls-using-github-gists) for creating URLs &nbsp;&nbsp;&nbsp;&nbsp;*# Not required when using SA*
	* `CONSTANTS_URL` is URL for .constants.js, see [below](#how-to-create-urls-using-github-gists) for creating URLs, not sure about .constants.js? then read the description for it in actual [Readme](README.md) &nbsp;&nbsp;&nbsp;&nbsp;*# Required*
	* `MAX_CONCURRENT_DOWNLOADS` maximum number of download jobs that will be active at a time &nbsp;&nbsp;&nbsp;&nbsp;*#Optional, default is 3*
	* `HEROKU_API_KEY` Go to your Heroku account and go to Account Settings. Scroll to the bottom until you see API Key. Copy this key and add it &nbsp;&nbsp;&nbsp;&nbsp;*# Required*
	* `HEROKU_APP_NAME` Heroku appname &nbsp;&nbsp;&nbsp;&nbsp;*# Required, no need to create app manually*
	* `HEROKU_EMAIL` Heroku Account email Id in which the above app will be deployed &nbsp;&nbsp;&nbsp;&nbsp;*# Required*
	<br /><br />
		### _Below three are only needed when using SAs, it will clone the SAs from a github repo using token_

		- Create a github private repo withy any name and upload all the service accounts as shown in below screenshot:

			![SA Repo](.github/accounts.png?raw=true)

		1. `GIT_TOKEN:` Create a Personal Access Token with repo scope. Go to github [profile settings->Developer Settings->Personal Access Tokens->Generate new token](https://github.com/settings/tokens/new)->Add any note and then select only repo scope & click on Generate token and copy the token->add in this secrect.

			![credentials](.github/pat.png?raw=true)
		
		2. `GIT_USER:` Your github username
		3. `GIT_REPO:` Repo name in which the SAs are.

4. After adding all the above required variables go to github Actions tab in your repo
5. Select `Manually Deploy to heroku` workflow as shown below:

	![Example Manually Deploy to heroku](.github/manually_deploy_workflow.png?raw=true)

6. Then click on Run workflow

	![Run workflow](.github/run_workflow.png?raw=true)

7. _Voila!_ your bot will be deployed now.

8. For updating the bot just run the action again, it will handle the rest. Also, while updating do keep a look at the .constants.js if anything new got added then you need to add that too in your link.

## How to create URLs using github [gists](https://gist.github.com/)

* All the URLs should be direct and publicly accessible, Example of a CONSTANTS_URL https://gist.githubusercontent.com/arghyac35/04c2e78a89f00b21303dd45274b2c4c4/raw/4182c22062b80072b82ab0c290ed40784752dd48/.constants.js.
* Open https://gist.github.com
* Add the values for said secret as below:
	* .constants.js
	![Constants](.github/constants.png?raw=true)
	* client_secret
	![client_secret](.github/client_secret.png?raw=true)
	* credentials
	![credentials](.github/credentials.png?raw=true)
* Now, copy the raw URL for each gist:
	![credentials](.github/raw.png?raw=true)

## How to create github secrets
* Go to Project->Settings->Secrets and Click *New repository secret*. Click [here](.github/all_secrets.png) to see the final view after adding al secrets.

	![secrets](.github/secrets.png?raw=true)
* Add secrets like below:

	![add_secret1](.github/add_secret1.png?raw=true)

	![add_secret2](.github/add_secret2.png?raw=true)