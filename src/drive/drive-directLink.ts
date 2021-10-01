import constants = require("../.constants");
import driveAuth = require("./drive-auth");
import { drive_v3, google } from "googleapis";
import dlUtils = require("../download_tools/utils");
import { GaxiosResponse } from "googleapis-common";

// Use encodeURI for indexes like Bhadoo, which have urls ending with 0:/ and use encodeURIComponent for indexes like gdindex
const wrapUrl = (url: string): string => {
  if (url) {
    if (
      constants.INDEX_DOMAIN.match(/\d:$/) ||
      constants.INDEX_DOMAIN.match(/\d:\/$/)
    ) {
      console.log("using encodeURI");
      url = encodeURI(url);
    } else {
      console.log("using encodeURIComponent");
      url = encodeURIComponent(url);
    }
  }
  return url;
};

export async function getGDindexLink(
  fileId: string,
  isGetLink?: boolean
): Promise<any> {
  return new Promise(async (resolve, reject) => {
    if (fileId) {
      driveAuth.call((authErr, auth) => {
        if (authErr) {
          reject(authErr);
        }
        const drive = google.drive({ version: "v3", auth });

        drive.files.get(
          {
            fileId: fileId,
            fields: "id, name, parents, mimeType",
            supportsAllDrives: true,
          },
          async (err: Error, res: GaxiosResponse<drive_v3.Schema$File>) => {
            if (err) {
              console.log("Error in index link get file: ", err);
              reject(err.message);
            } else {
              if (res.data) {
                let url = "";
                if (
                  res.data.parents.length > 0 &&
                  res.data.parents[0] === constants.GDRIVE_PARENT_DIR_ID
                ) {
                  url =
                    dlUtils.checkTrailingSlash(constants.INDEX_DOMAIN) +
                    wrapUrl(res.data.name);
                } else {
                  url =
                    dlUtils.checkTrailingSlash(constants.INDEX_DOMAIN) +
                    wrapUrl(
                      (await getFilePathDrive(res.data.parents, drive)) +
                        res.data.name
                    );
                }
                if (
                  res.data.mimeType === "application/vnd.google-apps.folder"
                ) {
                  url += "/";
                }
                resolve(isGetLink ? { url: url, name: res.data.name } : url);
              } else {
                reject(
                  "🔥 Error: File not found: No metadata for the file returned."
                );
              }
            }
          }
        );
      });
    } else {
      reject("🔥 Error: Couldn't decode fileId from url");
    }
  });
}

async function getFilePathDrive(
  parents: any,
  drive: drive_v3.Drive
): Promise<string> {
  const getFileInfo = async (
    fileId: string
  ): Promise<GaxiosResponse<drive_v3.Schema$File>> => {
    return drive.files.get({
      fileId,
      fields: "id, name, parents",
      supportsAllDrives: true,
    });
  };
  let parent = parents;
  let tree = [];
  let path = "";
  if (parent) {
    do {
      const f = await getFileInfo(parent[0]);
      parent = f.data.parents;
      if (!parent || parent.length === 0) break;
      tree.push({ id: parent[0], name: f.data.name });
    } while (true);
  }
  tree.reverse();
  for (const folder of tree) {
    path += folder.name + "/";
  }
  return path;
}
