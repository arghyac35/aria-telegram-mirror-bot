import log from 'npmlog';
import fs from 'fs';
import path from 'path';
import os from 'os';
import quote from 'shell-quote';
import child_process from 'child_process';

const exec = child_process.exec;
var projectRoot = path.resolve('./');

export function runUnrar(archiveFile: any, options: any, callback: any) {
    if (!archiveFile) archiveFile = options.archiveFile;
    if (!archiveFile) return log.error('unrar', "Error: archiveFile or options.archiveFile missing.");

    if (!callback) callback = defaultListCallback;
    if (!options) options = {};

    // Unrar command:
    let unrar = 'unrar';

    // use binary from project root if it exists
    try {
        if (fs.existsSync(`${projectRoot}/unrar`)) {
            unrar = `${projectRoot}/unrar`;
        }
    } catch (err) { }

    let ar = [unrar];

    // Extract files with full path
    ar.push('x');

    // Assume Yes on all queries
    ar.push('-y');

    // if options.password ? Set password : do not query password
    (options.password) ? ar.push('-p' + options.password) : ar.push('-p-');

    // Archive file (source):
    ar.push('SOURCEFILE');

    let targetDir = options.targetDir;
    if (!targetDir) targetDir = path.join(os.tmpdir(), 'tmp');
    console.log(targetDir);
    ar.push(targetDir + '/');


    let cmd = quote.quote(ar).replace('SOURCEFILE', escapeFileName(archiveFile));
    if (!options.quiet) log.info('cmd', cmd);

    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            console.error(err.message);
            if (err.message.indexOf('Corrupt file or wrong password') > -1) {
                err.message = 'RAR: Invalid password or the file is corrupted'
            }
            return callback(err.message, null)
        };
        if (stderr && stderr.length > 0) return callback('Error: ' + stderr, null);
        if (stdout && stdout.length > 0) {
            if (stdout.indexOf('No files to extract') > -1) return callback('Error: No files to extract', null);
        }
        callback(null, targetDir, 'All Ok');
    });

}

function defaultListCallback(err: any, files: any, text: any) {
    if (err) return log.error('defaultListCallback', err);

    if (files) log.info('files', files);
    if (text) log.info('text', text);
}

function escapeFileName(s: string) {
    return '"' + s + '"';
}