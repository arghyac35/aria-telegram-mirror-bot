import constants = require('../.constants');
import driveAuth = require('./drive-auth');
import { google } from 'googleapis';
import gdrive = require('./drive-upload');
import TelegramBot = require('node-telegram-bot-api');
import msgTools = require('../bot_utils/msg-tools');
import http = require('http');
import dlUtils = require('../download_tools/utils');
import { real_copy, copy_file } from './gd-utils';


export async function driveClone(fileId: string, bot: TelegramBot, cloneMsg: TelegramBot.Message) {
    return new Promise((resolve, reject) => {
        driveAuth.callAsync().then(async (auth) => {
            let message = `Cloning: <code>`;
            const drive = google.drive({ version: 'v3', auth });
            await drive.files.get({ fileId: fileId, fields: 'id, name, mimeType, size', supportsAllDrives: true }).then(async (meta) => {
                message += meta.data.name + `</code>`;
                msgTools.editMessage(bot, cloneMsg, message);
                // Check for folders
                if (meta.data.mimeType === 'application/vnd.google-apps.folder') {
                    // Create directory
                    let source = fileId;
                    let target = constants.GDRIVE_PARENT_DIR_ID;
                    let totalfoldercopiedcount = 0;
                    const gen_text = (payload: any) => {
                        if (payload.isCopyingFolder) {
                            totalfoldercopiedcount = payload.copiedCount;
                            return `Creating Folders: ${totalfoldercopiedcount}/${payload.folder_count}`;
                        } else {
                            const total_count = (payload.file_count || 0) + (payload.folder_count || 0);
                            return `✔All folders created\n=====Copying files=====\n\nFile Progress: ${payload.copiedCount}/${payload.file_count === undefined ? 'Unknown' : payload.file_count}\nTotal Percentage: ${((payload.copiedCount + totalfoldercopiedcount) * 100 / total_count).toFixed(2)}%\nTotal Size: ${payload.total_size || 'Unknown'}`;
                        }
                    }

                    const message_updater = async (payload: any) => await msgTools.editMessage(bot, cloneMsg, `${message}\n${gen_text(payload)}`).catch(err => console.error(err.message));

                    try {
                        const copiedFolder = await real_copy(source, target, message_updater);
                        let msg: string;
                        gdrive.getSharableLink(copiedFolder.id, true, (err, url) => {
                            if (err) {
                                reject(err);
                            }
                            msg = `<a href="` + url + `">` + meta.data.name + `</a> (` + copiedFolder.folderSize + `)`;
                            if (constants.INDEX_DOMAIN) {
                                msg += `\n\n<a href="` + dlUtils.checkTrailingSlash(constants.INDEX_DOMAIN) + encodeURIComponent(meta.data.name) + `/">Index URL</a>`
                            }
                            notifyExternal(true, cloneMsg.chat.id, { name: meta.data.name, url, size: copiedFolder.folderSize });
                            resolve(msg);
                        });
                    } catch (err) {
                        console.error('Error copying folder', err.message)
                        reject(err.message);
                    }
                } else {
                    // message += `\n\nRuko zara sabar karo...`;
                    // msgTools.editMessage(bot, cloneMsg, message);
                    //copy file
                    await copy_file(meta.data.id, constants.GDRIVE_PARENT_DIR_ID).then((new_file: any) => {
                        if (new_file) {
                            let msg: string;
                            message += `\n\nCopy is done getting shareable link...`;
                            msgTools.editMessage(bot, cloneMsg, message);
                            gdrive.getSharableLink(new_file.id, false, (err, url) => {
                                if (err) {
                                    reject('Error while getting shareablelink: ' + err);
                                }
                                msg = `<a href="` + url + `">` + new_file.name + `</a> (` + dlUtils.formatSize(new_file.size) + `)`;
                                if (constants.INDEX_DOMAIN) {
                                    msg += `\n\n<a href="` + dlUtils.checkTrailingSlash(constants.INDEX_DOMAIN) + encodeURIComponent(new_file.name) + `">Index URL</a>`
                                }
                                new_file.url = url;
                                notifyExternal(true, cloneMsg.chat.id, new_file);
                                resolve(msg);
                            });
                        } else {
                            reject('No file found after copy');
                        }
                    }).catch(e => {
                        reject(e.message || e);
                    });

                }
            }).catch((error: Error) => {
                reject(error.message + `\n\nEither it is not a Shareable Link or something went wrong while fetching files metadata`);
            });
        }).catch(reject);

    });
}


function notifyExternal(successful: boolean, originGroup: number, values: any) {
    if (!constants.DOWNLOAD_NOTIFY_TARGET || !constants.DOWNLOAD_NOTIFY_TARGET.enabled) return;
    const data = JSON.stringify({
        successful: successful,
        file: {
            name: 'Cloning: ' + values.name,
            driveURL: values.url,
            size: !isNaN(values.size) ? dlUtils.formatSize(values.size) : values.size
        },
        originGroup: originGroup
    });

    const options = {
        host: constants.DOWNLOAD_NOTIFY_TARGET.host,
        port: constants.DOWNLOAD_NOTIFY_TARGET.port,
        path: constants.DOWNLOAD_NOTIFY_TARGET.path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    var req = http.request(options);
    req.on('error', (e) => {
        console.error(`notifyExternal failed: ${e.message}`);
    });
    req.write(data);
    req.end();
}

