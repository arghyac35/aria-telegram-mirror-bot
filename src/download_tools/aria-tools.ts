import downloadUtils = require('./utils');
import drive = require('../fs-walk');
import driveDirectLink = require('../drive/drive-directLink');
const Aria2 = require('aria2');
import constants = require('../.constants');
import tar = require('../drive/tar');
import filenameUtils = require('./filename-utils');
import { DlVars } from '../dl_model/detail';
import unzip = require('../drive/extract');
const chmodr = require('chmodr');
import checkDiskSpace from 'check-disk-space';

const supportedArchive = ['zip', 'tar', 'gz', 'bz2', 'tgz', 'tbz2', 'rar'];

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
  aria2.call('tellStatus', dlDetails.gid, ['status', 'totalLength', 'completedLength', 'downloadSpeed', 'files', 'numSeeders', 'connections']).then((res: any) => {
    if (res.status === 'active') {
      var statusMessage = downloadUtils.generateStatusMessage(parseFloat(res.totalLength),
        parseFloat(res.completedLength), parseFloat(res.downloadSpeed), res.files, res.numSeeders, res.connections, dlDetails);
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
        dlDetails.uploadedBytes, downloadSpeed, res.files, '', '', dlDetails);
      callback(null, statusMessage.message, statusMessage.filename, statusMessage.filesize);
    } else if (dlDetails.isExtracting) {
      let message = `<b>Extracting</b>: <code>${dlDetails.extractedFileName}</code>\n<b>Size</b>: <code>${dlDetails.extractedFileSize}</code>`;
      callback(null, message, dlDetails.extractedFileName, dlDetails.extractedFileSize);
    } else {
      var filePath = filenameUtils.findAriaFilePath(res['files']);
      var filename = filenameUtils.getFileNameFromPath(filePath.path, filePath.inputPath, filePath.downloadUri);
      var message;
      if (res.status === 'waiting') {
        message = `<i>${filename}</i> - Queued`;
      } else {
        message = `<i>${filename}</i> - ${res.status}`;
      }
      message += `\n<b>GID</b>: <code>${dlDetails.gid}</code>`;
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
 * * @param {number} isUnzip Is the file to be upload was unzipped
 * @param {function} callback The function to call with the link to the uploaded file
 */
export function uploadFile(dlDetails: DlVars, filePath: string, fileSize: number, isUnzip: boolean, callback: DriveUploadCompleteCallback): void {
  dlDetails.isUploading = true;
  var fileName = '';
  var realFilePath = '';
  if (isUnzip) {
    fileName = dlDetails.extractedFileName;
    realFilePath = filePath;
  } else {
    fileName = filenameUtils.getFileNameFromPath(filePath, null);
    realFilePath = filenameUtils.getActualDownloadPath(filePath);
  }
  if (dlDetails.isTar) {
    if (filePath === realFilePath) {
      // If there is only one file, do not archive
      driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
    } else {
      checkDiskSpace(constants.ARIA_DOWNLOAD_LOCATION_ROOT).then(res => {
        if (res.free > Number(fileSize)) {
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
      }).catch(err => {
        console.log('uploadFile: checkDiskSpace: ' + err);
        // Could not archive, so upload normally
        driveUploadFile(dlDetails, realFilePath, fileName, fileSize, callback);
      });
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
      if (fileId && constants.INDEX_DOMAIN) {
        await driveDirectLink.getGDindexLink(fileId).then((gdIndexLink: string) => {
          callback(err, dlDetails.gid, url, filePath, fileName, fileSize, isFolder, gdIndexLink);
        }).catch((dlErr: string) => {
          console.log('getGDindexLink error: ', dlErr);
          callback(dlErr, dlDetails.gid, url, filePath, fileName, fileSize, isFolder);
        });
      } else {
        callback(err, dlDetails.gid, url, filePath, fileName, fileSize, isFolder);
      }
    });
}

export function stopDownload(gid: string, callback: () => void): void {
  aria2.call('remove', gid).then(callback).catch(console.error);
}

export function addUri(uri: string, dlDir: string, filename: string, callback: (err: any, gid: string) => void): void {
  const options: any = { dir: `${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}` };
  if (filename) {
    options.out = filename
  }
  aria2.call('addUri', [uri], options)
    .then((gid: string) => {
      callback(null, gid);
    })
    .catch((err: any) => {
      callback(err, null);
    });
}

export async function extractFile(dlDetails: DlVars, filePath: string, fileSize: number) {
  try {
    dlDetails.isExtracting = true;
    const fileName = filenameUtils.getFileNameFromPath(filePath, null);
    const realFilePath = filenameUtils.getActualDownloadPath(filePath);

    const period = fileName.lastIndexOf('.');
    const fileExtension = fileName.substring(period + 1);
    let fileNameWithoutExt = fileName.substring(0, period);
    console.log('fileExtension: ', fileExtension);

    // check if it is a supported archive
    if (supportedArchive.includes(fileExtension)) {
      const diskspace = await checkDiskSpace(constants.ARIA_DOWNLOAD_LOCATION_ROOT).catch(error => {
        console.log('extract: checkDiskSpace: ', error.message);
        throw new Error('Error checkDiskSpace: ' + error.message);
      });
      if (diskspace.free > Number(fileSize)) {
        console.log('Starting unzipping');
        return new Promise<{ filePath: string, filename: string, size: number }>((resolve, reject) => {
          dlDetails.extractedFileName = fileNameWithoutExt;
          dlDetails.extractedFileSize = downloadUtils.formatSize(fileSize);
          unzip.extract(realFilePath, fileNameWithoutExt, fileExtension, dlDetails.unzipPassword, (unziperr: string, size: number, rfp: string) => {
            if (unziperr && !rfp) {
              reject(new Error(unziperr));
            } else {
              console.log('Unzip complete');
              dlDetails.isExtracting = false;
              chmodr(rfp, 0o777, (err: any) => {
                if (err) {
                  console.log('Failed to execute chmod', err);
                } else {
                  console.log('Chmod Success');
                }
                if (size) {
                  dlDetails.extractedFileSize = downloadUtils.formatSize(size);
                }
                resolve({ filePath: rfp, filename: fileNameWithoutExt, size });
              });
            }
          });
        });
      } else {
        console.error('extract: Not enough space, for extracting');
        throw new Error('Not enough disk space is there to extract.');
      }
    } else {
      console.log('Extension is not supported for unzipping');
      throw new Error('Extension is not supported for unzipping\nSupported extensions are: ' + supportedArchive.toString());
    }
  } catch (error) {
    throw new Error(error);
  }
}
