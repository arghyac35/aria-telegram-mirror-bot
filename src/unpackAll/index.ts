/* Copyright 2020 Marc Kronberg

 This code is copied from https://github.com/krocon/node-unpack-all and adapted to typescript, also kept only the code I needed removing other parts. I hereby take no credit of the followong other than modifications. See https://github.com/krocon/node-unpack-all/blob/master/index.mjs for original author. */

import log from 'npmlog';
import fs from 'fs';
import path from 'path';
import os from 'os';
import quote from 'shell-quote';
import child_process from 'child_process';

const exec = child_process.exec;
var isLinux = process.platform === "linux";
var projectRoot = path.resolve('./');

export function unpackAll(archiveFile: any, options: any, callback: any) {
    if (!archiveFile) archiveFile = options.archiveFile;
    if (!archiveFile) return log.error('unpack', "Error: archiveFile or options.archiveFile missing.");

    if (!callback) callback = defaultListCallback;
    if (!options) options = {};

    // Unrar command:
    let unrar = 'unrar';

    // use binary from project root if it exists
    try {
        if (fs.existsSync(`${projectRoot}/unrar`)) {
            unrar = `${projectRoot}/unrar`;
        }
    } catch(err) {}

    let ar = [unrar];

    // Extract files with full path
    ar.push('x');

    // Assume Yes on all queries
    ar.push('-y');

    // if options.password ? Set password : do not query password
    (options.password) ? ar.push('-p'+ options.password ) : ar.push('-p-');

    // Archive file (source):
    ar.push('SOURCEFILE');
    // ar.push(archiveFile);

    let targetDir = options.targetDir;
    if (!targetDir) targetDir = path.join(os.tmpdir(), 'tmp');
    console.log(targetDir);
    ar.push(targetDir + '/');


    let cmd = quote.quote(ar).replace('SOURCEFILE', escapeFileName(archiveFile));
    if (!options.quiet) log.info('cmd', cmd);

    exec(cmd, (err, stdout, stderr) => {
        if (err) return callback(err, null);
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

function isInt(x: any) {
    return !isNaN(x) && eval(x).toString().length === parseInt(eval(x)).toString().length;
}

function escapeFileName(s: string) {
    return '"' + s + '"';
}

function walk(dir: string, done: any) {
    let results: any[] = [];
    fs.readdir(dir, (err, list) => {
        if (err) return done(err);
        let i = 0;

        (function next() {
            let file = list[i++];
            if (!file) return done(null, results);

            file = path.resolve(dir, file);
            fs.stat(file, (err, stat) => {
                if (stat && stat.isDirectory()) {
                    walk(file, (err: any, res: any) => {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                }
            });
        })();
    });
}