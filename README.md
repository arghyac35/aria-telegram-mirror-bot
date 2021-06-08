[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]








[contributors-shield]: https://img.shields.io/github/contributors/arghyac35/aria-telegram-mirror-bot.svg?style=for-the-badge
[contributors-url]: https://github.com/arghyac35/aria-telegram-mirror-bot/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/arghyac35/aria-telegram-mirror-bot.svg?style=for-the-badge
[forks-url]: https://github.com/arghyac35/aria-telegram-mirror-bot/network/members
[stars-shield]: https://img.shields.io/github/stars/arghyac35/aria-telegram-mirror-bot?style=for-the-badge
[stars-url]: https://github.com/arghyac35/aria-telegram-mirror-bot/stargazers
[issues-shield]: https://img.shields.io/github/issues/arghyac35/aria-telegram-mirror-bot.svg?style=for-the-badge
[issues-url]: https://github.com/arghyac35/aria-telegram-mirror-bot/issues
[product-screenshot]: images/screenshot.png

# aria-telegram-mirror-bot

This is a Telegram bot that uses [aria2](https://github.com/aria2/aria2) to download files over BitTorrent / HTTP(S) and uploads them to your Google Drive. This can be useful for downloading from slow servers. Parallel downloading and download queuing are supported. There are some features to try to reduce piracy.

## Support
Post your ideas or want to discuss about anything in github discussion
<p><a href="https://github.com/arghyac35/aria-telegram-mirror-bot/discussions"> <img src="https://img.shields.io/badge/discussion-gray?style=for-the-badge&logo=github" width="150""/></a></p>
      
## Limitations

This bot is meant to be used in small, closed groups. So, once deployed, it only works in whitelisted groups.

## Heroku

Follow the heroku guide for deployment in heroku
<p><a href="https://github.com/arghyac35/aria-telegram-mirror-bot/blob/main/heroku_guide.md"> <img src="https://img.shields.io/badge/Heroku%20guide-blueviolet?style=for-the-badge&logo=heroku" width="150""/></a></p>

## Warning

There is very little preventing users from using this to mirror pirated content. Hence, make sure that only trusted groups are whitelisted in `AUTHORIZED_CHATS`.

## Bot commands

* `/mirror <url>` or `/m <url>`: Download from the given URL and upload it to Google Drive. <url> can be HTTP(S), a BitTorrent magnet, or a HTTP(S) url to a BitTorrent .torrent file. A status message will be shown and updated while downloading.
* `/mirrorTar <url>` or `/mt <url>`: Same as `/mirror`, but archive multiple files into a tar before uploading it.
* `/mirrorStatus` or `/ms`: Send a status message about all active and queued downloads.
* `/cancelMirror` or `/cm`: Cancel a particular mirroring task. Only the person who started the task, SUDO_USERS, and chat admins can use this command. It can be used in below two ways:

      1. Send it as a reply to the message that started the download that you want to cancel.
      2. Use the gid for each download, like `/cancelMirror <gid>` or `/cm <gid>`.
* `/cancelAll` or `/ca`: Cancel all mirroring tasks in all chats if a [SUDO_USERS](#Constants-description) member uses it, or cancel all mirroring tasks for a particular chat if one of that chat's admins use it. No one else can use this command.
* `/list <filename>` or `/l <filename>`: Send links to downloads with the `filename` substring in the name. In case of too many downloads, only show the most recent few. 
* `/getfolder` or `/gf`: Send link of drive mirror folder.
* `/stats`: Send disk information, cpu load of the machine & bot uptime.
* `/getlink <driveUrl>` or `/gl <driveUrl>`: Send index link of the file.
* `/clone <driveUrl>` or `/c <diveUrl>`: Clone any shareable drive link. ~~(TODO: Add service account in it so that if 750GB per account limit is over we can switch to service account.)~~
* `/mirror file` or `/mf`: Forward any torrent file and reply to the forwared message with this command it will start mirroring the torrent.
* `/tar <driveUrl>` or `/t <driveUrl>`: Create a tar of drive folder and upload. This is not yet 100% perfect but does the work. 

      Workflow:
      1. It downlaods each and every files(inside the drive folder) one by one using drive download api. As, it downloads one by one so the overall process is slow.
      2. Creates a tar of the downloaded files.
      3. Uploads the tar.
* `/unzipMirror <url>` or `/um <url>`: Unzip the archive and uploads the unzipped folder. Todo: Show extracted percentage & add support to extract from drive url. Idea taken from: https://github.com/magneto261290/magneto-python-aria

      Supported filetypes:
      .zip, .gz, .bz2, .tar, tar.gz, tar.bz2, .tgz, .tbz2
* `/count <driveUrl>` or `/cnt <driveUrl>`: Obtain informations about a drive folder and send it as a table. Idea taken from: https://github.com/iwestlin/gd-utils/blob/master/count
* `/authorize` or `/a`: To authorize a chat, only run by SUDO_USERS. As this is stored in a file, so might get reset at every restart(not sure tho). To make it sustain need to use a db like redis which I may implement later.
* `/unauthorize` or `/ua`: To unauthorize a chat, only run by SUDO_USERS
* `/restart` or `/r`: Restart Heroku dyno, only run by SUDO_USERS.
* `/help` or `/h`: Sends a list of bot commands

#### Notes

* **All commands can also be called using dot(.) instead of slash(/). For e.x:** `.mirror <url>` or `.m <url>`

* **All commands except** `list` **can have the bot's username appended to them. See** `COMMANDS_USE_BOT_NAME` **under [constants description](#Constants-description).** This is useful if you have multiple instances of this bot in the same group.

* While creating a Telegram bot in the [pre-installation](#Pre-installation]) section below, you might want to add the above commands to your new bot by using `/setcommand` in BotFather, make sure all the commands are in lower case. This will cause a list of available bot commands to pop up in chats when you type `/`, and you can long press one of them to select it instead of typing out the entire command.

## Migrating from v1.0.0

Aria-telegram-mirror-bot is now written in TypeScript. If you are migrating from v1.0.0, move your existing `.constants.js` to `src/.constants.js`, and re-read the [installation section](#Installation) and the [section on updating](#Updating), as some steps have changed.

## Pre-installation

1. [Create a new bot](https://core.telegram.org/bots#3-how-do-i-create-a-bot) using Telegram's BotFather and copy your TOKEN.

2. Add the bot to your groups and optionally, give it the permission to delete messages. This permission is used to clean up status request messages from users. Not granting it will quickly fill the chat with useless messages from users.

3. Install [aria2](https://github.com/aria2/aria2).
   * For Ubuntu:
     `sudo apt install aria2`

4. Get Drive folder ID:

   * Visit [Google Drive](https://drive.google.com).
   * Create a new folder. The bot will upload files inside this folder.
   * Open the folder.
   * The URL will be something like `https://drive.google.com/drive/u/0/folders/012a_345bcdefghijk`. Copy the part after `folders/` (`012a_345bcdefghijk`). This is the `GDRIVE_PARENT_DIR_ID` that you'll need in step 5 of the Installation section.

## Installation

1. Install TypeScript with `sudo npm install -g typescript`

2. Clone the repo:

   ```bash
   git clone https://github.com/arghyac35/aria-telegram-mirror-bot
   cd aria-telegram-mirror-bot
   ```

3. Run `npm install`

4. Copy the example files:

   ```bash
   cp src/.constants.js.example src/.constants.js
   ```

5. Configure the bot:

   * `nano src/.constants.js`
   * Now replace the placeholder values in this file with your values. Use the [Constants description](#Constants-description) section below for reference.
   * `MAX_CONCURRENT_DOWNLOADS` is the number of download jobs that can be active at the same time. Note that this does not affect the number of concurrent uploads. Default is set to 5, to change edit `start.sh` file.

6. Compile the project by running `tsc`

7. Set up OAuth:

   * Visit the [Google Cloud Console](https://console.developers.google.com/apis/credentials)
   * Go to the OAuth Consent tab, fill it, and save.
   * Go to the Credentials tab and click Create Credentials -> OAuth Client ID
   * Choose Desktop App and Create.
   * Use the download button to download your credentials.
   * Move that file to the root of aria-telegram-mirror-bot, and rename it to `client_secret.json`

8. Enable the Drive API:

   * Visit the [Google API Library](https://console.developers.google.com/apis/library) page.
   * Search for Drive.
   * Make sure that it's enabled. Enable it if not.

9. Start aria2 with `./start.sh`

10. Start the bot with `npm start`

11. Open Telegram, and send `/mirror https://raw.githubusercontent.com/arghyac35/aria-telegram-mirror-bot/master/README.md` to the bot.

12. In the terminal, it'll ask you to visit an authentication URL. Visit it, grant access, copy the code on that page, and paste it in the terminal.

That's it.

## Constants description

This is a description of the fields in src/.constants.js:

* `TOKEN`: This is the Telegram bot token that you will get from Botfather in step 1 of Pre-installation.
* `ARIA_SECRET`: This is the password used to connect to the aria2 RPC. You will get this from step 4 of Installation.
* `ARIA_DOWNLOAD_LOCATION`: This is the directory that aria2 will download files into, before uploading them. Make sure that there is no trailing "/" in this path. The suggested path is `/path/to/aria-telegram-mirror-bot/downloads`
* `ARIA_DOWNLOAD_LOCATION_ROOT`: This is the mountpoint that contains ARIA_DOWNLOAD_LOCATION. This is used internally to calculate the space available before downloading.
* `ARIA_FILTERED_DOMAINS`: The bot will refuse to download files from these domains. Can be an empty list.
* `ARIA_FILTERED_FILENAMES`: The bot will refuse to completely download (or if already downloaded, then upload) files with any of these substrings in the file/top level directory name. Can be an empty list or left undefined.
* `ARIA_PORT`: The port for the Aria2c RPC server. If you change this, make sure to update your aria.conf as well. Safe to leave this at the default value unless something else on your system is using that port.
* `GDRIVE_PARENT_DIR_ID`: This is the ID of the Google Drive folder that files will be uploaded into. You will get this from step 4 of Pre-installation.
* `OTHER_GDRIVE_DIR_IDS`: This is needed if u want to look for files in multiple dirs on list command
* `SUDO_USERS`: This is a list of Telegram user IDs. These users can use the bot in any chat. Can be an empty list, if AUTHORIZED_CHATS is not empty.
* `AUTHORIZED_CHATS`: This is a list of Telegram Chat IDs. Anyone in these chats can use the bot in that particular chat. Anyone not in one of these chats and not in SUDO_USERS cannot use the bot. Someone in one of the chats in this list can use the bot only in that chat, not elsewhere. Can be an empty list, if SUDO_USERS is not empty.
* `STATUS_UPDATE_INTERVAL_MS`: Set the time in milliseconds between status updates. A smaller number will update status messages faster, but Telegram will rate limit the bot if it sends/edits more than around 20 messages/minute/chat. As that quota includes messages other than status updates, do not decrease this number if you get rate limit messages in the logs.
* `DRIVE_FILE_PRIVATE`: Files uploaded can either be visible to everyone (public), or be private.
  * `ENABLED`: Set this to `true` to make the uploaded files private. `false` makes uploaded files public.
  * `EMAILS`: An array of email addresses that read access will be granted to. Set this to `[]` to grant access only to the Drive user the bot is set up with.
* `DOWNLOAD_NOTIFY_TARGET`: The fields here are used to notify an external web server once a download is complete. See the [section on notifications below](#Notifying-an-external-webserver-on-download-completion) for details.
   * `enabled`: Set this to `true` to enable this feature.
   * `host`: The address of the web server to notify.
   * `port`: The server port ¯\\\_(ツ)\_/¯
   * `path`: The server path ¯\\\_(ツ)\_/¯
* `COMMANDS_USE_BOT_NAME`: The fields here decide whether to append the bot's usename to the end of commands or not. This works only for group chats, and gets ignored if you PM the bot.
  * `ENABLED`: If `true`, all bot commands have to have the bot's username (as below) appended to them. For example, `/mirror https://someweb.site/resource.tar` will become `/mirror@botName_bot https://someweb.site/resource.tar`. The only exception to this is the `/list` command, which will not have the bot's name appended. This allows having multiple non-conflicting mirror bots in the same group, and have them all reply to `/list`.
  * `NAME`: The username of the bot, as given in BotFather. Include the leading "@".
* `IS_TEAM_DRIVE`: Set to `true` if you are mirroring to a Shared Drive.
* `USE_SERVICE_ACCOUNT`: Set to `true` if you want to use Service Accounts to clone, this only works when IS_TEAM_DRIVE is true. Keep all the SAs in accounts folder.
   * TODO: Add script and instructions to generate SAs, for now follow: https://github.com/lzzy12/python-aria-mirror-bot#generating-service-accounts
* `INDEX_DOMAIN`: Link for gdindex
* `TELEGRAPH_TOKEN`: Telegraph token, if you want to show search results in telegra.ph else keep it blank. See [below](#Generating-Telegra.ph-token) for how to generate telegra.ph token.
* `STOP_DUPLICATE_MIRRORS`: Set it to true for stopping duplicate mirrors.

## Generating Telegra.ph token

   ```bash
   npm run generateTelegraphToken
   ```

## Starting after installation

After the initial installation, use these instructions to (re)start the bot.

### Using tmux

1. Start a new tmux session with `tmux new -s tgbot`, or connect to an existing session with `tmux a -t tgbot`. Running the bot inside tmux will let you disconnect from the server without terminating the bot. You can also use nohup instead.
2. Start aria2 by running `./start.sh`
3. Start the bot with `npm start`

### Using systemd

1. Install the systemd unit file `sudo cp -v contrib/mirror-bot.service /etc/systemd/system/`
2. Open `/etc/systemd/system/mirror-bot.service` with an editor of your choice and modify the path and user as per your environment.
3. Reload the systemctl daemon so it can see your new systemd unit `sudo systemctl daemon-reload`
4. Start the service `sudo systemctl start mirror-bot`
5. If you want the bot to automatically start on boot, run `sudo systemctl enable mirror-bot`

## Notifying an external webserver on download completion

This bot can make an HTTP request to an external web server once a download is complete. This can be when a download fails to start, fails to download, is cancelled, or completes successfully. See the section [on constants](#Constants-description) for details on how to configure it.

Your web server should listen for a POST request containing the following JSON data:

```
{
    'successful': boolean,
    'file': {
        'name': string,
        'driveURL': string,
        'size': string
    },
    originGroup: number
}
```

* `successful`: `true` if the download completed successfully, `false` otherwise
* `file`: Details about the file.
   * `name`: The name of the file. Might or might not be present if `successful` is `false`.
   * `driveURL`: The Google Drive download link to the downloaded file. Might or might not be present if `successful` is `false`.
   * `size`: A human-readable file size. Might or might not be present if `successful` is `false`.
* `originGroup`:  The Telegram chat ID for the chat the download was started in

If `successful` is false, any or all of the fields of `file` might be absent. However, if present, they are correct/reliable.

## Updating

Run `git pull`, then run `tsc`. After compilation has finished, you can start the bot as described in [the above section](#Starting-after-installation).

## Common issues

* **`tsc` silently dies, says, "Killed", or stays stuck forever:** Your machine does not have enough RAM. tsc needs at least 1GB. Increase your RAM if running on the cloud, or try  setting up a [swap](https://www.digitalocean.com/community/tutorials/how-to-add-swap-space-on-ubuntu-16-04) with a high swappiness.

* **Trying to download anything gives a "Failed to start the download. Unauthorized" message:** [See #38](https://github.com/out386/aria-telegram-mirror-bot/issues/38). If it still doesn't work, something else might be running an aria2 RPC at the same port as the bot. Change [`ARIA_PORT`](#Constants-description) and try [#38](https://github.com/out386/aria-telegram-mirror-bot/issues/38) again.

* **`tsc` gives errors like `Property 'SOMETHING' does not exist on type<...>` with red lines under `constants.<...>`:** Some new configs were added to [constants](#Constants-description) after you set up the bot, but your existing `./src/.constants.js` does not have them. Re-read [the constants section](#Constants-description), and add whatever property was added. Usually, you can also just ignore these particular errors and keep using the bot, because `tsc` will compile anyway, and there are default options that are used if you did not update your `.constants.js`.

* **Cannot get public links for folders if using Shared Drives**: Shared Drives do not support sharing folders to non members. The download link the bot gives only works for members of the Shared drive. If you need public links, use `/mirrorTar` to mirror the folder as a single file instead.  
<font size=2>This feature is planned. See [upcoming releases](https://support.google.com/a/table/7539891) (search for "Folder sharing in shared drives").</font>

## License
The MIT License (MIT)

Copyright © 2020 out386
