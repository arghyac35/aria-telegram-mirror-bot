import downloadUtils = require('./utils');
import drive = require('../fs-walk');
import driveDirectLink = require('../drive/drive-directLink');
const Aria2 = require('aria2');
import constants = require('../.constants');
import tar = require('../drive/tar');
const diskspace = require('diskspace');
import filenameUtils = require('./filename-utils');
import { DlVars } from '../dl_model/detail';
import unzip = require('../drive/extract');

const ariaOptions = {
  host: 'localhost',
  port: constants.ARIA_PORT ? constants.ARIA_PORT : 8210,
  secure: false,
  secret: constants.ARIA_SECRET,
  path: '/jsonrpc'
};
const aria2 = new Aria2(ariaOptions);

export function openWebsocket(callback: (err: string) => void): void {
  aria2.open()
    .then(() => {
      callback(null);
    })
    .catch((err: string) => {
      callback(err);
    });
}

export function setOnDownloadStart(callback: (gid: string, retry: number) => void): void {
  aria2.on("onDownloadStart", ([keys]: any) => {
    callback(keys.gid, 1);
  });
}

export function setOnDownloadStop(callback: (gid: string, retry: number) => void): void {
  aria2.on("onDownloadStop", ([keys]: any) => {
    callback(keys.gid, 1);
  });
}

export function setOnDownloadComplete(callback: (gid: string, retry: number) => void): void {
  aria2.on("onDownloadComplete", ([keys]: any) => {
    callback(keys.gid, 1);
  });
}

export function setOnDownloadError(callback: (gid: string, retry: number) => void): void {
  aria2.on("onDownloadError", ([keys]: any) => {
    callback(keys.gid, 1);
  });
}

export function getAriaFilePath(gid: string, callback: (err: string, file: string) => void): void {
  aria2.call('getFiles', gid).then((files: any[]) => {
    var filePath = filenameUtils.findAriaFilePath(files);
    if (filePath) {
      callback(null, filePath.path);
    } else {
      callback(null, null);
    }
  }).catch((err: any) => {
    callback(err.message, null);
  });
}

/**
 * Get a human-readable message about the status of the given download. Uses
 * HTML markup. Filename and filesize is always present if the download exists,
 * message is only present if the download is active.
 * @param {string} gid The Aria2 GID of the download
 * @param {function} callback The function to call on completion. (err, message, filename, filesize).
 */
export function getStatus(dlDetails: DlVars,
  callback: (err: string, message: string, filename: string, filesizeStr: string) => void): void {
  aria2.call('tellStatus', dlDetails.gid, ['status', 'totalLength', 'completedLength', 'downloadSpeed', 'files']).then((res: any) => {
    if (res.status === 'active') {
      var statusMessage = downloadUtils.generateStatusMessage(parseFloat(res.totalLength),
        parseFloat(res.completedLength), parseFloat(res.downloadSpeed), res.files, false);
      callback(null, statusMessage.message, statusMessage.filename, statusMessage.filesize);
    } else if (dlDetails.isUploading) {
      var downloadSpeed: number;
      var time = new Date().getTime();
      if (!dlDetails.lastUploadCheckTimestamp) {
        downloadSpeed = 0;
      } else {
        downloadSpeed = (dlDetails.uploadedBytes - dlDetails.uploadedBytesLast)
          / ((time - dlDetails.lastUploadCheckTimestamp) / 1000);
      }
      dlDetails.uploadedBytesLast = dlDetails.uploadedBytes;
      dlDetails.lastUploadCheckTimestamp = time;

      var statusMessage = downloadUtils.generateStatusMessage(parseFloat(res.totalLength),
        dlDetails.uploadedBytes, downloadSpeed, res.files, true);
      callback(null, statusMessage.message, statusMessage.filename, statusMessage.filesize);
    } else {
      var filePath = filenameUtils.findAriaFilePath(res['files']);
      var filename = filenameUtils.getFileNameFromPath(filePath.path, filePath.inputPath, filePath.downloadUri);
      var message;
      if (res.status === 'waiting') {
        message = `<i>${filename}</i> - Queued`;
      } else {
        message = `<i>${filename}</i> - ${res.status}`;
      }
      callback(null, message, filename, '0B');
    }
  }).catch((err: any) => {
    callback(err.message, null, null, null);
  });
}

export function getError(gid: string, callback: (err: string, message: string) => void): void {
  aria2.call('tellStatus', gid, ['errorMessage']).then((res: any) => {
    callback(null, res.errorMessage);
  }).catch((err: any) => {
    callback(err.message, null);
  });
}

export function isDownloadMetadata(gid: string, callback: (err: string, isMetadata: boolean, newGid: string) => void): void {
  aria2.call('tellStatus', gid, ['followedBy']).then((res: any) => {
    if (res.followedBy) {
      callback(null, true, res.followedBy[0]);
    } else {
      callback(null, false, null);
    }
  }).catch((err: any) => {
    callback(err.message, null, null);
  });
}

export function getFileSize(gid: string, callback: (err: string, fileSize: number) => void): void {
  aria2.call('tellStatus', gid,
    ['totalLength']).then(
      (res: any) => {
        callback(null, res['totalLength']);
      }).catch((err: any) => {
        callback(err.message, 0);
      });
}

interface DriveUploadCompleteCallback {
  (err: string, gid: string, url: string, filePath: string, fileName: string, fileSize: number, isFolder: boolean, getLink?: string): void;
}

/**
 * Sets the upload flag, uploads the given path to Google Drive, then calls the callback,
 * cleans up the download directory, and unsets the download and upload flags.
 * If a directory  is given, and isTar is set in vars, archives the directory to a tar
 * before uploading. Archival fails if fileSize is equal to or more than the free space on disk.
 * @param {dlVars.DlVars} dlDetails The dlownload details for the current download
 * @param {string} filePath The path of the file or directory to upload
 * @param {number} fileSize The size of the file
 * @param {function} callback The function to call with the link to the uploaded file
 */
export function uploadFile(dlDetails: DlVars, filePath: string, fileSize: number, callback: DriveUploadCompleteCallback): void {
  const supportedArchive = ['zip', 'tar', 'gz', 'bz2', 'tgz', 'tbz2'];

  dlDetails.isUploading = true;
  var fileName = filenameUtils.getFileNameFromPath(filePath, null);
  var realFilePath = filenameUtils.getActualDownloadPath(filePath);
  if (dlDetails.isTar) {
    if (filePath === realFilePath) {
      // If there is only one file, do not archive
      driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
    } else {
      diskspace.check(constants.ARIA_DOWNLOAD_LOCATION_ROOT, (err: string, res: any) => {
        if (err) {
          console.log('uploadFile: diskspace: ' + err);
          // Could not archive, so upload normally
          driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
          return;
        }
        if (Number(res['free']) > Number(fileSize)) {
          console.log('Starting archival');
          var destName = fileName + '.tar';
          tar.archive(realFilePath, destName, (tarerr: string, size: number) => {
            if (tarerr) {
              callback(tarerr, dlDetails.gid, null, null, null, null, false);
            } else {
              console.log('Archive complete');
              driveUploadFile(dlDetails, realFilePath + '.tar', destName, size, callback);
            }
          });
        } else {
          console.log('uploadFile: Not enough space, uploading without archiving');
          driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
        }
      });
    }
  } else if (dlDetails.isUnzip) {
    var period = fileName.lastIndexOf('.');
    var fileExtension = fileName.substring(period + 1);
    let realFileNameWithoutExt = fileName.substring(0, period);
    console.log('fileExtension: ', fileExtension);
    // check if it is a supported archive
    if (supportedArchive.includes(fileExtension)) {
      diskspace.check(constants.ARIA_DOWNLOAD_LOCATION_ROOT, (err: string, res: any) => {
        if (err) {
          console.log('uploadFile: diskspace: ' + err);
          // Could not unzip, so upload normally
          driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
          return;
        }
        if (Number(res['free']) > Number(fileSize)) {
          console.log('Starting unzipping');
          unzip.extract(realFilePath, realFileNameWithoutExt, fileExtension, (unziperr: string, size: number, rfp: string) => {
            if (unziperr && !rfp) {
              callback(unziperr, dlDetails.gid, null, null, null, null, false);
            } else {
              console.log('Unzip complete');
              driveUploadFile(dlDetails, rfp, realFileNameWithoutExt, size, callback);
            }
          });
        } else {
          console.log('uploadFile: Not enough space, uploading without archiving');
          driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
        }
      });
    } else {
      console.log('Extension is not supported for unzipping, uploading without archive');
      driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
    }
  } else {
    driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
  }
}

function driveUploadFile(dlDetails: DlVars, filePath: string, fileName: string, fileSize: number, callback: DriveUploadCompleteCallback): void {
  drive.uploadRecursive(dlDetails,
    filePath,
    constants.GDRIVE_PARENT_DIR_ID,
    async (err: string, url: string, isFolder: boolean, fileId: string) => {
      if (constants.INDEX_DOMAIN) {
        await driveDirectLink.getGDindexLink(fileId).then((gdIndexLink: string) => {
          callback(err, dlDetails.gid, url, filePath, fileName, fileSize, isFolder, gdIndexLink);
        }).catch((dlErr: string) => {
          callback(dlErr, dlDetails.gid, url, filePath, fileName, fileSize, isFolder);
        });
      } else {
        callback(err, dlDetails.gid, url, filePath, fileName, fileSize, isFolder);
      }
    });
}

export function stopDownload(gid: string, callback: () => void): void {
  aria2.call('remove', gid).then(callback);
}

export function addUri(uri: string, dlDir: string, callback: (err: any, gid: string) => void): void {
  aria2.call('addUri', [uri], { dir: `${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}` })
    .then((gid: string) => {
      callback(null, gid);
    })
    .catch((err: any) => {
      callback(err, null);
    });
}
