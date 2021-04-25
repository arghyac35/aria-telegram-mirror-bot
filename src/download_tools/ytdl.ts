import constants = require('../.constants');
import TelegramBot = require('node-telegram-bot-api');
import msgTools = require('../bot_utils/msg-tools');
import ytdl from 'ytdl-core';
const ffmpeg = require('ffmpeg-static');
import readline from 'readline';
import cp from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import driveTar = require('../drive/drive-tar');
import { DlVars } from '../dl_model/detail';
import fs from 'fs';
import downloadUtils = require('../download_tools/utils');

const dlDetails: DlVars = {
    isTar: false,
    isUnzip: false,
    tgUsername: '',
    gid: '',
    downloadDir: '',
    tgChatId: 0,
    tgFromId: 0,
    tgMessageId: 0,
    tgRepliedUsername: '',
    isDownloadAllowed: 1,
    isDownloading: true,
    isUploading: true,
    uploadedBytes: 0,
    isDuplicateMirror: 0,
    uploadedBytesLast: 0,
    startTime: 0,
    lastUploadCheckTimestamp: 0,
    isExtracting: false,
    extractedFileName: '',
    extractedFileSize: ''
};

export async function ytdlWrapper(url: string, bot: TelegramBot, tgMsg: TelegramBot.Message, actualMsg: TelegramBot.Message) {
    url = url.trim()
    let info = await ytdl.getInfo(url);

    let message = `Downloading: <code>${info.videoDetails.title}</code>`;
    msgTools.editMessage(bot, tgMsg, message);

    const tracker = {
        start: Date.now(),
        audio: { downloaded: 0, total: Infinity },
        video: { downloaded: 0, total: Infinity },
        merged: { frame: 0, speed: '0x', fps: 0 },
    };

    // Get audio and video streams
    const audio = ytdl(url, { quality: 'highestaudio' })
        .on('progress', (_, downloaded, total) => {
            tracker.audio = { downloaded, total };
        });
    const video = ytdl(url, { quality: 'highestvideo' })
        .on('progress', (_, downloaded, total) => {
            tracker.video = { downloaded, total };
        });

    // Prepare the progress bar
    let progressbarHandle: NodeJS.Timeout = null;
    const progressbarInterval = constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000;
    const showProgress = () => {
        // readline.cursorTo(process.stdout, 0);
        const toMB = (i: number) => (i / 1024 / 1024).toFixed(2);

        // process.stdout.write(`Audio  | ${(tracker.audio.downloaded / tracker.audio.total * 100).toFixed(2)}% processed `);
        // process.stdout.write(`(${toMB(tracker.audio.downloaded)}MB of ${toMB(tracker.audio.total)}MB).${' '.repeat(10)}\n`);

        // process.stdout.write(`Video  | ${(tracker.video.downloaded / tracker.video.total * 100).toFixed(2)}% processed `);
        // process.stdout.write(`(${toMB(tracker.video.downloaded)}MB of ${toMB(tracker.video.total)}MB).${' '.repeat(10)}\n`);

        // process.stdout.write(`Merged | processing frame ${tracker.merged.frame} `);
        // process.stdout.write(`(at ${tracker.merged.fps} fps => ${tracker.merged.speed}).${' '.repeat(10)}\n`);

        // process.stdout.write(`running for: ${((Date.now() - tracker.start) / 1000 / 60).toFixed(2)} Minutes.`);
        // readline.moveCursor(process.stdout, 0, -3);


        message = `Downloading: <code>${info.videoDetails.title}</code>\nAudio  | ${(tracker.audio.downloaded / tracker.audio.total * 100).toFixed(2)}% processed (${toMB(tracker.audio.downloaded)}MB of ${toMB(tracker.audio.total)}MB).${' '.repeat(10)}\nVideo  | ${(tracker.video.downloaded / tracker.video.total * 100).toFixed(2)}% processed (${toMB(tracker.video.downloaded)}MB of ${toMB(tracker.video.total)}MB).${' '.repeat(10)}\nMerged | processing frame ${tracker.merged.frame} (at ${tracker.merged.fps} fps => ${tracker.merged.speed}).${' '.repeat(10)}\nrunning for: ${((Date.now() - tracker.start) / 1000 / 60).toFixed(2)} Minutes.`;

        msgTools.editMessage(bot, tgMsg, message);
    };

    let dlDir = uuidv4();
    let realFilePath = `${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}/${info.videoDetails.title}.mkv`;

    fs.mkdirSync(`${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}`, { recursive: true });

    // Start the ffmpeg child process
    const ffmpegProcess: any = cp.spawn(ffmpeg, [
        // Remove ffmpeg's console spamming
        '-loglevel', '8', '-hide_banner',
        // Redirect/Enable progress messages
        '-progress', 'pipe:3',
        // Set inputs
        '-i', 'pipe:4',
        '-i', 'pipe:5',
        // Map audio & video from streams
        '-map', '0:a',
        '-map', '1:v',
        // Keep encoding
        '-c:v', 'copy',
        // Define output file
        realFilePath,
    ], {
        windowsHide: true,
        stdio: [
            /* Standard: stdin, stdout, stderr */
            'inherit', 'inherit', 'inherit',
            /* Custom: pipe:3, pipe:4, pipe:5 */
            'pipe', 'pipe', 'pipe',
        ],
    });
    ffmpegProcess.on('close', async () => {
        console.log('done');
        await startUpload(dlDir, realFilePath, info.videoDetails.title + '.mkv', bot, tgMsg, actualMsg, `Downloading: <code>${info.videoDetails.title}</code>`);
        // Cleanup
        process.stdout.write('\n\n\n\n');
        clearInterval(progressbarHandle);
    });

    ffmpegProcess.on('error', (error: any) => {
        console.log('ffmpeg error-->', error);
        // Cleanup
        process.stdout.write('\n\n\n\n');
        clearInterval(progressbarHandle);
    });

    console.log('called-->231');
    // Link streams
    // FFmpeg creates the transformer streams and we just have to insert / read data
    ffmpegProcess.stdio[3].on('data', (chunk: any) => {
        // Start the progress bar
        if (!progressbarHandle) progressbarHandle = setInterval(showProgress, progressbarInterval);
        // Parse the param=value list returned by ffmpeg
        const lines = chunk.toString().trim().split('\n');
        const args: any = {};
        for (const l of lines) {
            const [key, value] = l.split('=');
            args[key.trim()] = value.trim();
        }
        tracker.merged = args;
    });
    console.log('called-->45');
    audio.pipe(ffmpegProcess.stdio[4]);
    video.pipe(ffmpegProcess.stdio[5]);
    console.log('called-->56');

}

async function startUpload(dlDir: string, file: string, filename: string, bot: TelegramBot, tgMsg: TelegramBot.Message, actualMsg: TelegramBot.Message, message: string) {
    message += `\n\n✔Video download complete, starting file upload...`;
    msgTools.editMessage(bot, tgMsg, message);

    const { size } = fs.statSync(file);

    console.log('File size-->', size);

    driveTar.updateStatus(dlDetails, size, message, bot, tgMsg);
    let statusInterval = setInterval(() => {
        driveTar.updateStatus(dlDetails, size, message, bot, tgMsg);
    }, constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000);

    driveTar.driveUploadFile(file, dlDetails, (uperr, url, isFolder, indexLink) => {
        clearInterval(statusInterval);
        var finalMessage;
        if (uperr) {
            console.error(`Failed to upload - ${filename}: ${uperr}`);
            finalMessage = `Failed to upload <code>${filename}</code> to Drive. ${uperr}`;

            msgTools.deleteMsg(bot, tgMsg);
            msgTools.sendMessage(bot, actualMsg, finalMessage, 10000);
        } else {
            console.log(`Uploaded ${filename}`);
            if (size) {
                var fileSizeStr = downloadUtils.formatSize(size);
                finalMessage = `<b>GDrive Link</b>: <a href="${url}">${filename}</a> (${fileSizeStr})`;
                if (indexLink && constants.INDEX_DOMAIN) {
                    finalMessage += `\n\n<b>Do not share the GDrive Link. \n\nYou can share this link</b>: <a href="${indexLink}">${filename}</a>`;
                }
            } else {
                finalMessage = `<a href='${url}'>${filename}</a>`;
            }
        }
        downloadUtils.deleteDownloadedFile(dlDir);
        msgTools.deleteMsg(bot, tgMsg);
        msgTools.sendMessage(bot, actualMsg, finalMessage, -1);
    });
}