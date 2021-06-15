'use strict';

import fs from 'fs';
import path from 'path';
import wget from 'wget-improved';
const getInstallCmd = require('system-install');
import child_process from 'child_process';
import { inlyExtract } from '../drive/extract'

const exec = child_process.exec;
const unrarAppfile = 'unrar_MacOSX_10.13.2_64bit.gz';
const unrarAppurl = 'https://www.rarlab.com/rar/';


const cwd = path.resolve('./');
const url = unrarAppurl + unrarAppfile;
const source = path.join(cwd, unrarAppfile);

function getExtractUnar(urlsource: string, filesource: string, destination: string) {
    console.log('Downloading ' + urlsource + ' ...');

    return new Promise(function (resolve, reject) {

        let download = wget.download(urlsource, filesource, {});
        download.on('error', reject);
        download.on('start', console.log);
        // download.on('progress', console.log);

        download.on('end', output => {
            console.info('download finsihed.');

            inlyExtract(filesource, destination, (err) => {
                if (err) {
                    console.log('Error while extracting-->', err);
                    return reject(err);
                }
                const period = unrarAppfile.lastIndexOf('.');
                let fileNameWithoutExt = unrarAppfile.substring(0, period);
                fs.rename(fileNameWithoutExt, 'unrar', () => {
                    resolve('');
                })
            })
        });
    });
}

export function postinstall() {
    if (process.platform === "darwin") {
        getExtractUnar(url, source, cwd)
            .then(function () {
                fs.unlink(source, (err) => {
                    if (err) console.error(err);
                });
                fs.chmodSync(path.join(cwd, 'unrar'), 755)
                console.info('Unrar installed successful');
            })
            .catch(console.error);

    } else if (process.platform === "linux") {
        const cmd = getInstallCmd('unrar');
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.log(err.message);
            } else {
                console.info('Unrar installed successful');
            }
        });
    } else {
        console.log('Rar is not supported in this environment');
    }
}

postinstall();