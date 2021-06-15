import driveAuth = require('./drive-auth');
import driveFile = require('./upload-file');
import utils = require('./drive-utils');
import { google, drive_v3 } from 'googleapis';
import constants = require('../.constants');
import { GaxiosResponse } from 'gaxios';
import { DlVars } from '../dl_model/detail';


export function uploadFileOrFolder(dlDetails: DlVars, filePath: string, mime: string, parent: string, size: number, callback: (err: string, id: string) => void): void {
  driveAuth.call((err, auth) => {
    if (err) {
      callback(err, null);
      return;
    }
    const drive = google.drive({ version: 'v3', auth });

    if (mime === 'application/vnd.google-apps.folder' || size === 0) {
      createFolderOrEmpty(drive, filePath, parent, mime, callback);
    } else {
      driveFile.uploadGoogleDriveFile(dlDetails, parent, {
        filePath: filePath,
        mimeType: mime
      })
        .then(id => callback(null, id))
        .catch(err => callback(err.message, null));
    }
  });
}

function createFolderOrEmpty(drive: drive_v3.Drive, filePath: string, parent: string, mime: string,
  callback: (err: string, id: string) => void): void {
  drive.files.create({
    // @ts-ignore Unknown property error
    fields: 'id',
    supportsAllDrives: true,
    requestBody: {
      mimeType: mime,
      name: filePath.substring(filePath.lastIndexOf('/') + 1),
      parents: [parent]
    }
  },
    (err: Error, res: any) => {
      if (err) {
        callback(err.message, null);
      } else {
        callback(null, res.data.id);
      }
    });
}

export function getSharableLink(fileId: string, isFolder: boolean,
  callback: (err: string, url: string, isFolder: boolean, fileId: string) => void): void {

  if (!constants.IS_TEAM_DRIVE || (constants.IS_TEAM_DRIVE && !isFolder)) {
    driveAuth.call((err, auth) => {
      if (err) {
        callback(err, null, false, null);
        return;
      }
      const drive = google.drive({ version: 'v3', auth });
      console.log('Creating file permissions');
      createPermissions(drive, fileId)
        .then(() => {
          callback(null, utils.getFileLink(fileId, isFolder), isFolder, fileId);
        })
        .catch(err => {
          callback(err.message, null, false, null);
        });
    });
  } else {
    callback(null, utils.getFileLink(fileId, isFolder), isFolder, fileId);
  }
}

async function createPermissions(drive: drive_v3.Drive, fileId: string): Promise<any> {
  if (constants.DRIVE_FILE_PRIVATE && constants.DRIVE_FILE_PRIVATE.ENABLED) {
    var req: GaxiosResponse<drive_v3.Schema$Permission>[] = [];

    for (var email of constants.DRIVE_FILE_PRIVATE.EMAILS) {
      var perm = await drive.permissions.create({
        fileId: fileId,
        supportsAllDrives: true,
        requestBody: {
          role: 'reader',
          type: 'user',
          emailAddress: email
        }
      });
      req.push(perm);
    }
    return Promise.all(req);
  } else {
    // donot stop user if error occurs here, as the file is already uploaded to drive
    if (!constants.USE_SERVICE_ACCOUNT) {
      drive.permissions.create({
        fileId: fileId,
        supportsAllDrives: true,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      }).catch(error => {
        if (error.errors && error.errors.length > 0) {
          console.error('Error while creating permissions--->', error.errors);
          return;
        }
        console.error(error);
      });
    }
    return Promise.resolve();
  }
}
