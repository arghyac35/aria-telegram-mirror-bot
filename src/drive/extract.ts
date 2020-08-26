const inly = require('inly');
import fs = require('fs');
import getSize = require('get-folder-size');

export function extract(srcPath: string, fileName: string, callback: (err: string, size: number, realFilePath: string) => void): void {
    var dlDirPath = srcPath.substring(0, srcPath.lastIndexOf('.'));

    if (!fs.existsSync(dlDirPath)) {
        fs.mkdirSync(dlDirPath, { recursive: true });
    }

    const extractProcess = inly(srcPath, dlDirPath);

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

