/* Copyright 2020 Marc Kronberg

 This code is copied from https://github.com/krocon/node-unpack-all and modified by me. I hereby take no credit of the followong other than modifications. See https://github.com/krocon/node-unpack-all/blob/master/index.mjs for original author. */

'use strict';

import fs from 'fs';
import path from 'path';
import wget from 'wget-improved';
const unzip = require('unzipper');
const getInstallCmd = require('system-install');
import child_process from 'child_process';

const exec = child_process.exec;
const unarAppfile = (process.platform === "darwin") ? 'unarMac.zip' : 'unarWindows.zip';
const unarAppurl = 'https://cdn.theunarchiver.com/downloads/';

const cwd = path.resolve('./');
const url = unarAppurl + unarAppfile;
const source = path.join(cwd, unarAppfile);
const windows = (process.platform === "win32") || (process.platform === "darwin");

function getExtractUnar(urlsource: string, filesource: string, destination: string) {
    console.log('Downloading ' + urlsource + ' ...');

    return new Promise(function (resolve, reject) {

        let download = wget.download(urlsource, filesource, {});
        download.on('error', reject);
        download.on('start', console.log);
        // download.on('progress', console.log);

        download.on('end', output => {
            console.info('download finsihed.');

            const unzipfile = unzip.Extract({ path: destination });
            unzipfile.on('error', reject);
            unzipfile.on('close', resolve);
            fs.createReadStream(filesource).pipe(unzipfile);
        });
    });
}

export function postinstall() {
    if (windows) {
        getExtractUnar(url, source, cwd)
            .then(function () {
                fs.unlink(source, (err) => {
                    if (err) console.error(err);
                });
                if (process.platform !== "win32") {
                    const chmod = ['unar', 'lsar'];
                    chmod.forEach(s => {
                        fs.chmodSync(path.join(cwd, s), 755)
                    });
                }
                console.info('Unar installed successful');
            })
            .catch(console.error);

    } else {
        const cmd = getInstallCmd('unar');
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.log(err.message);
            } else {
                console.info('Unar installed successful');
            }
        });
    }
}

postinstall();