const inly = require('inly');
import fs = require('fs');
import getSize from 'get-folder-size';
import extractZip from 'extract-zip';
import { unpackAll } from '../unpackAll/index';

export function extract(srcPath: string, fileName: string, ext: string, callback: (err: string, size: number, realFilePath: string) => void): void {
    var dlDirPath = srcPath.substring(0, srcPath.lastIndexOf('.'));

    if (!fs.existsSync(dlDirPath)) {
        fs.mkdirSync(dlDirPath, { recursive: true });
    }

    if (ext === 'zip') {
        extractZip(srcPath, { dir: dlDirPath, defaultFileMode: 0o777, defaultDirMode: 0o777 }).then(() => {
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
    } else if (ext === 'rar') {
        unpackAll(
            srcPath,
            {
                targetDir: dlDirPath
            },
            (error: any, files: any, text: any) => {
                if (error) callback(error, null, null);
                if (files) {
                    console.log('files', files);
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
                }
                if (text) console.log('text', text);
            });
    } else {
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
    }
}

