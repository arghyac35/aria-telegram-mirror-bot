import TelegramBot = require("node-telegram-bot-api");
import fs = require('fs');
import constants = require('../.constants');
import driveAuth = require('./drive-auth');
import { google, drive_v3 } from 'googleapis';
import { timeout } from './drive-clone';
import msgTools = require('../bot_utils/msg-tools');
import tar = require('./tar');
import fsWalk = require('../fs-walk');
import { DlVars } from "../dl_model/detail";
import driveDirectLink = require('./drive-directLink');
import downloadUtils = require('../download_tools/utils');
import { v4 as uuidv4 } from 'uuid';
const perf = require('execution-time')();
import path from 'path';
import gdUtils = require('./gd-utils');
import { isDuplicateMirror } from './drive-list';

const FOLDER_TYPE = 'application/vnd.google-apps.folder'
const PARALLEL_LIMIT = 10 // The number of parallel network requests can be adjusted according to the network environment

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
        isDuplicateMirror: 0,
        uploadedBytes: 0,
        uploadedBytesLast: 0,
        startTime: 0,
        lastUploadCheckTimestamp: 0,
        isExtracting: false,
        extractedFileName: '',
        extractedFileSize: '',
        unzipPassword: ''
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
                if (meta.data.mimeType === FOLDER_TYPE) {
                    let originalFileName = meta.data.name;

                    // Check for duplicate mirror starts
                    const duplicate = await isDuplicateMirror(originalFileName + '.tar');
                    if (duplicate) {
                        return resolve(`File(s) to be cloned already exists:\n\n${duplicate}`);
                    }
                    // Check for duplicate mirror ends

                    message += meta.data.name + `</code>`;
                    msgTools.editMessage(bot, tarringMsg, message);
                    var dlDir = uuidv4();
                    let folderPath = `${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}/${meta.data.name}/`;

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

interface DriveUploadCompleteCallback {
    (err: string, url: string, isFolder: boolean, indexLink?: string): void;
}

export function driveUploadFile(filePath: string, dlDetails: DlVars, callback: DriveUploadCompleteCallback): void {
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
export function updateStatus(dlDetails: DlVars, totalsize: number, message: string, bot: TelegramBot, tarringMsg: TelegramBot.Message): void {
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

async function downloadAllFiles(meta: drive_v3.Schema$File, drive: drive_v3.Drive, folderPath: string, bot: TelegramBot, tarringMsg: TelegramBot.Message, message: string) {
    let errMsg: boolean;
    let rmessage: string;

    const arr = await gdUtils.walk_and_save(meta.id)
    const smy = gdUtils.summary(arr);
    const folders: any[] = [];
    let totalFilesSize = 0;
    let files = arr.filter((v: any) => {
        if (v.mimeType !== FOLDER_TYPE) {
            totalFilesSize += v.size;
            return true;
        }
        else {
            if (v.mimeType === FOLDER_TYPE) folders.push(v);
            return false;
        }
    });
    const totalFiles = files.length;
    console.log('Number of folders to be downloaded: ', folders.length)
    console.log('Number of files to be downloaded: ', totalFiles)

    if (totalFiles === 0) {
        console.log('No files found inside folder');
        rmessage = 'No files found inside folder';
    } else {

        const mapping = await create_folders(meta.id, folders, folderPath);
        let tmpTgMessage = ''

        const tg_loop = setInterval(() => {
            let tgMessage = message + `\n=====Downloading files=====\n\nFile Progress: ${count}/${totalFiles}\nTotal Percentage: ${(count * 100 / totalFiles).toFixed(2)}%\nTotal Size: ${smy.total_size || 'Unknown'}`;
            if (tgMessage !== tmpTgMessage) {
                msgTools.editMessage(bot, tarringMsg, tgMessage).catch(console.error);
            }
            tmpTgMessage = tgMessage;
        }, constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000);

        let count = 0
        let concurrency = 0
        let err
        do {
            if (err) {
                files = null
                console.log('Err while downloadFile-->', err);
                errMsg = true;
                clearInterval(tg_loop)
                break;
            }
            if (concurrency >= PARALLEL_LIMIT) {
                await timeout(100)
                continue
            }
            const file = files.shift()
            if (!file) {
                await timeout(1000)
                continue
            }
            concurrency++
            const { parent, name } = file
            const targetFolderPath = mapping[parent] || folderPath;
            const filePath = path.join(targetFolderPath, name);
            downloadFile(file, drive, filePath).then((downloadedFile: any) => {
                if (downloadedFile) {
                    count++
                }
            }).catch(e => {
                err = e
            }).finally(() => {
                concurrency--
            })
        } while (concurrency || files.length)
        clearInterval(tg_loop)
        if (err) errMsg = true;
    }

    return { message: rmessage, status: errMsg };
}

async function create_folders(source: string, folders: any[], root: string) {
    if (!Array.isArray(folders)) throw new Error('folders must be Array:' + folders)
    const mapping: any = {};
    mapping[source] = root
    if (!folders.length) {
        await create_local_folder(root);
        return mapping;
    }

    const missed_folders = folders.filter(v => !mapping[v.id])
    console.log('Start creating folders, total：', missed_folders.length)
    let count = 0
    let same_levels = folders.filter(v => v.parent === folders[0].parent)

    while (same_levels.length) {
        const same_levels_missed = same_levels.filter(v => !mapping[v.id])
        await Promise.all(same_levels_missed.map(async v => {
            try {
                const { name, id, parent } = v
                const target = mapping[parent] || root
                const new_folder = path.join(target, name);
                await create_local_folder(new_folder);
                count++
                mapping[id] = new_folder;
            } catch (e) {
                console.error('Error creating Folder:', e.message)
            }
        }))
        same_levels = [].concat(...same_levels.map(v => folders.filter(vv => vv.parent === v.id)))
    }

    return mapping
}

async function create_local_folder(folderPath: string) {
    return new Promise((res, rej) => {
        if (!fs.existsSync(folderPath)) {
            fs.mkdir(folderPath, { recursive: true }, (err) => {
                if (err) rej(err);
                else res('');
            });
        } else res('');

    });
}

async function downloadFile(file: any, drive: drive_v3.Drive, filePath: string) {
    return new Promise(async (resolve, reject) => {
        var dest = fs.createWriteStream(filePath);

        await drive.files.get({
            fileId: file.id,
            supportsAllDrives: true,
            alt: 'media'
        }, {
            responseType: 'stream'
        }).then((res: any) => {
            res.data
                .on('end', () => {
                    resolve(file);
                })
                .on('error', (dlErr: any) => {
                    console.log('error', dlErr);
                    reject(dlErr);
                }).pipe(dest);

        }).catch((error: Error) => {
            reject(error.message + `\n\nEither it is not a Shareable Link or something went wrong while fetching files metadata`);
        });
    });
}