import constants = require('../.constants.js');
import driveAuth = require('./drive-auth.js');
import { google, drive_v3 } from 'googleapis';
import gdrive = require('./drive-upload');
import TelegramBot = require('node-telegram-bot-api');
import msgTools = require('../bot_utils/msg-tools.js');
import http = require('http');
import dlUtils = require('../download_tools/utils');


export async function driveClone(fileId: string, bot: TelegramBot, cloneMsg: TelegramBot.Message) {
    return new Promise(async (resolve, reject) => {
        driveAuth.call(async (err, auth) => {
            if (err) {
                reject(err);
            }
            let message = `Cloning: <code>`;
            const drive = google.drive({ version: 'v3', auth });
            await drive.files.get({ fileId: fileId, fields: 'id, name, mimeType, size', supportsAllDrives: true }).then(async (meta) => {
                message += meta.data.name + `</code>`;
                msgTools.editMessage(bot, cloneMsg, message);
                // Check for folders
                if (meta.data.mimeType === 'application/vnd.google-apps.folder') {
                    // Create directory
                    createFolder(drive, meta.data.name, constants.GDRIVE_PARENT_DIR_ID, meta.data.mimeType, async (err, dir_id) => {
                        if (err) {
                            reject(err);
                        } else {
                            message += `\n\nFolder Created, now Ruko zara🖐 sabar karo✋...`;
                            msgTools.editMessage(bot, cloneMsg, message);
                            // copy dir
                            let folderSize = await copyFolder(meta.data, dir_id, drive);
                            let msg: string;
                            gdrive.getSharableLink(dir_id, true, (err, url) => {
                                if (err) {
                                    reject(err);
                                }
                                msg = `<a href="` + url + `">` + meta.data.name + `</a> (` + dlUtils.formatSize(folderSize) + `)`;
                                if (constants.INDEX_DOMAIN) {
                                    msg += `\n\n<a href="` + constants.INDEX_DOMAIN + encodeURIComponent(meta.data.name) + `/">Index URL</a>`
                                }
                                notifyExternal(true, cloneMsg.chat.id, { name: meta.data.name, url, size: folderSize });
                                folderSize = 0;
                                resolve(msg);
                            });
                        }
                    });
                } else {
                    message += `\n\nRuko zara sabar karo...`;
                    msgTools.editMessage(bot, cloneMsg, message);
                    //copy file
                    await copyFile(meta.data, constants.GDRIVE_PARENT_DIR_ID, drive).then((res: any) => {
                        let msg: string;
                        message += `\n\nYo boi copy is done getting shareable link...`;
                        msgTools.editMessage(bot, cloneMsg, message);
                        gdrive.getSharableLink(res.id, false, (err, url) => {
                            if (err) {
                                reject(err);
                            }
                            msg = `<a href="` + url + `">` + res.name + `</a> (` + dlUtils.formatSize(res.size) + `)`;
                            if (constants.INDEX_DOMAIN) {
                                msg += `\n\n<a href="` + constants.INDEX_DOMAIN + encodeURIComponent(res.name) + `">Index URL</a>`
                            }
                            res.url = url;
                            notifyExternal(true, cloneMsg.chat.id, res);
                            resolve(msg);
                        });
                    }).catch((err: string) => {
                        reject(err);
                    });
                }
            }).catch((error: Error) => {
                reject(error.message + `\n\nEither it is not a Shareable Link or something went wrong while fetching files metadata`);
            });
        });
    });
}

export async function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function copyFile(file: any, parent: string, drive: drive_v3.Drive) {
    console.log('Copying file: ', file.name);
    let body = {
        'parents': [parent],
        'name': file.name
    };
    return new Promise(async (resolve, reject) => {
        drive.files.copy({ fileId: file.id, fields: 'id, name, mimeType, size', supportsAllDrives: true, requestBody: body }, async (err: Error, res: any) => {
            if (err) {
                reject(err.message);
            } else {
                resolve(res.data);
            }
        });
    });
}

async function copyFolder(file: drive_v3.Schema$File, dir_id: string, drive: drive_v3.Drive) {
    let searchQuery = `'` + file.id + `' in parents and trashed = false`; let folderSize = 0;
    let files = await driveListFiles(searchQuery, drive);
    for (let index = 0; index < files.length; index++) {
        const element = files[index];
        if (element.mimeType === 'application/vnd.google-apps.folder') {
            // recurse
            await timeout(1000);
            console.log('Creating folder: ', element.name);
            let id = await createFolder2(drive, element.name, dir_id, element.mimeType);
            folderSize += await copyFolder(element, id, drive);
        } else {
            await timeout(1000); // 1 sec
            await copyFile(element, dir_id, drive).then(d => {
                folderSize += parseInt(element.size);
            }).catch(err => {
                console.error('Error copying file: ' + element.name + ' Error for: ' + err)
            });

        }
    }
    return folderSize;
}

export async function driveListFiles(searchQuery: string, drive: drive_v3.Drive) {
    const getList = (pageToken: string) => {
        return new Promise((resolve, reject) => {
            const qs = {
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
                q: searchQuery,
                orderBy: 'folder,name,modifiedTime desc',
                fields:
                    'files(id,name,mimeType,size,modifiedTime,parents),nextPageToken',
                pageSize: 1000,
                pageToken: pageToken
            }
            drive.files.list(
                qs
                , function (err: Error, res: any) {
                    if (err) {
                        reject(err);
                    }
                    resolve(res);
                });
        });
    }
    const files = [];
    let pageToken: string;

    do {
        const resp: any = await getList(pageToken);
        files.push(...resp.data.files);
        pageToken = resp.data.nextPageToken;
    } while (pageToken);
    return files;
}

async function createFolder2(drive: drive_v3.Drive, directory_name: string, parent: string, mime: string): Promise<any> {
    return await drive.files.create({
        fields: 'id',
        supportsAllDrives: true,
        requestBody: {
            mimeType: mime,
            name: directory_name,
            parents: [parent]
        }
    }).then(res => {
        return res.data.id;
    }).catch(error => {
        console.error('Cannont create folder: ', error.message);
    });
}

function createFolder(drive: drive_v3.Drive, directory_name: string, parent: string, mime: string,
    callback: (err: string, id: string) => void): void {
    drive.files.create({
        // @ts-ignore Unknown property error
        fields: 'id',
        supportsAllDrives: true,
        requestBody: {
            mimeType: mime,
            name: directory_name,
            parents: [parent]
        }
    },
        (err: Error, res: any) => {
            if (err) {
                callback(err.message, null);
            } else {
                callback(null, res.data.id);
            }
        });
}

function notifyExternal(successful: boolean, originGroup: number, values: any) {
    if (!constants.DOWNLOAD_NOTIFY_TARGET || !constants.DOWNLOAD_NOTIFY_TARGET.enabled) return;
    const data = JSON.stringify({
        successful: successful,
        file: {
            name: 'Cloning: ' + values.name,
            driveURL: values.url,
            size: dlUtils.formatSize(values.size)
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