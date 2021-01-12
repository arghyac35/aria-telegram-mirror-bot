import constants = require('../.constants');
import driveAuth = require('./drive-auth');
import { google, drive_v3 } from 'googleapis';
import gdrive = require('./drive-upload');
import TelegramBot = require('node-telegram-bot-api');
import msgTools = require('../bot_utils/msg-tools');
import http = require('http');
import dlUtils = require('../download_tools/utils');

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
                                msg += `\n\n<a href="` + dlUtils.checkTrailingSlash(constants.INDEX_DOMAIN) + encodeURIComponent(meta.data.name) + `/">Index URL</a>`
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
                    await copyFile(meta.data, constants.GDRIVE_PARENT_DIR_ID, drive).then((res: any) => {
                        let msg: string;
                        message += `\n\nYo boi copy is done getting shareable link...`;
                        msgTools.editMessage(bot, cloneMsg, message);
                        gdrive.getSharableLink(res.data.id, false, (err, url) => {
                            if (err) {
                                reject(err);
                            }
                            msg = `<a href="` + url + `">` + res.data.name + `</a> (` + dlUtils.formatSize(res.data.size) + `)`;
                            if (constants.INDEX_DOMAIN) {
                                msg += `\n\n<a href="` + dlUtils.checkTrailingSlash(constants.INDEX_DOMAIN) + encodeURIComponent(res.data.name) + `">Index URL</a>`
                            }
                            res.data.url = url;
                            notifyExternal(true, cloneMsg.chat.id, res.data);
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

async function copyFile(file: any, parent: string, drive: drive_v3.Drive): Promise<any> {
    try {
        console.log('Copying file: ', file.name);
        let body = {
            'parents': [parent],
            'name': file.name
        };
        return await drive.files.copy({ fileId: file.id, fields: 'id, name, mimeType, size', supportsAllDrives: true, supportsTeamDrives: true, requestBody: body }).then((res: any) => ({ data: res.data, drive }));
    } catch (err) {
        if (err.errors && err.errors.length > 0 && (err.errors[0].reason === 'userRateLimitExceeded' || err.errors[0].reason === 'dailyLimitExceeded') && constants.USE_SERVICE_ACCOUNT && driveAuth.SERVICE_ACCOUNT_INDEX !== driveAuth.service_account_count - 2) {
            console.log('Got error: ', err.errors[0].reason, ' trying again..');
            driveAuth.switchServiceAccount();
            const auth = await driveAuth.callAsync().catch(error => { throw new Error(error); });
            const newdrive = google.drive({ version: 'v3', auth });
            return await copyFile(file, parent, newdrive);
        }
        if (driveAuth.SERVICE_ACCOUNT_INDEX === driveAuth.service_account_count - 1) {
            driveAuth.SERVICE_ACCOUNT_INDEX = 0;
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
            await copyFile(element, dir_id, drive).then(d => {
                folderSize += parseInt(element.size);
                drive = d.drive;
            }).catch(err => {
                console.error('Error copying file: ' + element.name + ' Error for: ' + err.message)
            });

        }
    }
    return folderSize;
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