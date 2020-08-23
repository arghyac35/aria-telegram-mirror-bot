import TelegramBot = require("node-telegram-bot-api");
import fs = require('fs');
import constants = require('../.constants.js');
import driveAuth = require('./drive-auth.js');
import { google, drive_v3 } from 'googleapis';
import { driveListFiles, timeout } from './drive-clone.js';
import msgTools = require('../bot_utils/msg-tools.js');
import tar = require('./tar');
import fsWalk = require('../fs-walk');
import { DlVars } from "../dl_model/detail.js";
import driveDirectLink = require('./drive-directLink.js');
import downloadUtils = require('../download_tools/utils');
import uuid = require("uuid");
var Progress = require('progress-stream');
const perf = require('execution-time')();

var om = '';
async function downloadFile(file: any, drive: drive_v3.Drive, filePath: string, dir: string, bot: TelegramBot, tarringMsg: TelegramBot.Message, message: string) {
    return new Promise(async (resolve, reject) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        var dest = fs.createWriteStream(filePath);
        var progress = Progress({ time: constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000, length: file.size });

        await drive.files.get({
            fileId: file.id,
            supportsAllDrives: true,
            alt: 'media'
        }, {
            responseType: 'stream'
        }).then((res: any) => {
            res.data
                .on('end', () => {
                    resolve('Done');
                })
                .on('error', (dlErr: any) => {
                    console.log('error', dlErr);
                    reject(dlErr);
                })
                .pipe(progress).pipe(dest);
            //checking progress of file
            progress.on('progress', function (prog: any) {
                let totalsize = downloadUtils.formatSize(file.size);
                let speed = downloadUtils.formatSize(prog.speed.toFixed(2));
                let dLeft = downloadUtils.formatSize(prog.remaining);
                let dComp = downloadUtils.formatSize(prog.transferred);

                let tmessage = message + `\n<b>Downloading</b>: <code>${file.name}</code>\n<b>Size</b>: <code>${totalsize}</code>\n<b>Progress</b>: <code>${prog.percentage.toFixed(2)}%</code>\n<b>Remaining</b>: <code>${dLeft}</code>\n<b>Transfered</b>: <code>${dComp}</code>\n<b>Speed</b>: <code>${speed}ps</code>\n<b>ETA</b>: <code>${prog.eta}</code>`;

                if (om !== tmessage) {
                    msgTools.editMessage(bot, tarringMsg, tmessage);
                }
                om = tmessage;
            });
        }).catch((error: Error) => {
            reject(error.message + `\n\nEither it is not a Shareable Link or something went wrong while fetching files metadata`);
        });
    });
}

export async function driveDownloadAndTar(fileId: string, bot: TelegramBot, tarringMsg: TelegramBot.Message) {
    const dlDetails: DlVars = {
        isTar: true,
        isUnzip: false,
        tgUsername: '',
        gid: '',
        downloadDir: '',
        tgChatId: 0,
        tgFromId: 0,
        tgMessageId: 0,
        tgRepliedUsername: '',
        isDownloadAllowed: 1,
        isDownloading: true,
        isUploading: true,
        uploadedBytes: 0,
        uploadedBytesLast: 0,
        startTime: 0,
        lastUploadCheckTimestamp: 0
    };
    return new Promise(async (resolve, reject) => {
        driveAuth.call(async (err, auth) => {
            if (err) {
                reject(err);
            }
            const drive = google.drive({ version: 'v3', auth });
            let message = `Creating Tar: <code>`;
            perf.start();
            await drive.files.get({ fileId: fileId, fields: 'id, name, mimeType, size', supportsAllDrives: true }).then(async meta => {
                // check if its folder or not
                if (meta.data.mimeType === 'application/vnd.google-apps.folder') {
                    message += meta.data.name + `</code>`;
                    msgTools.editMessage(bot, tarringMsg, message);
                    var dlDir = uuid();
                    let folderPath = `${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}/${meta.data.name}/`;
                    let originalFileName = meta.data.name;

                    let res = await downloadAllFiles(meta.data, drive, folderPath, bot, tarringMsg, message);
                    if (res.message && res.message.includes('found')) {
                        reject(res.message);
                    } else {
                        // make tar of the downloaded files
                        // start tarring
                        message = `Creating Tar: <code>${meta.data.name}</code>\n\n🤐All files download complete now making tar...`;
                        msgTools.editMessage(bot, tarringMsg, message);

                        console.log('Starting archival');
                        var destName = originalFileName + '.tar';
                        let realFilePath = `${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}/${originalFileName}`;
                        tar.archive(realFilePath, destName, (tarerr: string, size: number) => {
                            if (tarerr) {
                                reject('Error while creating archive: ' + tarerr);
                            } else {
                                console.log('Archive complete');
                                message += `\n\n✔Making tar complete, starting file upload...`;
                                msgTools.editMessage(bot, tarringMsg, message);
                                updateStatus(dlDetails, size, message, bot, tarringMsg);
                                let statusInterval = setInterval(() => {
                                    updateStatus(dlDetails, size, message, bot, tarringMsg);
                                },
                                    constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000);
                                driveUploadFile(realFilePath + '.tar', dlDetails, (uperr, url, isFolder, indexLink) => {
                                    clearInterval(statusInterval);
                                    var finalMessage;
                                    if (uperr) {
                                        console.error(`Failed to upload - ${realFilePath}: ${uperr}`);
                                        finalMessage = `Failed to upload <code>${destName}</code> to Drive. ${uperr}`;
                                        // callback(finalMessage, true);
                                        reject(finalMessage);
                                    } else {
                                        console.log(`Uploaded ${destName}`);
                                        if (size) {
                                            var fileSizeStr = downloadUtils.formatSize(size);
                                            finalMessage = `<b>GDrive Link</b>: <a href="${url}">${destName}</a> (${fileSizeStr})`;
                                            if (indexLink && constants.INDEX_DOMAIN) {
                                                finalMessage += `\n\n<b>Do not share the GDrive Link. \n\nYou can share this link</b>: <a href="${indexLink}">${destName}</a>`;
                                            }
                                        } else {
                                            finalMessage = `<a href='${url}'>${destName}</a>`;
                                        }
                                        if (constants.IS_TEAM_DRIVE && isFolder) {
                                            finalMessage += '\n\n<i>Folders in Shared Drives can only be shared with members of the drive. Mirror as an archive if you need public links.</i>';
                                        }
                                        if (res.status) {
                                            finalMessage += '\n\nNote: There might be somefiles which is not inside tar, because downloading failed.'
                                        }
                                    }
                                    downloadUtils.deleteDownloadedFile(dlDir);
                                    const results = perf.stop();
                                    finalMessage += `\n\nExecution time: ${millisToMinutesAndSeconds(results.time)}`;
                                    resolve(finalMessage);
                                });
                            }
                        });
                    }

                } else {
                    reject('Provide folder url');
                }
            }).catch(e => {
                reject(e.message + `\n\nEither it is not a Shareable Link or something went wrong while fetching files metadata`);
            });
        });
    });
}

function millisToMinutesAndSeconds(millis: number) {
    var minutes = Math.floor(millis / 60000);
    var seconds = Math.floor((millis % 60000) / 1000);
    return (seconds == 60 ? (minutes + 1) + ":00" : minutes + ":" + (seconds < 10 ? "0" : "") + seconds);
}

async function downloadAllFiles(meta: drive_v3.Schema$File, drive: drive_v3.Drive, folderPath: string, bot: TelegramBot, tarringMsg: TelegramBot.Message, message: string) {
    // list all files inside the folder
    const files = await driveListFiles("'" + meta.id + "' in parents and trashed = false", drive);
    let errMsg: boolean;
    let rmessage: string;
    if (files.length > 0) {
        // download the file one by one
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                await downloadAllFiles(file, drive, folderPath + file.name + '/', bot, tarringMsg, message);
            } else {
                let filePath = folderPath + file.name;
                await timeout(1000);
                await downloadFile(file, drive, filePath, folderPath, bot, tarringMsg, message).then(d => {
                    console.log('Download complete for: ', file.name);
                }).catch(e => {
                    console.log('Download error for: ', file.name);
                    console.error('Error: ', e);
                    errMsg = true;
                });
            }
        }
    } else {
        rmessage = 'No files found inside folder';
    }
    return { message: rmessage, status: errMsg };
}

interface DriveUploadCompleteCallback {
    (err: string, url: string, isFolder: boolean, indexLink?: string): void;
}

function driveUploadFile(filePath: string, dlDetails: DlVars, callback: DriveUploadCompleteCallback): void {
    fsWalk.uploadRecursive(dlDetails,
        filePath,
        constants.GDRIVE_PARENT_DIR_ID,
        async (err: string, url: string, isFolder: boolean, fileId: string) => {
            if (err) {
                callback(err, url, isFolder);
            } else {
                if (constants.INDEX_DOMAIN) {
                    await driveDirectLink.getGDindexLink(fileId).then((gdIndexLink: string) => {
                        callback(err, url, isFolder, gdIndexLink);
                    }).catch((dlErr: string) => {
                        callback(dlErr, url, isFolder);
                    });
                } else {
                    callback(err, url, isFolder);
                }
            }
        });
}
var lastMessage = '';
function updateStatus(dlDetails: DlVars, totalsize: number, message: string, bot: TelegramBot, tarringMsg: TelegramBot.Message): void {
    let sm = getStatus(dlDetails, totalsize);
    message += `\n\n` + sm.message;
    if (lastMessage !== message) {
        msgTools.editMessage(bot, tarringMsg, message).catch(e => {
            console.error('UpdateStatus error: ', e.message);
        });
    }
    lastMessage = message;
}

function getStatus(dlDetails: DlVars, totalSize: number) {
    var downloadSpeed: number;
    var time = new Date().getTime();
    if (!dlDetails.lastUploadCheckTimestamp) {
        downloadSpeed = 0;
    } else {
        downloadSpeed = (dlDetails.uploadedBytes - dlDetails.uploadedBytesLast)
            / ((time - dlDetails.lastUploadCheckTimestamp) / 1000);
    }
    dlDetails.uploadedBytesLast = dlDetails.uploadedBytes;
    dlDetails.lastUploadCheckTimestamp = time;

    var statusMessage = downloadUtils.generateStatusMessage2(totalSize,
        dlDetails.uploadedBytes, downloadSpeed);
    return statusMessage;
}