import constants = require('../.constants');
import driveAuth = require('./drive-auth');
import { drive_v3, google } from 'googleapis';
import utils = require('./drive-utils');
import dlUtils = require('../download_tools/utils');
const INDEX_DOMAIN = dlUtils.checkTrailingSlash(constants.INDEX_DOMAIN);

/**
 * Searches for a given file on Google Drive. Only search the subfolders and files
 * of the folder that files are uploaded into. This function only performs performs
 * prefix matching, though it tries some common variations.
 * @param {string} fileName The name of the file to search for
 * @param {function} callback A function to call with an error, or a human-readable message
 */
export function listFiles(fileName: string, callback: (err: string, message: string | any[]) => void): void {
  // Uncommenting the below line will prevent users from asking to list all files
  // if (fileName === '' || fileName ==='*' || fileName === '%') return;
  let parent_dir_id: string | string[];
  parent_dir_id = constants.GDRIVE_PARENT_DIR_ID;
  if (fileName !== '*' && constants.OTHER_GDRIVE_DIR_IDS.length > 0) {
    constants.OTHER_GDRIVE_DIR_IDS.push(constants.GDRIVE_PARENT_DIR_ID);
    parent_dir_id = constants.OTHER_GDRIVE_DIR_IDS;
  }
  driveAuth.call(async (err, auth) => {
    if (err) {
      callback(err, null);
      return;
    }
    const drive = google.drive({ version: 'v3', auth });
    const searchQuery = generateSearchQuery(fileName, parent_dir_id);

    try {
      if (constants.TELEGRAPH_TOKEN) {
        const files = await driveListFiles(drive, searchQuery, 100);
        getMultipleFileLinks(files);
        callback(null, generateTelegraphContent(files, fileName));
      } else {
        const files = await driveListFiles(drive, searchQuery);
        getMultipleFileLinks(files);
        callback(null, generateFilesListMessage(files, fileName));
      }
    } catch (error) {
      callback(error.message, null);
    }
  });
}

async function driveListFiles(drive: drive_v3.Drive, searchQuery: string, pageSize?: number): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    const qs = {
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      q: searchQuery,
      orderBy: 'modifiedTime desc',
      fields: 'files(id, name, mimeType, size)',
      pageSize: pageSize || 20
    }
    drive.files.list(
      qs
      , function (err: Error, res: any) {
        if (err) {
          reject(err);
        }
        if (!res || !res.data || !res.data.files) {
          return reject('No data found');
        }
        resolve(res.data.files);
      });
  });
}

function generateSearchQuery(fileName: string, parent: string | string[]): string {
  if (Array.isArray(parent)) {
    var q: string;
    q = '(';
    parent.forEach((element, key) => {
      if (parent.length === key + 1) {
        q += '\'' + element + '\' in parents)';
      } else {
        q += '\'' + element + '\' in parents or ';
      }
    });
    q += ' and (';
  } else {
    var q = '\'' + parent + '\' in parents and (';
  }
  if (fileName.indexOf(' ') > -1) {
    for (var i = 0; i < 4; i++) {
      q += 'name contains \'' + fileName + '\' ';
      switch (i) {
        case 0:
          fileName = fileName.replace(/ /g, '.');
          q += 'or ';
          break;
        case 1:
          fileName = fileName.replace(/\./g, '-');
          q += 'or ';
          break;
        case 2:
          fileName = fileName.replace(/-/g, '_');
          q += 'or ';
          break;
      }
    }
  } else {
    q += 'name contains \'' + fileName + '\'';
  }
  q += ') and trashed = false';
  return q;
}

function getMultipleFileLinks(files: any[]): void {
  for (var i = 0; i < files.length; i++) {
    files[i]['url'] = utils.getFileLink(
      files[i]['id'],
      files[i]['mimeType'] === 'application/vnd.google-apps.folder'
    );
  }
}

function generateFilesListMessage(files: any[], fileName: string): string {
  var message = '';
  if (files.length > 0) {
    for (var i = 0; i < files.length; i++) {
      message += '<a href = \'' + files[i]['url'] + '\'>' + files[i]['name'] + '</a>';
      if (files[i]['size']) {
        message += ' (' + dlUtils.formatSize(files[i]['size']) + ')';
        //uncomment the below filename === '*' if u want gdindex link ony in 'list *'
        if (/*fileName === '*'  && */ constants.INDEX_DOMAIN) {
          message += ` | <a href="` + INDEX_DOMAIN + encodeURIComponent(files[i]['name']) + `">Index URL</a>`;
        }
        message += '\n';
      } else if (files[i]['mimeType'] === 'application/vnd.google-apps.folder') {
        message += ' (folder)';
        //uncomment the below filename === '*' if u want gdindex link ony in 'list *'
        if (/* fileName === '*' && */ constants.INDEX_DOMAIN) {
          message += ` | <a href="` + INDEX_DOMAIN + encodeURIComponent(files[i]['name']) + `/">Index URL</a>`;
        }
        message += '\n';
      } else {
        message += '\n';
      }

    }
  } else {
    message = 'There are no files matching your parameters';
  }

  return message;
}

function generateTelegraphContent(files: any[], fileName: string): any[] {
  if (files.length === 0) {
    return [];
  }
  const telegraphContent: any[] = [];
  telegraphContent.push({
    "tag": "h4",
    "children": [
      `Search results for: ${fileName}`
    ]
  });
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (index !== 0) {
      telegraphContent.push(
        {
          "tag": "br"
        },
        {
          "tag": "br"
        });
    }
    telegraphContent.push("⁍",
      {
        "tag": "code",
        "children": [
          file.name,
          {
            "tag": "br"
          },
          file.mimeType === 'application/vnd.google-apps.folder' ? "(folder📁)" : `(${dlUtils.formatSize(file.size)})📄`
        ]
      },
      {
        "tag": "br"
      },
      {
        "tag": "strong",
        "children": [
          {
            "tag": "a",
            "attrs": {
              "href": file.url,
              "target": "_blank"
            },
            "children": [
              "Drive Link"
            ]
          }
        ]
      });
    if (constants.INDEX_DOMAIN) {
      telegraphContent.push(" ",
        {
          "tag": "strong",
          "children": [
            "| ",
            {
              "tag": "a",
              "attrs": {
                "href": file.mimeType === 'application/vnd.google-apps.folder' ? INDEX_DOMAIN + encodeURIComponent(file.name) + '/' : INDEX_DOMAIN + encodeURIComponent(file.name),
                "target": "_blank"
              },
              "children": [
                "Index Link"
              ]
            }
          ]
        });
    }

  }

  return telegraphContent;
}
