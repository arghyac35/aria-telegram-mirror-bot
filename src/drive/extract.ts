const inly = require('inly');
import fs = require('fs');
import getSize from 'get-folder-size';
import { createExtractorFromFile } from 'node-unrar-js';
import extractZip from 'extract-zip';

export function extract(srcPath: string, fileName: string, ext: string, callback: (err: string, size: number, realFilePath: string) => void): void {
    var dlDirPath = srcPath.substring(0, srcPath.lastIndexOf('.'));

    if (!fs.existsSync(dlDirPath)) {
        fs.mkdirSync(dlDirPath, { recursive: true });
    }

    switch (ext) {
        case 'zip':
            extractZip(srcPath, { dir: dlDirPath }).then(() => {
                getSize(dlDirPath, (err, size) => {
                    if (fs.existsSync(dlDirPath + '/' + fileName)) {
                        dlDirPath = dlDirPath + '/' + fileName;
                    }
                    if (err) {
                        console.log('Couldn\'t determine file size: ', err.message);
                        callback(err.message, null, dlDirPath);
                    } else {
                        callback(null, size, dlDirPath);
                    }
                });
            }).catch(err => callback(err, null, null));
            break;
        case 'rar':
            // Read the archive file
            const extractor = createExtractorFromFile(srcPath, dlDirPath);
            const extracted = extractor.extractAll();

            if (extracted[0].state === 'SUCCESS') {
                getSize(dlDirPath, (err, size) => {
                    if (fs.existsSync(dlDirPath + '/' + fileName)) {
                        dlDirPath = dlDirPath + '/' + fileName;
                    }
                    if (err) {
                        console.log('Couldn\'t determine file size: ', err.message);
                        callback(err.message, null, dlDirPath);
                    } else {
                        callback(null, size, dlDirPath);
                    }
                });
            } else {
                console.error('Extracting rar failed: ', extracted[0].reason);
                callback(extracted[0].msg, null, null);
            }
            break;
        default:
            const extractProcess = inly(srcPath, dlDirPath);

            extractProcess.on('file', (name: any) => {
                console.log(name);
            });

            extractProcess.on('progress', (percent: string) => {
                console.log(percent + '%');
            });

            extractProcess.on('error', (error: any) => {
                console.error(error);
                callback(error, null, null);
            });

            extractProcess.on('end', () => {
                getSize(dlDirPath, (err, size) => {
                    if (fs.existsSync(dlDirPath + '/' + fileName)) {
                        dlDirPath = dlDirPath + '/' + fileName;
                    }
                    if (err) {
                        console.log('Couldn\'t determine file size: ', err.message);
                        callback(err.message, null, dlDirPath);
                    } else {
                        callback(null, size, dlDirPath);
                    }
                });
            });
            break;
    }
}

