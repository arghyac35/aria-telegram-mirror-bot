import constants = require('../.constants');
import driveAuth = require('./drive-auth');
import { google, drive_v3 } from 'googleapis';
import gdrive = require('./drive-upload');
import TelegramBot = require('node-telegram-bot-api');
import msgTools = require('../bot_utils/msg-tools');
import http = require('http');
import dlUtils = require('../download_tools/utils');
import { readdirSync } from 'fs-extra';
let SERVICE_ACCOUNT_INDEX = 0;
let service_account_count = readdirSync('./accounts').length;
let driveService: drive_v3.Drive;

export async function driveClone(fileId: string, bot: TelegramBot, cloneMsg: TelegramBot.Message) {
    return new Promise((resolve, reject) => {
        driveAuth.callAsync(constants.USE_SERVICE_ACCOUNT_FOR_CLONE, SERVICE_ACCOUNT_INDEX).then(async (auth) => {
            let message = `Cloning: <code>`;
            const drive = google.drive({ version: 'v3', auth });
            driveService = drive;
            await drive.files.get({ fileId: fileId, fields: 'id, name, mimeType, size', supportsAllDrives: true }).then(async (meta) => {
                message += meta.data.name + `</code>`;
                msgTools.editMessage(bot, cloneMsg, message);
                // Check for folders
                if (meta.data.mimeType === 'application/vnd.google-apps.folder') {
                    // Create directory
                    await createFolder(drive, meta.data.name, constants.GDRIVE_PARENT_DIR_ID, meta.data.mimeType).then(async (dir_id) => {
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
                                msg += `\n\n<a href="` + constants.INDEX_DOMAIN + `GdriveBot/` + encodeURIComponent(meta.data.name) + `/">Index URL</a>`
                            }
                            notifyExternal(true, cloneMsg.chat.id, { name: meta.data.name, url, size: folderSize });
                            folderSize = 0;
                            resolve(msg);
                        });
                    }).catch(reject);
                } else {
                    message += `\n\nRuko zara sabar karo...`;
                    msgTools.editMessage(bot, cloneMsg, message);
                    //copy file
                    await copyFile(meta.data, constants.GDRIVE_PARENT_DIR_ID).then((res: any) => {
                        let msg: string;
                        message += `\n\nYo boi copy is done getting shareable link...`;
                        msgTools.editMessage(bot, cloneMsg, message);
                        gdrive.getSharableLink(res.id, false, (err, url) => {
                            if (err) {
                                reject(err);
                            }
                            msg = `<a href="` + url + `">` + res.name + `</a> (` + dlUtils.formatSize(res.size) + `)`;
                            if (constants.INDEX_DOMAIN) {
                                msg += `\n\n<a href="` + constants.INDEX_DOMAIN + `GdriveBot/` + encodeURIComponent(res.name) + `">Index URL</a>`
                            }
                            res.url = url;
                            notifyExternal(true, cloneMsg.chat.id, res);
                            resolve(msg);
                        });
                    }).catch(err => {
                        reject(err.message);
                    });
                }
            }).catch((error: Error) => {
                reject(error.message + `\n\nEither it is not a Shareable Link or something went wrong while fetching files metadata`);
            });
        }).catch(reject);

    });
}

export async function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function copyFile(file: any, parent: string): Promise<any> {
    try {
        console.log('Copying file: ', file.name);
        let body = {
            'parents': [parent],
            'name': file.name
        };
        // return new Promise(async (resolve, reject) => {
        //     drive.files.copy({ fileId: file.id, fields: 'id, name, mimeType, size', supportsAllDrives: true, requestBody: body }, async (err: any, res: any) => {
        //         if (err) {
        //             if (err.errors && err.errors.length > 0 && (err.errors[0].reason === 'userRateLimitExceeded' || err.errors[0].reason === 'dailyLimitExceeded') && constants.USE_SERVICE_ACCOUNT_FOR_CLONE) {
        //                 console.log('Got error: ', err.errors[0].reason, ' trying again..');
        //                 await copyFile(file, parent, await switchServiceAccount()).then((r: any) => resolve(r.data)).catch(reject);
        //             }
        //             reject(err);
        //         } else {
        //             resolve(res.data);
        //         }
        //     });
        // });

        return await driveService.files.copy({ fileId: file.id, fields: 'id, name, mimeType, size', supportsAllDrives: true, supportsTeamDrives: true, requestBody: body }).then((res: any) => res.data);
    } catch (err) {
        if (err.errors && err.errors.length > 0 && (err.errors[0].reason === 'userRateLimitExceeded' || err.errors[0].reason === 'dailyLimitExceeded') && constants.USE_SERVICE_ACCOUNT_FOR_CLONE && SERVICE_ACCOUNT_INDEX !== service_account_count - 1) {
            console.log('Got error: ', err.errors[0].reason, ' trying again..');
            await switchServiceAccount().catch(error => { throw new Error(error) });
            return await copyFile(file, parent);
        }
        throw new Error(err);
    }
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
            let id = await createFolder(drive, element.name, dir_id, element.mimeType).catch(error => console.error('Cannont create folder: ', error.message));
            folderSize += await copyFolder(element, id, drive);
        } else {
            await timeout(1000); // 1 sec
            await copyFile(element, dir_id).then(d => {
                folderSize += parseInt(element.size);
            }).catch(err => {
                console.error('Error copying file: ' + element.name + ' Error for: ' + err.message)
            });

        }
    }
    return folderSize;
}

async function switchServiceAccount() {
    if (SERVICE_ACCOUNT_INDEX === service_account_count - 1) SERVICE_ACCOUNT_INDEX = 0;

    SERVICE_ACCOUNT_INDEX++;
    console.log(`Switching to ${SERVICE_ACCOUNT_INDEX}.json service account`);
    await driveAuth.callAsync(true, SERVICE_ACCOUNT_INDEX).then(auth => driveService = google.drive({ version: 'v3', auth }));
}

export async function driveListFiles(searchQuery: string, drive: drive_v3.Drive) {
    const getList = (pagetoken: string) => {
        return new Promise((resolve, reject) => {
            const qs = {
                includeItemsFromAllDrives: true,
                supportsAllDrives: true,
                q: searchQuery,
                orderBy: 'folder,name,modifiedTime desc',
                fields:
                    'files(id,name,mimeType,size,modifiedTime,parents),nextPageToken',
                pageSize: 1000,
                pageToken: pagetoken
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

async function createFolder(drive: drive_v3.Drive, directory_name: string, parent: string, mime: string): Promise<any> {
    return await drive.files.create({
        fields: 'id',
        supportsAllDrives: true,
        requestBody: {
            mimeType: mime,
            name: directory_name,
            parents: [parent]
        }
    }).then(res => res.data.id);
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