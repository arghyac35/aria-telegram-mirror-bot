import request = require('request')
import jsdom = require("jsdom");
import constants = require('../.constants.js');
import driveAuth = require('./drive-auth.js');
import { google } from 'googleapis';

/**
 * TO BE WRITTEN LATER😁😁😁
 * TO BE WRITTEN LATER😁😁😁
 * TO BE WRITTEN LATER😁😁😁
 * @param {string} url The url of the file to get direct link for
 * @param {function} callback A function to call with an error, or a human-readable message
 */
export function getLink(url: string, getOnlyLink: boolean, callback: (err: string, message: string) => void): void {
    var matches = url.match(/\bhttps?:\/\/\S+/gi);

    var fileID = "";

    if (url.indexOf("view") !== -1) {
        fileID = matches[0].split("/")[5];
    } else if (url.indexOf("open?id=") !== -1) {
        fileID = matches[0].split("open?id=")[1].trim()
    } else if (url.indexOf("uc?id=") !== -1) {
        fileID = matches[0].split("uc?id=")[1].trim()
    }

    var cookieRequest = request.defaults({
        jar: true
    })

    var exportURL = "https://drive.google.com/uc?export=download&id=" + fileID;
    cookieRequest.get({
        url: exportURL,
        followRedirect: false
    },
        function (error, response, body) {
            var dom = new jsdom.JSDOM(body);
            var fileName_div = dom.window.document.querySelector(".uc-name-size a");
            if (response.headers.location) {
                if (response.headers.location.indexOf("accounts.google.com") !== -1) {
                    //Ignore non public links
                    callback('Non public link', null);
                }
                callback(null, getOnlyLink ? response.headers.location : 'Direct Link: <a href = \'' + response.headers.location + '\'>Click Here' + '</a>');
            } else if (fileName_div) {
                let fileName = fileName_div.textContent;
                let myContainer = <Element>dom.window.document.querySelector("#uc-download-link");
                var dlLink = "https://drive.google.com" + myContainer.getAttribute('href');
                console.log('2nd--->', fileName);
                console.log('dllink--->', dlLink);
                cookieRequest.get({
                    url: dlLink,
                    followRedirect: false
                },
                    function (error, response, body) {
                        if (response.headers.location && response.headers.location.indexOf("accounts.google.com") !== -1) {
                            // Non public link
                            callback('Non public link', null);
                        }
                        callback(null, getOnlyLink ? response.headers.location : 'Direct Link: <a href = \'' + response.headers.location + '\'>' + fileName + '</a>');
                    });
            } else {
                callback('Not a proper gdrive link', null);
            }
        });
}

export async function getGDindexLink(fileId: string, isUrl?: boolean) {
    if (isUrl) {
        let url = fileId.match(/[-\w]{25,}/);
        fileId = Array.isArray(url) && url.length > 0 ? url[0] : ''
    }
    return new Promise(async (resolve, reject) => {
        if (fileId) {
            driveAuth.call((err, auth) => {
                if (err) {
                    reject(err);
                }
                const drive = google.drive({ version: 'v3', auth });

                drive.files.get({ fileId: fileId, fields: 'id, name, parents, mimeType' },
                    async (err: Error, res: any) => {
                        if (err) {
                            reject(err.message);
                        } else {
                            let url = constants.INDEX_DOMAIN + encodeURIComponent(await getFilePathDrive(res['data']['parents'], drive) + res['data']['name'])
                            if (res['data']['mimeType'] === 'application/vnd.google-apps.folder') {
                                url += '/'
                            }
                            resolve(isUrl ? { url: url, name: res['data']['name'] } : url);
                        }
                    });
            });
        } else {
            reject('🔥 error: %o : File id not found');
        }
    });
}

async function getFilePathDrive(parents: any, drive: any) {
    let parent = parents;
    let tree = [];
    let path: string = '';
    if (parent) {
        do {
            const f = await drive.files.get({ fileId: parent[0], fields: 'id, name, parents' });
            parent = f.data.parents;
            if (!parent) break;
            tree.push({ 'id': parent[0], 'name': f.data.name })
        } while (true);
    }
    tree.reverse();
    for (const folder of tree) {
        if (folder.name !== 'Stuffs') {
            path += folder.name + '/';
        }
    }
    return path;
}
