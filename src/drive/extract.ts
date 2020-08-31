const inly = require('inly');
import fs = require('fs');
import getSize = require('get-folder-size');
import AdmZip = require('adm-zip');
import * as yauzl from 'yauzl';
var path = require("path");

export function extract(srcPath: string, fileName: string, ext: string, callback: (err: string, size: number, realFilePath: string) => void): void {
    var dlDirPath = '/home/arghyac35/aria-telegram-mirror-bot/downloads/1d841ddf-78ee-4bb6-b412-ca2d06106b6d/Aashram (2020) S01 Complete 720p WEB-DL x264 Hindi DD2.0 3.40GB [www.MoviezAddiction.site]' /*srcPath.substring(0, srcPath.lastIndexOf('.'))*/;

    if (!fs.existsSync(dlDirPath)) {
        fs.mkdirSync(dlDirPath, { recursive: true });
    }

    switch (ext) {
        case 'zip':
            // let zip = new AdmZip('/home/arghyac35/aria-telegram-mirror-bot/downloads/1d841ddf-78ee-4bb6-b412-ca2d06106b6d/Aashram (2020) S01 Complete 720p WEB-DL x264 Hindi DD2.0 3.40GB [www.MoviezAddiction.site].zip');
            // zip.extractAllToAsync(dlDirPath, false, (err) => {
            //     if (err) {
            //         callback(err.message, null, null);
            //     } else {
            //         getSize(dlDirPath, (err, size) => {
            //             if (fs.existsSync(dlDirPath + '/' + fileName)) {
            //                 dlDirPath = dlDirPath + '/' + fileName;
            //             }
            //             if (err) {
            //                 console.log('Couldn\'t determine file size: ', err.message);
            //                 callback(err.message, null, dlDirPath);
            //             } else {
            //                 callback(null, size, dlDirPath);
            //             }
            //         });
            //     }
            // });


            yauzl.open('/home/arghyac35/aria-telegram-mirror-bot/downloads/1d841ddf-78ee-4bb6-b412-ca2d06106b6d/Aashram (2020) S01 Complete 720p WEB-DL x264 Hindi DD2.0 3.40GB [www.MoviezAddiction.site].zip', {lazyEntries: true}, function(err, zipfile) {
                if (err) throw err;
                zipfile.readEntry();
                zipfile.on("entry", function(entry) {
                  if (/\/$/.test(entry.fileName)) {
                    // Directory file names end with '/'.
                    // Note that entries for directories themselves are optional.
                    // An entry's fileName implicitly requires its parent directories to exist.
                    console.log('ajdkjasd: ',entry.fileName);
                    zipfile.readEntry();
                  } else {
                    // file entry
                    zipfile.openReadStream(entry, function(err, readStream) {
                      if (err) throw err;
                      readStream.on("end", function() {
                          console.log('called-->');
                        zipfile.readEntry();
                      });
                      console.log('file: ', entry.fileName);
                      if (!fs.existsSync(path.dirname('/home/arghyac35/aria-telegram-mirror-bot/downloads/1d841ddf-78ee-4bb6-b412-ca2d06106b6d/Aashram (2020) S01 Complete 720p WEB-DL x264 Hindi DD2.0 3.40GB [www.MoviezAddiction.site]/' + entry.fileName))) {
                        fs.mkdirSync(path.dirname('/home/arghyac35/aria-telegram-mirror-bot/downloads/1d841ddf-78ee-4bb6-b412-ca2d06106b6d/Aashram (2020) S01 Complete 720p WEB-DL x264 Hindi DD2.0 3.40GB [www.MoviezAddiction.site]/' + entry.fileName), { recursive: true });
                    }
                      var writeStream = fs.createWriteStream('/home/arghyac35/aria-telegram-mirror-bot/downloads/1d841ddf-78ee-4bb6-b412-ca2d06106b6d/Aashram (2020) S01 Complete 720p WEB-DL x264 Hindi DD2.0 3.40GB [www.MoviezAddiction.site]/' + entry.fileName);
                      readStream.pipe(writeStream);
                    });
                  }
                });
              });
            break;
        case 'tar':

            break;
        default:
            const extractProcess = inly('/home/arghyac35/aria-telegram-mirror-bot/downloads/1d841ddf-78ee-4bb6-b412-ca2d06106b6d/Aashram (2020) S01 Complete 720p WEB-DL x264 Hindi DD2.0 3.40GB [www.MoviezAddiction.site].zip', dlDirPath);

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

