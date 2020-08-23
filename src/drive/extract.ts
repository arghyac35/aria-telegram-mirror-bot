const inly = require('inly');
import fs = require('fs');
import path = require('path');
import async = require('async');

export function extract(srcPath: string, fileName: string, callback: (err: string, size: number, realFilePath: string) => void): void {
    var dlDirPath = srcPath.substring(0, srcPath.lastIndexOf('/'));

    const extractProcess = inly(srcPath, dlDirPath);

    extractProcess.on('progress', (percent: string) => {
        console.log(percent + '%');
    });

    extractProcess.on('error', (error: any) => {
        console.error(error);
        callback(error, null, null);
    });

    extractProcess.on('end', () => {
        readSizeRecursive(dlDirPath + '/' + fileName, (err, size) => {
            if (err) {
                console.log('Couldn\'t determine file size: ', err.message);
                callback(err.message, null, dlDirPath + '/' + fileName);
            } else {
                callback(null, size, dlDirPath + '/' + fileName);
            }
        });
    });


}


function readSizeRecursive(item: string, cb: (err: Error, size: number) => void) {
    fs.lstat(item, function (err, stats) {
        if (!err && stats.isDirectory()) {
            var total = stats.size;

            fs.readdir(item, function (err, list) {
                if (err) return cb(err, null);

                async.forEach(
                    list,
                    function (diritem, callback) {
                        readSizeRecursive(path.join(item, diritem), function (err1, size) {
                            total += size;
                            callback(err1);
                        });
                    },
                    function (err) {
                        cb(err, total);
                    }
                );
            });
        }
        else {
            cb(err, null);
        }
    });
}

