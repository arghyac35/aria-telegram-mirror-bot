import TelegramBot = require('node-telegram-bot-api');
import { v4 as uuidv4 } from 'uuid';
import downloadUtils = require('./download_tools/utils');
import * as ariaTools from './download_tools/aria-tools';
import constants = require('./.constants');
import msgTools = require('./bot_utils/msg-tools');
import dlm = require('./dl_model/dl-manager');
import driveList = require('./drive/drive-list');
import driveUtils = require('./drive/drive-utils');
import driveDirectLink = require('./drive/drive-directLink');
import cloneFn = require('./drive/drive-clone2');
import driveDownload = require('./drive/drive-tar');
import details = require('./dl_model/detail');
import filenameUtils = require('./download_tools/filename-utils');
import { EventRegex } from './bot_utils/event_regex';
import checkDiskSpace = require('check-disk-space');
import gdUtils = require('./drive/gd-utils');
import { readFile, writeFile } from 'fs-extra';
import ytdlFn = require('./download_tools/ytdl');

const telegraph = require('telegraph-node')
const ph = new telegraph();
const eventRegex = new EventRegex();
const bot = new TelegramBot(constants.TOKEN, { polling: true });
var websocketOpened = false;
var statusInterval: NodeJS.Timeout;
var dlManager = dlm.DlManager.getInstance();
const Heroku = require('heroku-client')
const heroku = new Heroku({ token: process.env.HEROKU_API_KEY })

initAria2();

if (constants.USE_SERVICE_ACCOUNT && !constants.IS_TEAM_DRIVE) {
  console.log('In order to use Service account for clone the drive should be Team drive. Please set IS_TEAM_DRIVE to true in .constants.js');
  process.exit();
}

bot.on("polling_error", msg => console.error(msg.message));

function setEventCallback(regexp: RegExp, regexpNoName: RegExp,
  callback: ((msg: TelegramBot.Message, match?: RegExpExecArray) => void)): void {
  bot.onText(regexpNoName, (msg, match) => {
    // Return if the command didn't have the bot name for non PMs ("Bot name" could be blank depending on config)
    if (msg.chat.type !== 'private' && !match[0].match(regexp))
      return;
    callback(msg, match);
  });
}

setEventCallback(eventRegex.commandsRegex.start, eventRegex.commandsRegexNoName.start, (msg) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    msgTools.sendMessage(bot, msg, 'You should know the commands already. Happy mirroring.', -1);
  }
});

setEventCallback(eventRegex.commandsRegex.id, eventRegex.commandsRegexNoName.id, (msg) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    msgTools.sendMessage(bot, msg, "This chat's id is: <code>" + msg.chat.id + "</code>", 60000);
  }
});

setEventCallback(eventRegex.commandsRegex.mirrorTar, eventRegex.commandsRegexNoName.mirrorTar, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    try {
      mirror(msg, await checkIfTorrentFile(msg, match), true);
    } catch (error) {
      console.log("Error in mirror: ", error.message);
      msgTools.sendMessage(bot, msg, error.message, 60000);
    }
  }
});

setEventCallback(eventRegex.commandsRegex.mirror, eventRegex.commandsRegexNoName.mirror, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    try {
      mirror(msg, await checkIfTorrentFile(msg, match));
    } catch (error) {
      console.log("Error in mirror: ", error.message);
      msgTools.sendMessage(bot, msg, error.message, 60000);
    }
  }
});

async function checkIfTorrentFile(msg: TelegramBot.Message, match: RegExpExecArray) {
  if (msg.hasOwnProperty("reply_to_message") && msg.reply_to_message.hasOwnProperty("document") && msg.reply_to_message.document.hasOwnProperty("file_id")) {
    if (msg.reply_to_message.document.mime_type === 'application/x-bittorrent') {
      match[4] = await bot.getFileLink(msg.reply_to_message.document.file_id);
    } else {
      throw new Error('Reply to a torrent file only for mirroring.');
    }
  }
  return match;
}

setEventCallback(eventRegex.commandsRegex.stats, eventRegex.commandsRegexNoName.stats, async (msg) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    try {
      const diskSpace = await checkDiskSpace(constants.ARIA_DOWNLOAD_LOCATION_ROOT);
      const avgCpuLoad = await downloadUtils.getCPULoadAVG();
      const botUptime = downloadUtils.getProcessUptime()

      const usedDiskSpace = diskSpace.size - diskSpace.free;

      msgTools.sendMessage(bot, msg, `Total space: ${downloadUtils.formatSize(diskSpace.size)}\nUsed: ${downloadUtils.formatSize(usedDiskSpace)}\nAvailable: ${downloadUtils.formatSize(diskSpace.free)}\nCPU Load: ${avgCpuLoad}\nBot Uptime: ${botUptime}`);
    } catch (error) {
      console.log('stats: ', error.message);
      msgTools.sendMessage(bot, msg, `Error checking stats: ${error.message}`);
    }
  }
});

setEventCallback(eventRegex.commandsRegex.authorize, eventRegex.commandsRegexNoName.authorize, async (msg) => {
  if (msgTools.isAuthorized(msg) !== 0) {
    msgTools.sendMessage(bot, msg, `This command is only for SUDO_USERS`);
  } else {
    try {
      let alreadyAuthorizedChats: any = await readFile('./authorizedChats.json', 'utf8').catch(async err => {
        if (err.code === 'ENOENT') {
          // create authorizedChats.json
          await writeFile('./authorizedChats.json', JSON.stringify([]));
        } else {
          throw new Error(err);
        }
      });
      if (alreadyAuthorizedChats) {
        alreadyAuthorizedChats = JSON.parse(alreadyAuthorizedChats);
      } else {
        alreadyAuthorizedChats = [];
      }
      const allAuthorizedChats: number[] = constants.AUTHORIZED_CHATS.concat(alreadyAuthorizedChats, constants.SUDO_USERS);
      if (allAuthorizedChats.includes(msg.chat.id)) {
        msgTools.sendMessage(bot, msg, `Chat already authorized.`);
      } else {
        alreadyAuthorizedChats.push(msg.chat.id);
        await writeFile('./authorizedChats.json', JSON.stringify(alreadyAuthorizedChats)).then(() => {
          msgTools.sendMessage(bot, msg, `Chat authorized successfully.`, -1);
        });
      }
    } catch (error) {
      console.log('authorize: ', error.message);
      msgTools.sendMessage(bot, msg, `Error authorizing: ${error.message}`);
    }
  }
});

setEventCallback(eventRegex.commandsRegex.unauthorize, eventRegex.commandsRegexNoName.unauthorize, async (msg) => {
  if (msgTools.isAuthorized(msg) !== 0) {
    msgTools.sendMessage(bot, msg, `This command is only for SUDO_USERS`);
  } else {
    try {
      let alreadyAuthorizedChats: any = await readFile('./authorizedChats.json', 'utf8').catch(err => {
        if (err.code === 'ENOENT') {
          return '';
        } else {
          throw new Error(err);
        }
      });
      if (alreadyAuthorizedChats) {
        alreadyAuthorizedChats = JSON.parse(alreadyAuthorizedChats);
        const index = alreadyAuthorizedChats.indexOf(msg.chat.id);
        if (index > -1) {
          alreadyAuthorizedChats.splice(index, 1);
          await writeFile('./authorizedChats.json', JSON.stringify(alreadyAuthorizedChats)).then(() => {
            msgTools.sendMessage(bot, msg, `Chat unauthorized successfully.`, -1);
          });
        } else {
          msgTools.sendMessage(bot, msg, `Cannot unauthorize this chat. Please make sure this chat was authorized using /authorize command only.`);
        }
      } else {
        msgTools.sendMessage(bot, msg, `No authorized chats found. Please make use this chat was authorized using /authorize command only.`);
      }
    } catch (error) {
      console.log('unauthorize: ', error.message);
      msgTools.sendMessage(bot, msg, `Error unauthorizing: ${error.message}`);
    }
  }
});

setEventCallback(eventRegex.commandsRegex.mf, eventRegex.commandsRegexNoName.mf, (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    if (msg.hasOwnProperty("reply_to_message") && msg.reply_to_message.hasOwnProperty("document") && msg.reply_to_message.document.hasOwnProperty("file_id")) {
      bot.getFileLink(msg.reply_to_message.document.file_id).then((res) => {
        match.splice(2, 0, '69');// insert some fake values so that index matches in mirror fucntions
        match.splice(3, 0, '69');
        match.splice(4, 0, res);
        mirror(msg, match);
      }).catch(err => {
        console.log("couldn't get file link: ", err.message);
        msgTools.sendMessage(bot, msg, err.message, 60000);
      });
    } else {
      msgTools.sendMessage(bot, msg, 'Failed to start download. Reply to a torrent file.', 60000);
    }
  }
});

setEventCallback(eventRegex.commandsRegex.unzipMirror, eventRegex.commandsRegexNoName.unzipMirror, (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    mirror(msg, match, false, true);
  }
});

setEventCallback(eventRegex.commandsRegex.restart, eventRegex.commandsRegexNoName.restart, async (msg, match) => {
  if (msgTools.isAuthorized(msg) !== 0) {
    msgTools.sendMessage(bot, msg, `This command is only for SUDO_USERS`);
  } else {
    try {
      if (!process.env.HEROKU_API_KEY) {
        msgTools.sendMessage(bot, msg, `Can't restart as <code>HEROKU_API_KEY</code> is not provided`);
      } else {
        let restartingMsg = await bot.sendMessage(msg.chat.id, `Heroku dyno will be restarted now.`, {
          reply_to_message_id: msg.message_id,
          parse_mode: 'HTML'
        });
        await writeFile('./restartObj.json', JSON.stringify({ originalMsg: msg, restartingMsg }));
        const response = await heroku.delete(`/apps/${process.env.HEROKU_APP_NAME}/dynos`);
      }
    } catch (error) {
      console.log("Error while restart: ", error.message);
      msgTools.sendMessage(bot, msg, error.message, 60000);
    }
  }
});

/**
 * Start a new download operation. Make sure that this is triggered by an
 * authorized user, because this function itself does not check for that.
 * @param {Object} msg The Message that triggered the download
 * @param {Array} match Message matches
 * @param {boolean} isTar Decides if this download should be archived before upload
 * @param {boolean} isUnZip Decides if this download should be extracted before upload
 */
function mirror(msg: TelegramBot.Message, match: RegExpExecArray, isTar?: boolean, isUnZip?: boolean): void {
  if (match.length < 5 || !match[4]) return;
  if (websocketOpened) {
    match[4] = match[4].trim();
    if (downloadUtils.isDownloadAllowed(match[4])) {
      prepDownload(msg, match[4], isTar, isUnZip);
    } else {
      msgTools.sendMessage(bot, msg, `Download failed. Blacklisted URL.`);
    }
  } else {
    msgTools.sendMessage(bot, msg, `Websocket isn't open. Can't download`);
  }
}

setEventCallback(eventRegex.commandsRegex.mirrorStatus, eventRegex.commandsRegexNoName.mirrorStatus, (msg) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    sendStatusMessage(msg);
  }
});

setEventCallback(eventRegex.commandsRegex.list, eventRegex.commandsRegexNoName.list, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    const searchingMsg = await bot.sendMessage(msg.chat.id, `🔍Searching for files.... Please wait.`, {
      reply_to_message_id: msg.message_id,
      parse_mode: 'HTML'
    });
    driveList.listFiles(match[4], async (err, res) => {
      msgTools.deleteMsg(bot, searchingMsg);
      if (err) {
        msgTools.sendMessage(bot, msg, 'Failed to fetch the list of files: ' + err);
      } else {
        if (constants.TELEGRAPH_TOKEN) {
          try {
            if (res.length === 0) {
              msgTools.sendMessage(bot, msg, 'There are no files matching your parameters');
              return;
            }
            var g = JSON.stringify(res).replace(/[\[\]\,\"]/g, ''); //stringify and remove all "stringification" extra data
            console.log('Size of telegraph node-->', g.length);
            const telegraPhObj = await createTelegraphPage(res);
            msgTools.sendMessageAsync(bot, msg, `Search results for ${match[4]} 👇🏼`, 60000, false, [{ buttonName: 'Here', url: telegraPhObj.url }]).catch(console.error);
          } catch (error) {
            msgTools.sendMessage(bot, msg, 'Failed to fetch the list of files, Telegra.ph error: ' + error);
          }
        } else {
          msgTools.sendMessage(bot, msg, res.toString(), 60000);
        }
      }
    });
  }
});

async function createTelegraphPage(content: any) {
  return ph.createPage(constants.TELEGRAPH_TOKEN, 'Mirror Bot Search', content, {
    return_content: true,
    author_name: 'aria-telegram-mirror-bot',
    author_url: 'https://github.com/arghyac35/aria-telegram-mirror-bot'
  });
}

setEventCallback(eventRegex.commandsRegex.getFolder, eventRegex.commandsRegexNoName.getFolder, (msg) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    msgTools.sendMessage(bot, msg,
      '<a href = \'' + driveUtils.getFileLink(constants.GDRIVE_PARENT_DIR_ID, true) + '\'>Drive mirror folder</a>',
      60000);
  }
});

setEventCallback(eventRegex.commandsRegex.cancelMirror, eventRegex.commandsRegexNoName.cancelMirror, (msg, match) => {
  var authorizedCode = msgTools.isAuthorized(msg);
  var dlDetails: details.DlVars;
  let gidFromMessage = '';

  if (msg.reply_to_message) {
    dlDetails = dlManager.getDownloadByMsgId(msg.reply_to_message);
  } else if (match && match.length > 5) {
    gidFromMessage = match[4];
    dlDetails = dlManager.getDownloadByGid(gidFromMessage.trim());
  } else {
    msgTools.sendMessage(bot, msg, `Reply to the command message for the download that you want to cancel or enter valid gid.`);
  }

  if (dlDetails) {
    if (authorizedCode > -1 && authorizedCode < 3) {
      cancelMirror(dlDetails, msg);
    } else if (authorizedCode === 3) {
      if (msg.from.id === dlDetails.tgFromId) {
        cancelMirror(dlDetails, msg);
      } else {
        msgTools.isAdmin(bot, msg, (e, res) => {
          console.log('Cta admins-->', res);
          if (res) {
            cancelMirror(dlDetails, msg);
          } else {
            msgTools.sendMessage(bot, msg, 'You do not have permission to do that.');
          }
        });
      }
    } else {
      msgTools.sendUnauthorizedMessage(bot, msg);
    }
  } else {
    const message = gidFromMessage ? `Invalid GID, no download found with gid: <code>${gidFromMessage}</code>.` : `Reply to the command message for the download that you want to cancel. Also make sure that the download is even active.`;
    msgTools.sendMessage(bot, msg, message);
  }
});

setEventCallback(eventRegex.commandsRegex.cancelAll, eventRegex.commandsRegexNoName.cancelAll, (msg) => {
  var authorizedCode = msgTools.isAuthorized(msg, true);
  if (authorizedCode === 0) {
    // One of SUDO_USERS. Cancel all downloads
    dlManager.forEachDownload(dlDetails => {
      dlManager.addCancelled(dlDetails);
    });
    cancelMultipleMirrors(msg);

  } else if (authorizedCode === 2) {
    // Chat admin, but not sudo. Cancel all downloads only from that chat.
    dlManager.forEachDownload(dlDetails => {
      if (msg.chat.id === dlDetails.tgChatId) {
        dlManager.addCancelled(dlDetails);
      }
    });
    cancelMultipleMirrors(msg);

  } else if (authorizedCode === 3) {
    msgTools.isAdmin(bot, msg, (e, res) => {
      if (res) {
        dlManager.forEachDownload(dlDetails => {
          if (msg.chat.id === dlDetails.tgChatId) {
            dlManager.addCancelled(dlDetails);
          }
        });
        cancelMultipleMirrors(msg);
      } else {
        msgTools.sendMessage(bot, msg, 'You do not have permission to do that.');
      }
    });
  } else {
    msgTools.sendUnauthorizedMessage(bot, msg);
  }
});

setEventCallback(eventRegex.commandsRegex.clone, eventRegex.commandsRegexNoName.clone, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    clone(msg, match);
  }
});

setEventCallback(eventRegex.commandsRegex.tar, eventRegex.commandsRegexNoName.tar, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    tar(msg, match);
  }
});

setEventCallback(eventRegex.commandsRegex.count, eventRegex.commandsRegexNoName.count, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    // get the drive filed id from url
    const fileId = downloadUtils.getIdFromUrl(match[4]);
    if (fileId) {
      let countMsg = await bot.sendMessage(msg.chat.id, `Collecting info about ${fileId}，Please wait...`, {
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML'
      });
      const name = await gdUtils.get_folder_name(fileId);

      const gen_text = (payload: any) => {
        const { obj_count, processing_count, pending_count } = payload || {}
        return `<b>Name:</b> ${name}\n<b>Number of Files:</b> ${obj_count || ''}\n${pending_count ? ('<b>Pending:</b> ' + pending_count) : ''}\n${processing_count ? ('<b>Ongoing:</b> ' + processing_count) : ''}`
      }

      const message_updater = async (payload: any) => await msgTools.editMessage(bot, countMsg, gen_text(payload)).catch(err => console.error(err.message));

      try {
        let countResult = await gdUtils.gen_count_body({ fid: fileId, tg: message_updater });
        let table = countResult.table;
        if (!table) {
          msgTools.deleteMsg(bot, countMsg);
          msgTools.sendMessage(bot, msg, `Failed to obtain info for: ${name}`, 10000);
          return;
        }

        msgTools.deleteMsg(bot, countMsg);
        msgTools.sendMessageAsync(bot, msg, `<b>Source Folder Name:</b> <code>${name}</code>\n<b>Source Folder Link:</b> <code>${match[4]}</code>\n<pre>${table}</pre>`, -1).catch(async err => {
          if (err && ((err.body && err.body.error_code == 413 && err.body.description.includes('Entity Too Large')) || (err.response && err.response.body && err.response.body.error_code == 400 && err.response.body.description.includes('message is too long')))) {
            const limit = 20
            countResult = await gdUtils.gen_count_body({ fid: fileId, limit, smy: countResult.smy });
            table = countResult.table;
            msgTools.sendMessage(bot, msg, `<b>Source Folder Name:</b> <code>${name}</code>\n<b>Source Folder Link:</b> <code>${match[4]}</code>\nThe table is too long and exceeds the telegram message limit, only the first ${limit} will be displayed:\n<pre>${table}</pre>`, -1)
          } else {
            msgTools.sendMessage(bot, msg, err.message, 10000);
          }
        });
      } catch (error) {
        msgTools.deleteMsg(bot, countMsg);
        msgTools.sendMessage(bot, msg, error.message, 10000);
      }

    } else {
      msgTools.sendMessage(bot, msg, `Google drive ID could not be found in the provided link`);
    }
  }
});

setEventCallback(eventRegex.commandsRegex.ytdl, eventRegex.commandsRegexNoName.ytdl, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    ytdl(msg, match);
  }
});

async function ytdl(msg: TelegramBot.Message, match: RegExpExecArray) {
  try {
    const inputs = match[4].split(/ (.+)/);
    let ytdlMsg = await bot.sendMessage(msg.chat.id, `Downloading: <code>` + inputs[0] + `</code>`, {
      reply_to_message_id: msg.message_id,
      parse_mode: 'HTML'
    });
    await ytdlFn.ytdlWrapper(inputs[0], bot, ytdlMsg, msg, inputs.length > 1 ? inputs[1] : '').catch(e => {
      console.error('Error from ytdlwrapper--->', e);
      msgTools.deleteMsg(bot, ytdlMsg);
      msgTools.sendMessage(bot, msg, e.message || e, 10000);
    });
  } catch (error) {
    msgTools.sendMessage(bot, msg, error);
  }
}

/**
 * Start a clonning Google Drive files. Make sure that this is triggered by an
 * authorized user, because this function itself does not check for that.
 * @param {Object} msg The Message that triggered the download
 * @param {Array} match Message matches
 */
async function clone(msg: TelegramBot.Message, match: RegExpExecArray) {
  // get the drive filed id from url
  const fileId = downloadUtils.getIdFromUrl(match[4]);
  if (fileId) {
    let cloneMsg = await bot.sendMessage(msg.chat.id, `Cloning: <code>` + match[4] + `</code>`, {
      reply_to_message_id: msg.message_id,
      parse_mode: 'HTML'
    });
    // call the clone function
    await cloneFn.driveClone(fileId, bot, cloneMsg).then((res: string) => {
      msgTools.deleteMsg(bot, cloneMsg);
      msgTools.sendMessage(bot, msg, res, -1);
    }).catch((err: string) => {
      msgTools.deleteMsg(bot, cloneMsg);
      msgTools.sendMessage(bot, msg, err, 10000);
    });
  } else {
    msgTools.sendMessage(bot, msg, `Google drive ID could not be found in the provided link`);
  }
}

async function tar(msg: TelegramBot.Message, match: RegExpExecArray) {
  // get the drive filed id from url
  const driveId = match[4].match(/[-\w]{25,}/);
  const fileId: string = Array.isArray(driveId) && driveId.length > 0 ? driveId[0] : '';
  if (fileId) {
    const tarMsg = await bot.sendMessage(msg.chat.id, `Creating Tar: <code>` + match[4] + `</code>`, {
      reply_to_message_id: msg.message_id,
      parse_mode: 'HTML'
    });

    driveDownload.driveDownloadAndTar(fileId, bot, tarMsg).then((res: string) => {
      msgTools.deleteMsg(bot, tarMsg);
      msgTools.sendMessage(bot, msg, res, -1);
    }).catch(e => {
      msgTools.deleteMsg(bot, tarMsg);
      msgTools.sendMessage(bot, msg, e, 10000);
    });
  } else {
    msgTools.sendMessage(bot, msg, `Google drive ID could not be found in the provided link`);
  }
}

setEventCallback(eventRegex.commandsRegex.getLink, eventRegex.commandsRegexNoName.getLink, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    if (constants.INDEX_DOMAIN) {
      const fileId = downloadUtils.getIdFromUrl(match[4]);
      await driveDirectLink.getGDindexLink(fileId, true).then((gdIndex: { url: string, name: string }) => {
        let res = 'Direct Shareable Link: <a href = "' + gdIndex.url + '">' + gdIndex.name + '</a>';
        msgTools.sendMessage(bot, msg, res, 60000);
      }).catch((err: string) => {
        msgTools.sendMessage(bot, msg, err, 6000);
      });
    } else {
      msgTools.sendMessage(bot, msg, 'GdIndex isn\'t configured.', 6000);
    }
  }
});

setEventCallback(eventRegex.commandsRegex.help, eventRegex.commandsRegexNoName.help, async (msg, match) => {
  if (msgTools.isAuthorized(msg) < 0) {
    msgTools.sendUnauthorizedMessage(bot, msg);
  } else {
    const text = `
    <b>Command ｜ Description</b>
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/mirror </code>url or <code>/m </code>url <b>|</b> Download from the given URL and upload it to Google Drive
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/mirrorTar </code>url or <code>/m </code>url <b>|</b> Same as <code>/mirror</code>, but archive multiple files into a tar before uploading it.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/mirrorStatus</code> or <code>/ms</code> <b>|</b> Send a status message about all active and queued downloads.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/cancelMirror</code> or <code>/cm</code> or <code>/cancelMirror </code>gid or <code>/cm </code>gid <b>|</b> Cancel a particular mirroring task. Send it as a reply to the message that started the download that you want to cancel or with gid.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/cancelAll</code> or <code>/ca</code> <b>|</b> Cancel all mirroring tasks in all chats if a SUDO_USERS member uses it, or cancel all mirroring tasks for a particular chat if one of that chat's admins use it. No one else can use this command.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/list </code>filename or <code>/l </code>filename <b>|</b> Send links to downloads with the filename substring in the name. In case of too many downloads, only show the most recent few.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/clone </code>driveUrl or <code>/c </code>driveUrl <b>|</b> Clone any shareable drive link.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/mf</code> or <code>/mirror file</code> <b>|</b> Forward any torrent file and reply to the forwared message with this command it will start mirroring the torrent.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/unzipMirror </code>url or <code>/um </code>url <b>|</b> Unzip the archive and uploads the unzipped folder. Supported filetypes: .zip, .gz, .bz2, .tar, tar.gz, tar.bz2, .tgz, .tbz2
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/count </code>driveUrl or <code>/cnt </code>driveUrl <b>|</b> Obtain informations about a drive folder and send it as a table.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/tar </code>driveUrl or <code>/t </code>driveUrl <b>|</b> Create a tar of drive folder and upload to drive.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/getlink </code>driveUrl or <code>/gl </code>driveUrl <b>|</b> Get the corresponding index link.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/getfolder</code> or <code>/gf</code> <b>|</b> Send link of drive mirror folder.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/stats</code> <b>|</b> Send disk information, cpu load of the machine & bot uptime.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/authorize</code> or <code>/a</code> <b>|</b> To authorize a chat, only run by SUDO_USERS.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/unauthorize</code> or <code>/ua</code> <b>|</b> To Unauthorize a chat, only run by SUDO_USERS.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/restart</code> or <code>/r</code> <b>|</b> Restart Heroku dyno, only run by SUDO_USERS.
    ➖➖➖➖➖➖➖➖➖➖➖➖
    <code>/help</code> or <code>/h</code> <b>|</b> You already know what it does.
    ➖➖➖➖➖➖➖➖➖➖➖➖\n<i>Note: All the above command can also be called using dot(.) instead of slash(/). For e.x: <code>.mirror </code>url or <code>.m </code>url</i>
    `
    msgTools.sendMessage(bot, msg, text, 60000);
  }
});

function cancelMultipleMirrors(msg: TelegramBot.Message): void {
  var count = 0;
  dlManager.forEachCancelledDl(dl => {
    if (cancelMirror(dl)) {
      count++;
    }
  });

  if (count > 0) {
    msgTools.sendMessage(bot, msg, `${count} downloads cancelled.`, -1);
    sendCancelledMessages();
  } else {
    msgTools.sendMessage(bot, msg, 'No downloads to cancel');
  }
}

function sendCancelledMessages(): void {
  dlManager.forEachCancelledChat((usernames, tgChat) => {
    var message = usernames.reduce((prev, cur, i) => (i > 0) ? `${prev}${cur}, ` : `${cur}, `,
      usernames[0]);
    message += 'your downloads have been manually cancelled.';
    bot.sendMessage(tgChat, message, { parse_mode: 'HTML' })
      .then(() => {
        dlManager.removeCancelledMessage(tgChat);
      })
      .catch((err) => {
        dlManager.removeCancelledMessage(tgChat);
        console.error(`sendMessage error: ${err.message}`);
      });
  });
}

export function cancelMirror(dlDetails: details.DlVars, cancelMsg?: TelegramBot.Message): boolean {
  if (dlDetails.isUploading || dlDetails.isExtracting) {
    if (cancelMsg) {
      msgTools.sendMessage(bot, cancelMsg, 'Upload in progress. Cannot cancel.');
    }
    return false;
  } else {
    ariaTools.stopDownload(dlDetails.gid, () => {
      // Not sending a message here, because a cancel will fire
      // the onDownloadStop notification, which will notify the
      // person who started the download

      if (cancelMsg && dlDetails.tgChatId !== cancelMsg.chat.id) {
        // Notify if this is not the chat the download started in
        msgTools.sendMessage(bot, cancelMsg, 'The download was canceled.');
      }
      if (!dlDetails.isDownloading) {
        // onDownloadStopped does not fire for downloads that haven't started yet
        // So calling this here
        ariaOnDownloadStop(dlDetails.gid, 1);
      }
    });
    return true;
  }
}

/**
 * Cancels the download if its filename contains a string from
 * constants.ARIA_FILTERED_FILENAMES. Call this on every status message update,
 * because the file name might not become visible for the first few status
 * updates, for example, in case of BitTorrents.
 *
 * @param {String} filename The name of the downloaded file/top level directory
 * @returns {boolean} False if file name is disallowed, true otherwise,
 *                    or if undetermined
 */
function handleDisallowedFilename(dlDetails: details.DlVars, filename: string): boolean {
  if (dlDetails) {
    if (dlDetails.isDownloadAllowed === 0) return false;
    if (dlDetails.isDownloadAllowed === 1) return true;
    if (!filename) return true;

    var isAllowed = filenameUtils.isFilenameAllowed(filename);
    if (isAllowed === 0) {
      dlDetails.isDownloadAllowed = 0;
      if (!dlDetails.isUploading || !dlDetails.isExtracting) {
        cancelMirror(dlDetails);
      }
      return false;
    } else if (isAllowed === 1) {
      dlDetails.isDownloadAllowed = 1;
    }
  }
  return true;
}

export function prepDownload(msg: TelegramBot.Message, match: string, isTar: boolean, isUnZip: boolean, filename = ''): void {
  var dlDir = uuidv4();
  let unzipPassword = '';
  if (match && isUnZip) {
    // check for password in case of unzip
    let tempMatch = match.split(' ').map(str => str.trim());
    match = tempMatch[0];
    if (tempMatch.length > 1) unzipPassword = tempMatch[1];
  }
  ariaTools.addUri(match, dlDir, filename, (err, gid) => {
    dlManager.addDownload(gid, dlDir, msg, isTar, isUnZip, unzipPassword);
    if (err) {
      var message = `Failed to start the download. ${err.message}`;
      console.error(message);
      cleanupDownload(gid, message);
    } else {
      console.log(`gid: ${gid} download:${match}`);
      // Wait a second to give aria2 enough time to queue the download
      setTimeout(() => {
        dlManager.setStatusLock(msg, sendStatusMessage);
      }, 1000);
    }
  });

}

/**
 * Sends a single status message for all active and queued downloads.
 */
function sendStatusMessage(msg: TelegramBot.Message, keepForever?: boolean): Promise<any> {
  var lastStatus = dlManager.getStatus(msg.chat.id);

  if (lastStatus) {
    msgTools.deleteMsg(bot, lastStatus.msg);
    dlManager.deleteStatus(msg.chat.id);
  }

  return new Promise<void>(resolve => {
    downloadUtils.getStatusMessage()
      .then(res => {
        if (keepForever) {
          msgTools.sendMessage(bot, msg, res.message, -1, message => {
            dlManager.addStatus(message, res.message);
            resolve();
          });
        } else {
          var ttl = 60000;
          msgTools.sendMessage(bot, msg, res.message, ttl, message => {
            dlManager.addStatus(message, res.message);
            setTimeout(() => {
              dlManager.deleteStatus(msg.chat.id);
            }, ttl);
            resolve();
          }, true);
        }
      })
      .catch(resolve);
  });
}

/**
 * Updates all status messages
 */
function updateAllStatus(): void {
  downloadUtils.getStatusMessage()
    .then(res => {
      var staleStatusReply = 'ETELEGRAM: 400 Bad Request: message to edit not found';

      if (res.singleStatuses) {
        res.singleStatuses.forEach(async status => {
          if (status.dlDetails) {
            handleDisallowedFilename(status.dlDetails, status.filename);
            await driveList.isDuplicateMirror(status.filename, status.dlDetails).catch(console.log);
          }
        });
      }

      dlManager.forEachStatus(status => {
        // Do not update the status if the message remains the same.
        // Otherwise, the Telegram API starts complaining.
        if (res.message !== status.lastStatus) {
          msgTools.editMessage(bot, status.msg, res.message, staleStatusReply)
            .catch(err => {
              if (err.message === staleStatusReply) {
                dlManager.deleteStatus(status.msg.chat.id);
              }
            });
          status.lastStatus = res.message;
        }
      });

      if (res.totalDownloadCount === 0) {
        // No more active or queued downloads, let's stop the status refresh timer
        clearInterval(statusInterval);
        statusInterval = null;
        deleteAllStatus();
      }
    }).catch();
}

function deleteAllStatus(): void {
  dlManager.forEachStatus(statusMessage => {
    msgTools.deleteMsg(bot, statusMessage.msg, 10000);
    dlManager.deleteStatus(statusMessage.msg.chat.id);
  });
}

/**
 * After a download is complete (failed or otherwise), call this to clean up.
 * @param gid The gid for the download that just finished
 * @param message The message to send as the Telegram download complete message
 * @param url The public Google Drive URL for the uploaded file
 */
function cleanupDownload(gid: string, message: string, url?: string, dlDetails?: details.DlVars): void {
  if (!dlDetails) {
    dlDetails = dlManager.getDownloadByGid(gid);
  }
  if (dlDetails) {
    var wasCancelAlled = false;
    dlManager.forEachCancelledDl(dlDetails => {
      if (dlDetails.gid === gid) {
        wasCancelAlled = true;
      }
    });
    if (!wasCancelAlled) {
      // If the dl was stopped with a cancelAll command, a message has already been sent to the chat.
      // Do not send another one.
      if (dlDetails.tgRepliedUsername) {
        message += `\ncc: ${dlDetails.tgRepliedUsername}`;
      }
      msgTools.sendMessageReplyOriginal(bot, dlDetails, message)
        .catch((err) => {
          console.error(`cleanupDownload sendMessage error: ${err.message}`);
        });
    }

    if (url) {
      msgTools.notifyExternal(dlDetails, true, gid, dlDetails.tgChatId, url);
    } else {
      msgTools.notifyExternal(dlDetails, false, gid, dlDetails.tgChatId);
    }
    dlManager.removeCancelledDls(gid);
    dlManager.deleteDownload(gid);
    updateAllStatus();
    downloadUtils.deleteDownloadedFile(dlDetails.downloadDir);
  } else {
    // Why is this message so calm? We should be SCREAMING at this point!
    console.error(`cleanupDownload: Could not get dlDetails for ${gid}`);
  }
}

function ariaOnDownloadStart(gid: string, retry: number): void {
  var dlDetails = dlManager.getDownloadByGid(gid);
  if (dlDetails) {
    dlManager.moveDownloadToActive(dlDetails);
    console.log(`${gid}: Started. Dir: ${dlDetails.downloadDir}.`);
    updateAllStatus();

    ariaTools.getStatus(dlDetails, async (err, message, filename) => {
      if (!err) {
        handleDisallowedFilename(dlDetails, filename);
        await driveList.isDuplicateMirror(filename, dlDetails).catch(console.log);
      }
    });

    if (!statusInterval) {
      statusInterval = setInterval(updateAllStatus,
        constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000);
    }
  } else if (retry <= 8) {
    // OnDownloadStart probably got called before prepDownload's startDownload callback. Fairly common. Retry.
    setTimeout(() => ariaOnDownloadStart(gid, retry + 1), 500);
  } else {
    console.error(`onDownloadStart: DlDetails still empty for ${gid}. Giving up.`);
  }
}

function ariaOnDownloadStop(gid: string, retry: number): void {
  var dlDetails = dlManager.getDownloadByGid(gid);
  if (dlDetails) {
    console.log(`${gid}: Stopped`);
    var message = 'Download stopped.';
    if (dlDetails.isDownloadAllowed === 0) {
      message += ' Blacklisted file name.';
    } else if (dlDetails.isDuplicateMirror && dlDetails.isDuplicateMirror !== '') {
      message += ` Duplicate mirror, below matching file(s) found:\n\n${dlDetails.isDuplicateMirror}`;
    }
    cleanupDownload(gid, message);
  } else if (retry <= 8) {
    // OnDownloadStop probably got called before prepDownload's startDownload callback. Unlikely. Retry.
    setTimeout(() => ariaOnDownloadStop(gid, retry + 1), 500);
  } else {
    console.error(`onDownloadStop: DlDetails still empty for ${gid}. Giving up.`);
  }
}

function ariaOnDownloadComplete(gid: string, retry: number): void {
  var dlDetails = dlManager.getDownloadByGid(gid);
  if (dlDetails) {

    ariaTools.getAriaFilePath(gid, (err, file) => {
      if (err) {
        console.error(`onDownloadComplete: Error getting file path for ${gid}. ${err}`);
        var message = 'Upload failed. Could not get downloaded files.';
        cleanupDownload(gid, message);
        return;
      }

      if (file) {
        ariaTools.getFileSize(gid, async (err, size) => {
          if (err) {
            console.error(`onDownloadComplete: Error getting file size for ${gid}. ${err}`);
            var message = 'Upload failed. Could not get file size.';
            cleanupDownload(gid, message);
            return;
          }

          var filename = filenameUtils.getFileNameFromPath(file, null);
          if (handleDisallowedFilename(dlDetails, filename)) {

            const duplicateMirror = await driveList.isDuplicateMirror(filename, dlDetails).catch(console.log);
            if (duplicateMirror) {
              var reason = `Upload failed. Duplicate mirror, below matching file(s) found:\n\n${duplicateMirror}`;
              console.log(`${gid}: Duplicate mirror. Filename: ${filename}.`);
              return cleanupDownload(gid, reason);
            }

            let isUnzip = false;
            if (dlDetails.isUnzip) {
              try {
                isUnzip = true;
                const extractDetails = await ariaTools.extractFile(dlDetails, file, size);
                file = extractDetails.filePath;
                filename = extractDetails.filename;
                size = extractDetails.size; //TODO: To check if size is null
              } catch (error) {
                cleanupDownload(gid, error.message);
                return;
              }
            }
            dlDetails.isUploading = true;
            console.log(`${gid}: Completed. Filename: ${filename}. Starting upload.`);
            ariaTools.uploadFile(dlDetails, file, size, isUnzip, driveUploadCompleteCallback);
          } else {
            var reason = 'Upload failed. Blacklisted file name.';
            console.log(`${gid}: Blacklisted. Filename: ${filename}.`);
            cleanupDownload(gid, reason);
          }
        });
      } else {
        ariaTools.isDownloadMetadata(gid, (err, isMetadata, newGid) => {
          if (err) {
            console.error(`${gid}: onDownloadComplete: Failed to check if it was a metadata download: ${err}`);
            var message = 'Upload failed. Could not check if the file is metadata.';
            cleanupDownload(gid, message);
          } else if (isMetadata) {
            console.log(`${gid} Changed to ${newGid}`);
            dlManager.changeDownloadGid(gid, newGid);
          } else {
            console.error('onDownloadComplete: No files - not metadata.');
            var reason = 'Upload failed. Could not get files.';
            cleanupDownload(gid, reason);
          }
        });
      }
    });
  } else if (retry <= 8) {
    // OnDownloadComplete probably got called before prepDownload's startDownload callback. Highly unlikely. Retry.
    setTimeout(() => ariaOnDownloadComplete(gid, retry + 1), 500);
  } else {
    console.error(`${gid}: onDownloadComplete: DlDetails still empty. Giving up.`);
  }
}

function ariaOnDownloadError(gid: string, retry: number): void {
  var dlDetails = dlManager.getDownloadByGid(gid);
  if (dlDetails) {
    ariaTools.getError(gid, (err, res) => {
      var message: string;
      if (err) {
        message = 'Failed to download.';
        console.error(`${gid}: failed. Failed to get the error message. ${err}`);
      } else {
        message = `Failed to download. ${res}`;
        console.error(`${gid}: failed. ${res}`);
      }
      cleanupDownload(gid, message, null, dlDetails);
    });
  } else if (retry <= 8) {
    // OnDownloadError probably got called before prepDownload's startDownload callback,
    // or gid refers to a torrent files download, and onDownloadComplete for the torrent's
    // metadata hasn't been called yet. Fairly likely. Retry.
    setTimeout(() => ariaOnDownloadError(gid, retry + 1), 500);
  } else {
    console.error(`${gid}: onDownloadError: DlDetails still empty. Giving up.`);
  }
}

function initAria2(): void {
  ariaTools.openWebsocket((err) => {
    if (err) {
      console.error('A2C: Failed to open websocket. Run aria.sh first. Exiting.');
      process.exit();
    } else {
      websocketOpened = true;
      console.log('A2C: Websocket opened. Bot ready.');
    }
  });

  ariaTools.setOnDownloadStart(ariaOnDownloadStart);
  ariaTools.setOnDownloadStop(ariaOnDownloadStop);
  ariaTools.setOnDownloadComplete(ariaOnDownloadComplete);
  ariaTools.setOnDownloadError(ariaOnDownloadError);
}


function driveUploadCompleteCallback(err: string, gid: string, url: string, filePath: string,
  fileName: string, fileSize: number, isFolder: boolean, gdIndexLink?: string): void {

  var finalMessage;
  if (err) {
    var message = err;
    console.error(`${gid}: Failed to upload - ${filePath}: ${message}`);
    finalMessage = `Failed to upload <code>${fileName}</code> to Drive. ${message}`;
    cleanupDownload(gid, finalMessage);
  } else {
    console.log(`${gid}: Uploaded `);
    if (fileSize) {
      var fileSizeStr = downloadUtils.formatSize(fileSize);
      finalMessage = `<b>GDrive Link</b>: <a href="${url}">${fileName}</a> (${fileSizeStr})`;
    } else {
      finalMessage = `<b>GDrive Link</b>: <a href='${url}'>${fileName}</a>`;
    }

    if (gdIndexLink && constants.INDEX_DOMAIN) {
      finalMessage += `\n\n<b>Do not share the GDrive Link. \n\nYou can share this link</b>: <a href="${gdIndexLink}">${fileName}</a>`;
    }

    if (constants.IS_TEAM_DRIVE && isFolder) {
      finalMessage += '\n\n<i>Folders in Shared Drives can only be shared with members of the drive. Mirror as an archive if you need public links.</i>';
    }
    cleanupDownload(gid, finalMessage, url);
  }
}
