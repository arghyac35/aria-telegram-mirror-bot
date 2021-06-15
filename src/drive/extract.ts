const inly = require('inly');
import fs = require('fs');
import getSize from 'get-folder-size';
import extractZip from 'extract-zip';
import { runUnrar } from '../unrarUtils/index';

export function extract(srcPath: string, fileName: string, ext: string, password: string, callback: (err: string, size: number, realFilePath: string) => void): void {
    var dlDirPath = srcPath.substring(0, srcPath.lastIndexOf('.'));

    if (!fs.existsSync(dlDirPath)) {
        fs.mkdirSync(dlDirPath, { recursive: true });
    }

    if (ext === 'zip') {
        extractZip(srcPath, { dir: dlDirPath, defaultFileMode: 0o777, defaultDirMode: 0o777 }).then(() => {
            getsizeofFolder(dlDirPath, fileName, callback)
        }).catch(err => callback(err, null, null));
    } else if (ext === 'rar') {
        runUnrar(
            srcPath,
            {
                targetDir: dlDirPath,
                password
            },
            (error: any, files: any, text: any) => {
                if (error) callback(error, null, null);
                if (files) {
                    console.log('files', files);
                    getsizeofFolder(dlDirPath, fileName, callback)
                }
                if (text) console.log('text', text);
            });
    } else {
        inlyExtract(srcPath, dlDirPath, (err) => {
            if (err) {
                return callback(err, null, null);
            }
            getsizeofFolder(dlDirPath, fileName, callback)
        })
    }
}

export function inlyExtract(srcPath: string, dlDirPath: string, callback: (err: any) => void) {
    const extractProcess = inly(srcPath, dlDirPath);

    extractProcess.on('file', (name: any) => {
        console.log(name);
    });

    extractProcess.on('progress', (percent: string) => {
        console.log(percent + '%');
    });

    extractProcess.on('error', (error: any) => {
        console.error(error);
        callback(error);
    });

    extractProcess.on('end', () => {
        callback(null);
    });
}

function getsizeofFolder(dlDirPath: string, fileName: string, callback: (err: string, size: number, realFilePath: string) => void) {
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

