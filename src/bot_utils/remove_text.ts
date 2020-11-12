import TelegramBot from "node-telegram-bot-api";
import driveAuth = require('../drive/drive-auth');
import { google, drive_v3 } from 'googleapis';
import msgTools = require('../bot_utils/msg-tools');

const videoMimeTypes = ['video/mp4', 'video/x-matroska', 'video/x-msvideo'];

export async function removeText(fileId: string, txtToRemove: string, bot: TelegramBot, cloneMsg: TelegramBot.Message) {
    return new Promise(async (resolve, reject) => {
        driveAuth.call(async (err, auth) => {
            if (err) {
                reject(err);
            }
            let message = `Removing text from : <code>`;
            const drive = google.drive({ version: 'v3', auth });
            console.log(fileId);
            await drive.files.get({ fileId: fileId, fields: 'id, name, mimeType, size', supportsAllDrives: true }).then(async (meta) => {
                message += meta.data.name + `</code>`;
                msgTools.editMessage(bot, cloneMsg, message);
                // Check for folders
                if (meta.data.mimeType === 'application/vnd.google-apps.folder') {
                    console.log('called-->');
                    const filesInsideMainFolder = await driveListFiles(`'${meta.data.id}' in parents and trashed = false`, drive);

                    const filesToRename = filesInsideMainFolder.filter((p) => {
                        return videoMimeTypes.indexOf(p.mimeType) !== -1;
                    });

                    let count: number = filesToRename.length;
                    if (count > 0) {
                        await Promise.all(filesToRename.map(async (file) => {
                            return await remove(file, txtToRemove, drive);
                        })).then(d => resolve('Text removed')).catch(error => reject(error.message));
                    } else {
                        resolve('No files inside folder to be rnamed');
                    }
                } else {
                    await remove(meta.data, txtToRemove, drive).then(res => {
                        resolve('Text removed');
                    }).catch(error => reject(error.message));
                }
            }).catch((error: Error) => {
                reject(error.message + `\n\nEither it is not a Shareable Link or something went wrong while fetching files metadata`);
            });
        });
    });
}

async function remove(file: any, txtToRemove: string, drive: drive_v3.Drive) {
    const of = file.name;
    console.log('Original file name--->', of);

    var period = of.lastIndexOf('.');
    var fileExtension = of.substring(period + 1);
    let realFileNameWithoutExt = of.substring(0, period);

    file.name = realFileNameWithoutExt.replace(txtToRemove, '').trim() + '.' + fileExtension;
    if (of === file.name) {
        console.log('File name is same nothing to remove');
        return '';
    }
    console.log('Filename after removing txt: ', file.name);
    return drive.files.update({
        fileId: file.id, supportsAllDrives: true, supportsTeamDrives: true, requestBody: {
            name: file.name
        }
    });
}

async function driveListFiles(searchQuery: string, drive: drive_v3.Drive) {
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
        files.push(...resp['data']['files']);
        pageToken = resp['data']['nextPageToken'];
    } while (pageToken);
    return files;
}