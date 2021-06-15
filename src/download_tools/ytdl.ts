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
import { prepDownload } from '../index'

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
    extractedFileSize: '',
    unzipPassword: ''
};

const supportedQualities = [
    { quality: '1080', itag: 137, onlyvideo: true }, // video only
    { quality: '720', itag: 22, onlyvideo: false },
    { quality: '480', itag: 135, onlyvideo: true }, // video only
    { quality: '360', itag: 18, onlyvideo: false },
    { quality: '240', itag: 133, onlyvideo: true }, // video only
    { quality: 'audio', itag: 'highestaudio', onlyvideo: false },
];

export async function ytdlWrapper(url: string, bot: TelegramBot, tgMsg: TelegramBot.Message, actualMsg: TelegramBot.Message, quality = '') {

    url = url.trim()
    let info = await ytdl.getInfo(url);

    let message = `Downloading: <code>${info.videoDetails.title}</code>`;
    await msgTools.editMessage(bot, tgMsg, message);

    const supportedQuality = supportedQualities.find(data => data.quality === quality.toLowerCase());
    if (quality) {
        if (supportedQuality) {
            const options: ytdl.chooseFormatOptions = { quality: supportedQuality.itag };
            // if (supportedQuality.quality === 'audio') {
            //     options.filter = 'audioonly';
            // }
            const videoformat = ytdl.chooseFormat(info.formats, options);
            if (!videoformat) {
                throw new Error(`Quality: ${supportedQuality.quality} not found for this video. You may try downloading it without passing any quality, let ytdl choose the best quality.`);
            }
            if (!supportedQuality.onlyvideo) {
                if (supportedQuality.quality === 'audio') {
                    const filesavetoinfo = getFileSavetoPath(info, true);
                    let stream = ytdl.downloadFromInfo(info, {
                        format: videoformat,
                    });

                    let start = Date.now();
                    // Start the ffmpeg child process
                    const ffmpegProcess: any = cp.spawn(ffmpeg, [
                        // Remove ffmpeg's console spamming
                        '-loglevel', '8', '-hide_banner',
                        // Redirect/Enable progress messages
                        '-progress', 'pipe:2',
                        // Set input
                        '-i', 'pipe:3',
                        '-vn',
                        '-b:a', '320k',
                        // Define output file
                        filesavetoinfo.realFilePath,
                    ], {
                        windowsHide: true,
                        stdio: [
                            'inherit', 'inherit',
                            'pipe', 'pipe',
                        ],
                    });
                    ffmpegProcess.on('close', async () => {
                        console.log(`\ndone, thanks - ${(Date.now() - start) / 1000}s`);
                        await startUpload(filesavetoinfo.dlDir, filesavetoinfo.realFilePath, info.videoDetails.title + '.mp3', bot, tgMsg, actualMsg, `Downloading: <code>${info.videoDetails.title}</code>`);
                    });

                    ffmpegProcess.on('error', (error: any) => {
                        console.log('ffmpeg error-->', error);
                    });

                    // ffmpegProcess.stdio[2].on('data', (chunk: any) => {
                    //     const lines = chunk.toString().trim().split('\n');
                    //     console.log('chunk-->', lines);
                    // });

                    stream.pipe(ffmpegProcess.stdio[3]);
                    return;
                }
                prepDownload(actualMsg, videoformat.url, false, false, info.videoDetails.title + '.' + videoformat.container);
                msgTools.deleteMsg(bot, tgMsg);
            } else {
                let audioitag: any = '';
                if (supportedQuality.quality !== '1080') {
                    const audioformat = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' });
                    if (audioformat) audioitag = audioformat.itag;
                }
                downloadSeperateStreamAndMerge(info, bot, tgMsg, actualMsg, videoformat.itag, audioitag);
            }

        } else {
            throw new Error(`Quality: ${quality} is not supported.`);
        }
    } else {
        downloadSeperateStreamAndMerge(info, bot, tgMsg, actualMsg);
    }

}

function getFileSavetoPath(info: ytdl.videoInfo, isAudio = false) {
    let dlDir = uuidv4();
    const realFilePath = `${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}/${info.videoDetails.title}${isAudio ? '.mp3' : '.mkv'}`;

    fs.mkdirSync(`${constants.ARIA_DOWNLOAD_LOCATION}/${dlDir}`, { recursive: true });
    return { realFilePath, dlDir };
}

async function downloadSeperateStreamAndMerge(info: ytdl.videoInfo, bot: TelegramBot, tgMsg: TelegramBot.Message, actualMsg: TelegramBot.Message, quality: any = '', audioitag: any = '') {

    // Prepare the progress bar
    let progressbarHandle: NodeJS.Timeout = null;
    const progressbarInterval = constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000;

    const tracker = {
        start: Date.now(),
        audio: { downloaded: 0, total: Infinity },
        video: { downloaded: 0, total: Infinity },
        merged: { frame: 0, speed: '0x', fps: 0 },
    };

    const filesavetoinfo = getFileSavetoPath(info);

    // Get audio and video streams
    const audio = ytdl.downloadFromInfo(info, { quality: audioitag ? audioitag : 'highestaudio' })
        .on('progress', (_, downloaded, total) => {
            tracker.audio = { downloaded, total };
        });
    const video = ytdl.downloadFromInfo(info, { quality: quality ? quality : 'highestvideo' })
        .on('progress', (_, downloaded, total) => {
            tracker.video = { downloaded, total };
        });

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
        filesavetoinfo.realFilePath,
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
        await startUpload(filesavetoinfo.dlDir, filesavetoinfo.realFilePath, info.videoDetails.title + '.mkv', bot, tgMsg, actualMsg, `Downloading: <code>${info.videoDetails.title}</code>`);
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

    // Link streams
    // FFmpeg creates the transformer streams and we just have to insert / read data
    ffmpegProcess.stdio[3].on('data', (chunk: any) => {
        // Start the progress bar
        if (!progressbarHandle) progressbarHandle = setInterval(showProgress(info, tracker, bot, tgMsg), progressbarInterval);
        // Parse the param=value list returned by ffmpeg
        const lines = chunk.toString().trim().split('\n');
        const args: any = {};
        for (const l of lines) {
            const [key, value] = l.split('=');
            args[key.trim()] = value.trim();
        }
        tracker.merged = args;
    });
    audio.pipe(ffmpegProcess.stdio[4]);
    video.pipe(ffmpegProcess.stdio[5]);
}

const showProgress = (info: ytdl.videoInfo, tracker: any, bot: TelegramBot, tgMsg: TelegramBot.Message) => () => {
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


    let message = `Downloading: <code>${info.videoDetails.title}</code>\nAudio  | ${(tracker.audio.downloaded / tracker.audio.total * 100).toFixed(2)}% processed (${toMB(tracker.audio.downloaded)}MB of ${toMB(tracker.audio.total)}MB).${' '.repeat(10)}\nVideo  | ${(tracker.video.downloaded / tracker.video.total * 100).toFixed(2)}% processed (${toMB(tracker.video.downloaded)}MB of ${toMB(tracker.video.total)}MB).${' '.repeat(10)}\nMerged | processing frame ${tracker.merged.frame} (at ${tracker.merged.fps} fps => ${tracker.merged.speed}).${' '.repeat(10)}\nrunning for: ${((Date.now() - tracker.start) / 1000 / 60).toFixed(2)} Minutes.`;

    msgTools.editMessage(bot, tgMsg, message);
};


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