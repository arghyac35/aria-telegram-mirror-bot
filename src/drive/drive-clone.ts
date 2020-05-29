import constants = require('../.constants.js');
import driveAuth = require('./drive-auth.js');
import { google, drive_v3 } from 'googleapis';
import gdrive = require('./drive-upload');

export async function driveClone(fileId: string) {
    return new Promise(async (resolve, reject) => {
        driveAuth.call(async (err, auth) => {
            if (err) {
                reject(err);
            }
            const drive = google.drive({ version: 'v3', auth });
            await drive.files.get({ fileId: fileId, fields: 'id, name, mimeType, size', supportsAllDrives: true }).then(async (meta) => {
                // Check for folders
                if (meta.data.mimeType === 'application/vnd.google-apps.folder') {
                    // Create directory
                    createFolder(drive, meta.data.name, constants.GDRIVE_PARENT_DIR_ID, meta.data.mimeType, async (err, dir_id) => {
                        if (err) {
                            reject(err);
                        } else {
                            // copy dir
                            await copyFolder(meta.data, dir_id, drive);
                            let msg: string;
                            gdrive.getSharableLink(dir_id, true, (err, url) => {
                                if (err) {
                                    reject(err);
                                }
                                msg = `<a href="` + url + `">` + meta.data.name + `</a>`;
                                if (constants.INDEX_DOMAIN) {
                                    msg += `\n\n<a href="` + constants.INDEX_DOMAIN + `GdriveBot/` + encodeURIComponent(meta.data.name) + `/">Index URL</a>`
                                }
                                resolve(msg);
                            });
                        }
                    });
                } else {
                    //copy file
                    await copyFile(meta.data, constants.GDRIVE_PARENT_DIR_ID, drive).then((res: any) => {
                        let msg: string;
                        gdrive.getSharableLink(res.id, false, (err, url) => {
                            if (err) {
                                reject(err);
                            }
                            msg = `<a href="` + url + `">` + res.name + `</a> (` + getReadAbleFileSize(res.size) + `)`;
                            if (constants.INDEX_DOMAIN) {
                                msg += `\n\n<a href="` + constants.INDEX_DOMAIN + `GdriveBot/` + encodeURIComponent(res.name) + `">Index URL</a>`
                            }
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

async function copyFile(file: any, parent: string, drive: drive_v3.Drive) {
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

async function copyFolder(file: any, dir_id: string, drive: drive_v3.Drive) {
    let searchQuery = `'` + file.id + `' in parents`;
    let files = await driveListFiles(searchQuery, drive);
    for (let index = 0; index < files.length; index++) {
        const element = files[index];
        if (element.mimeType === 'application/vnd.google-apps.folder') {
            // recurse
            createFolder(drive, element.name, dir_id, element.mimeType, (err, id) => {
                copyFolder(element, id, drive);
            });
        } else {
            await copyFile(element, dir_id, drive);
        }
    }
}

async function driveListFiles(searchQuery: string, drive: drive_v3.Drive) {
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

function getReadAbleFileSize(size: number) {
    if (size == 0) return '0 Bytes';
    // tslint:disable-next-line: one-variable-per-declaration
    const k = 1000,
        dm = 2,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(size) / Math.log(k));

    return parseFloat((size / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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