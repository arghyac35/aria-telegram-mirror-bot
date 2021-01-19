/* This code is copied from https://github.com/iwestlin/gd-utils and adapted to typescript, also I kept only the code I needed removing other parts. I hereby take no credit of the followong other than modifications. See https://github.com/iwestlin/gd-utils/blob/master/src/gd.js for original author. */

import axios from 'axios';
import fs = require('fs');
import path from 'path';
import { GoogleToken } from 'gtoken';
import pLimit from 'p-limit';
import dayjs from 'dayjs';
import Table from 'cli-table3';
import constants = require('../.constants');

var AUTH: any;

const FOLDER_TYPE = 'application/vnd.google-apps.folder'
let axins = axios.create({});
const RETRY_LIMIT = 5;
const FILE_EXCEED_MSG = 'The number of files on your team drive has exceeded the limit (400,000), Please move the folder that has not been copied to another team drive, and then run the copy command to resume the transfer';

const SA_LOCATION = 'accounts';
const SA_BATCH_SIZE = 1000
const SA_FILES: any = constants.USE_SERVICE_ACCOUNT ? fs.readdirSync(path.join(__dirname, '../..', SA_LOCATION)).filter(v => v.endsWith('.json')) : [];
SA_FILES.flag = 0
let SA_TOKENS = get_sa_batch()

//TODO: Move these to constants.js
const PARALLEL_LIMIT = 20 // The number of parallel network requests can be adjusted according to the network environment
const PAGE_SIZE = 1000 // Each network request to read the number of files in the directory, the larger the value, the more likely it will time out, and it should not exceed 1000

// How many milliseconds for a single request to time out（Reference value，If continuous timeout, it will be adjusted to twice the previous time）
const TIMEOUT_BASE = 7000
// Maximum timeout setting，For example, for a certain request, the first 7s timeout, the second 14s, the third 28s, the fourth 56s, the fifth is not 112s but 60
const TIMEOUT_MAX = 60000

const sleep = (ms: number) => new Promise((resolve, reject) => setTimeout(resolve, ms));

const EXCEED_LIMIT = 7;
const FID_TO_NAME: any = {};

export async function real_copy(source: string, target: string, tg?: any) {
    async function get_new_root() {
        const file = await get_info_by_id(source)
        if (!file) throw new Error(`Unable to access the link, please check if the link is valid and SA has the appropriate permissions：https://drive.google.com/drive/folders/${source}`)
        return create_folder(file.name, target)
    }

    const new_root = await get_new_root()

    const arr = await walk_and_save(source)
    const smy = arr && arr.length > 0 ? summary(arr) : null;
    const folders: any[] = [];
    const files = arr.filter((v: any) => {
        if (v.mimeType !== FOLDER_TYPE) return true;
        else {
            if (v.mimeType === FOLDER_TYPE) folders.push(v);
            return false;
        }
    });
    console.log('Number of folders to be copied：', folders.length)
    console.log('Number of files to be copied：', files.length)

    if (files.length === 0) {
        throw new Error("No files found for copying.");
    }

    const mapping = await create_folders(
        source,
        folders,
        new_root.id,
        smy,
        tg
    );
    await copy_files(files, mapping, new_root.id, smy, tg)
    return { id: new_root.id, folderSize: smy.total_size }
}

async function get_info_by_id(fid: string) {
    let url = `https://www.googleapis.com/drive/v3/files/${fid}`
    let params = {
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: 'allDrives',
        fields: 'id, name, size, parents, mimeType, modifiedTime'
    }
    url += '?' + params_to_query(params)
    let retry = 0
    while (retry < RETRY_LIMIT) {
        try {
            const headers = await gen_headers()
            const { data } = await axins.get(url, { headers })
            return data
        } catch (e) {
            retry++
            handle_error(e)
        }
    }
    // throw new Error('Unable to access this FolderID：' + fid)
}

async function create_folder(name: string, parent: string, limit?: any) {
    let url = `https://www.googleapis.com/drive/v3/files`
    const params = { supportsAllDrives: true }
    url += '?' + params_to_query(params)
    const post_data = {
        name,
        mimeType: FOLDER_TYPE,
        parents: [parent]
    }
    let retry = 0
    let err_message
    while (retry < RETRY_LIMIT) {
        try {
            const headers = await gen_headers()
            return (await axins.post(url, post_data, { headers })).data
        } catch (err) {
            err_message = err.message
            retry++
            handle_error(err)
            const data = err && err.response && err.response.data
            const message = data && data.error && data.error.message
            if (message && message.toLowerCase().includes('file limit')) {
                if (limit) limit.clearQueue()
                throw new Error(FILE_EXCEED_MSG)
            }
            console.log('Creating Folder and Retrying：', name, 'No of retries：', retry)
        }
    }
    throw new Error(err_message + ' Folder Name：' + name)
}

function params_to_query(data: any) {
    const ret = []
    for (let d in data) {
        ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]))
    }
    return ret.join('&')
}

function handle_error(err: any) {
    const data = err && err.response && err.response.data
    if (data) {
        console.error(JSON.stringify(data))
    } else {
        if (!err.message.includes('timeout')) console.error(err.message)
    }
}

async function gen_headers() {
    const access_token = constants.USE_SERVICE_ACCOUNT ? (await get_sa_token()).access_token : (await get_access_token());
    return { authorization: 'Bearer ' + access_token }
}

async function get_sa_token() {
    if (!SA_TOKENS.length) SA_TOKENS = get_sa_batch()
    while (SA_TOKENS.length) {
        const tk = get_random_element(SA_TOKENS)
        try {
            return await real_get_sa_token(tk)
        } catch (e) {
            console.warn('SA failed to get access_token：', e.message)
            SA_TOKENS = SA_TOKENS.filter((v: any) => v.gtoken !== tk.gtoken)
            if (!SA_TOKENS.length) SA_TOKENS = get_sa_batch()
        }
    }
    throw new Error('No SA available')
}

async function real_get_sa_token(el: any) {
    const { value, expires, gtoken } = el
    // The reason for passing out gtoken is that when an account is exhausted, it can be filtered accordingly
    if (Date.now() < expires) return { access_token: value, gtoken }
    const { access_token, expires_in } = await gtoken.getToken({ forceRefresh: true })
    el.value = access_token
    el.expires = Date.now() + 1000 * (expires_in - 60 * 5) // 5 mins passed is taken as Expired
    return { access_token, gtoken }
}

async function get_access_token() {
    if (AUTH && AUTH.expires > Date.now()) {
        return AUTH.access_token;
    }

    let cred: any = fs.readFileSync('./credentials.json').toString();
    let client_sec: any = fs.readFileSync('./client_secret.json').toString();
    if (cred) {
        cred = JSON.parse(cred);
        client_sec = JSON.parse(client_sec)
        cred = { ...cred, ...client_sec.installed }
    }

    const { client_id, client_secret, refresh_token } = cred

    const url = 'https://www.googleapis.com/oauth2/v4/token'
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    const config = { headers }
    const params = { client_id, client_secret, refresh_token, grant_type: 'refresh_token' }
    const { data } = await axins.post(url, params_to_query(params), config)
    AUTH = cred;
    AUTH.access_token = data.access_token
    AUTH.expires = Date.now() + 1000 * data.expires_in
    return data.access_token
}

function get_sa_batch() {
    const new_flag = SA_FILES.flag + SA_BATCH_SIZE
    const files = SA_FILES.slice(SA_FILES.flag, new_flag)
    SA_FILES.flag = new_flag
    return files.map((filename: string) => {
        const gtoken = new GoogleToken({
            keyFile: path.join(__dirname, '../..', SA_LOCATION, filename),
            scope: ['https://www.googleapis.com/auth/drive']
        })
        return { gtoken, expires: 0 }
    })
}

function get_random_element(arr: any[]) {
    return arr[~~(arr.length * Math.random())]
}

export async function walk_and_save(fid: string, tg?: any) {
    let result: any = [];
    const unfinished_folders: any[] = []
    const limit = pLimit(PARALLEL_LIMIT)

    const loop = setInterval(() => {
        const now = dayjs().format('HH:mm:ss')
        const message = `${now} | Copied ${result.length} | Ongoing ${limit.activeCount} | Pending ${limit.pendingCount}`
        print_progress(message)
    }, 1000)

    const tg_loop = tg && setInterval(() => {
        tg({
            obj_count: result.length,
            processing_count: limit.activeCount,
            pending_count: limit.pendingCount
        })
    }, constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000);

    async function recur(parent: string) {
        let files = await limit(() => ls_folder(parent))
        if (!files) return null;
        if (files.unfinished) unfinished_folders.push(parent)
        const folders = files.filter((v: any) => v.mimeType === FOLDER_TYPE)
        files.forEach((v: any) => v.parent = parent)
        result = result.concat(files)
        return Promise.all(folders.map((v: any) => recur(v.id)))
    }
    try {
        await recur(fid)
    } catch (e) {
        console.error(e)
    }
    console.log('\nInfo obtained')
    unfinished_folders.length ? console.log('Unread FolderID：', JSON.stringify(unfinished_folders)) : console.log('All Folders have been read')
    clearInterval(loop)
    if (tg_loop) {
        clearInterval(tg_loop)
        // tg({
        //     obj_count: result.length,
        //     processing_count: limit.activeCount,
        //     pending_count: limit.pendingCount
        // })
    }

    result.unfinished_number = unfinished_folders.length
    return result
}

function print_progress(msg: string) {
    if (process.stdout.cursorTo) {
        let tmp: any;
        process.stdout.cursorTo(0, tmp)
        process.stdout.write(msg + ' ')
    } else {
        console.log(msg)
    }
}

export function summary(info: any[], sort_by?: string) {
    const files = info.filter(v => v.mimeType !== FOLDER_TYPE);
    const file_count = files.length;
    const folder_count = info.filter(v => v.mimeType === FOLDER_TYPE).length
    let total_size: any = info.map(v => Number(v.size) || 0).reduce((acc, val) => acc + val, 0);
    total_size = format_size(total_size)
    const exts: any = {}
    const sizes: any = {}
    let no_ext = 0; let no_ext_size = 0
    files.forEach(v => {
        let { name, size } = v
        size = Number(size) || 0
        const ext = name.split('.').pop().toLowerCase()
        if (!name.includes('.') || ext.length > 10) { // If there are more than 10 characters after . , it is judged as no extension
            no_ext_size += size
            return no_ext++
        }
        if (exts[ext]) {
            exts[ext]++
        } else {
            exts[ext] = 1
        }
        if (sizes[ext]) {
            sizes[ext] += size
        } else {
            sizes[ext] = size
        }
        return v;
    })
    const details: any = Object.keys(exts).map(ext => {
        const count = exts[ext]
        const size = sizes[ext]
        return { ext, count, size: format_size(size), raw_size: size }
    })
    if (sort_by === 'size') {
        details.sort((a: any, b: any) => b.raw_size - a.raw_size)
    } else if (sort_by === 'name') {
        details.sort((a: any, b: any) => (a.ext > b.ext) ? 1 : -1)
    } else {
        details.sort((a: any, b: any) => b.count - a.count)
    }
    if (no_ext) details.push({ ext: 'No Extension', count: no_ext, size: format_size(no_ext_size), raw_size: no_ext_size })
    if (folder_count) details.push({ ext: 'Folder', count: folder_count, size: 0, raw_size: 0 })
    return { file_count, folder_count, total_size, details }
}

function format_size(n: any) {
    n = Number(n)
    if (Number.isNaN(n)) return ''
    if (n < 0) return 'invalid size'
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    let flag = 0
    while (n >= 1024) {
        n = (n / 1024)
        flag++
    }
    return n.toFixed(2) + ' ' + units[flag]
}

async function ls_folder(fid: string, with_modifiedTime?: boolean) {
    let files: any = []
    let pageToken
    const search_all = { includeItemsFromAllDrives: true, supportsAllDrives: true }
    const params: any = fid === 'root' ? {} : search_all
    params.q = `'${fid}' in parents and trashed = false`
    params.orderBy = 'folder,name desc'
    params.fields = 'nextPageToken, files(id, name, mimeType, size, md5Checksum)'
    if (with_modifiedTime) {
        params.fields = 'nextPageToken, files(id, name, mimeType, modifiedTime, size, md5Checksum)'
    }
    params.pageSize = Math.min(PAGE_SIZE, 1000)
    const use_sa = (fid !== 'root') && constants.USE_SERVICE_ACCOUNT
    // const headers = await gen_headers(use_sa)
    // For Folders with a large number of subfolders（1ctMwpIaBg8S1lrZDxdynLXJpMsm5guAl），The access_token may have expired before listing
    // Because nextPageToken is needed to get the data of the next page，So you cannot use parallel requests，The test found that each request to obtain 1000 files usually takes more than 20 seconds to complete
    const gtoken = use_sa && (await get_sa_token()).gtoken
    do {
        if (pageToken) params.pageToken = pageToken
        let url = 'https://www.googleapis.com/drive/v3/files'
        url += '?' + params_to_query(params)
        let retry = 0
        let data
        const payload: any = { timeout: TIMEOUT_BASE }
        while (!data && (retry < RETRY_LIMIT)) {
            const access_token = gtoken ? (await gtoken.getToken()).access_token : (await get_access_token());
            const headers = { authorization: 'Bearer ' + access_token }
            payload.headers = headers
            try {
                data = (await axins.get(url, payload)).data
            } catch (err) {
                handle_error(err)
                retry++
                payload.timeout = Math.min(payload.timeout * 2, TIMEOUT_MAX)
            }
        }
        if (!data) {
            console.error('Folder is not read completely, Parameters:', params)
            files.unfinished = true
            return files
        }
        files = files.concat(data.files)
        pageToken = data.nextPageToken
    } while (pageToken)

    return files
}

async function create_folders(source: string, folders: any[], root: string, smy?: any, tg?: any) {
    if (!Array.isArray(folders)) throw new Error('folders must be Array:' + folders)
    const mapping: any = {};
    mapping[source] = root
    if (!folders.length) return mapping

    const missed_folders = folders.filter(v => !mapping[v.id])
    console.log('Start copying folders, total：', missed_folders.length)
    const limit = pLimit(PARALLEL_LIMIT)
    let count = 0
    let same_levels = folders.filter(v => v.parent === folders[0].parent)

    const loop = setInterval(() => {
        const now = dayjs().format('HH:mm:ss')
        const message = `${now} | Folders Created ${count} | Ongoing ${limit.activeCount} | Pending ${limit.pendingCount}`
        print_progress(message)
    }, 1000)

    const tg_loop = smy && tg && setInterval(() => {
        tg({
            isCopyingFolder: true,
            copiedCount: count,
            ...smy
        })
    }, constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000);

    while (same_levels.length) {
        const same_levels_missed = same_levels.filter(v => !mapping[v.id])
        await Promise.all(same_levels_missed.map(async v => {
            try {
                const { name, id, parent } = v
                const target = mapping[parent] || root
                const new_folder = await limit(() => create_folder(name, target, limit))
                count++
                mapping[id] = new_folder.id
            } catch (e) {
                if (e.message === FILE_EXCEED_MSG) {
                    clearInterval(loop)
                    if (tg_loop) clearInterval(tg_loop)
                    throw new Error(FILE_EXCEED_MSG)
                }
                console.error('Error creating Folder:', e.message)
            }
        }))
        same_levels = [].concat(...same_levels.map(v => folders.filter(vv => vv.parent === v.id)))
    }

    clearInterval(loop)
    if (tg_loop) clearInterval(tg_loop);
    return mapping
}

async function copy_files(files: any[], mapping: any[], root: string, smy?: any, tg?: any) {
    if (!files.length) return
    console.log('\nStarted copying files, total：', files.length)

    const loop = setInterval(() => {
        const now = dayjs().format('HH:mm:ss')
        const message = `${now} | Number of files copied ${count} | ongoing ${concurrency} | Number of Files Pending ${files.length}`
        print_progress(message)
    }, 1000)

    const tg_loop = smy && tg && setInterval(() => {
        tg({
            isCopyingFolder: false,
            copiedCount: count,
            ...smy
        })
    }, constants.STATUS_UPDATE_INTERVAL_MS ? constants.STATUS_UPDATE_INTERVAL_MS : 12000);

    let count = 0
    let concurrency = 0
    let err
    do {
        if (err) {
            clearInterval(loop)
            if (tg_loop) clearInterval(tg_loop)
            files = null
            throw err
        }
        if (concurrency >= PARALLEL_LIMIT) {
            await sleep(100)
            continue
        }
        const file = files.shift()
        if (!file) {
            await sleep(1000)
            continue
        }
        concurrency++
        const { id, parent } = file
        const target = mapping[parent] || root
        copy_file(id, target).then((new_file: any) => {
            if (new_file) {
                count++
            }
        }).catch(e => {
            err = e
        }).finally(() => {
            concurrency--
        })
    } while (concurrency || files.length)
    clearInterval(loop)
    if (tg_loop) clearInterval(tg_loop)
    if (err) throw err
}

export async function copy_file(id: string, parent: string, limit?: any) {
    let url = `https://www.googleapis.com/drive/v3/files/${id}/copy`
    let params = { supportsAllDrives: true, fields: 'id, name, mimeType, size' }
    url += '?' + params_to_query(params)
    const config: any = {}
    let retry = 0
    while (retry < RETRY_LIMIT) {
        let gtoken: any;
        if (constants.USE_SERVICE_ACCOUNT) {
            const temp = await get_sa_token()
            gtoken = temp.gtoken
            config.headers = { authorization: 'Bearer ' + temp.access_token }
        } else {
            config.headers = await gen_headers()
        }
        try {
            const { data } = await axins.post(url, { parents: [parent] }, config)
            if (gtoken) gtoken.exceed_count = 0
            return data
        } catch (err) {
            retry++
            handle_error(err)
            const data = err && err.response && err.response.data;
            const message = data && data.error && data.error.message;
            if (message && message.toLowerCase().includes('file limit')) {
                if (limit) limit.clearQueue()
                throw new Error(FILE_EXCEED_MSG)
            }
            if (!constants.USE_SERVICE_ACCOUNT && message && message.toLowerCase().includes('rate limit')) {
                throw new Error('Personal Drive Limit：' + message)
            }
            if (constants.USE_SERVICE_ACCOUNT && message && message.toLowerCase().includes('rate limit')) {
                retry--
                if (gtoken.exceed_count >= EXCEED_LIMIT) {
                    SA_TOKENS = SA_TOKENS.filter((v: any) => v.gtoken !== gtoken)
                    if (!SA_TOKENS.length) SA_TOKENS = get_sa_batch()
                    console.log(`This account has triggered the daily usage limit${EXCEED_LIMIT} consecutive times, the remaining amount of SA available in this batch：`, SA_TOKENS.length)
                } else {
                    // console.log('This account triggers its daily usage limit and has been marked. If the next request is normal, it will be unmarked, otherwise the SA will be removed')
                    if (gtoken.exceed_count) {
                        gtoken.exceed_count++
                    } else {
                        gtoken.exceed_count = 1
                    }
                }
            }
        }
    }
    if (constants.USE_SERVICE_ACCOUNT && !SA_TOKENS.length) {
        if (limit) limit.clearQueue()
        throw new Error('All SA are exhausted')
    } else {
        console.warn('File creation failed，Fileid: ' + id)
    }
}

export async function gen_count_body({ fid, limit, tg, smy }: any) {
    function render_smy(smy: any, unfinished_number?: string) {
        if (!smy) return
        smy = (typeof smy === 'object') ? smy : JSON.parse(smy)
        let result = make_tg_table(smy, limit)
        if (unfinished_number) result += `\nNumber of Folders not read：${unfinished_number}`
        return result
    }

    const file = await get_info_by_id(fid);
    if (file && file.mimeType !== FOLDER_TYPE) return render_smy(summary([file]))

    if (!file) {
        throw new Error(`Unable to access the link, please check if the link is valid and SA has the appropriate permissions：https://drive.google.com/drive/folders/${fid}`)
    }

    if (!smy) {
        smy = summary(await walk_and_save(fid, tg));
    }
    return { table: render_smy(smy), smy };
}

function make_tg_table({ file_count, folder_count, total_size, details }: any, limit?: number) {
    const tb: any = new Table({
        style: {
            head: [],
            border: []
        }
    })
    const hAlign = 'center'
    const headers = ['Type', 'Count', 'Size'].map(v => ({ content: v, hAlign }))
    details.forEach((v: any) => {
        if (v.ext === 'Folder') v.ext = '[Folder]'
        if (v.ext === 'No Extension') v.ext = '[NoExt]'
    })
    let records = details.map((v: any) => [v.ext, v.count, v.size]).map((arr: any) => arr.map((content: any) => ({ content, hAlign })))
    const folder_row = records.pop()
    if (limit) records = records.slice(0, limit)
    if (folder_row) records.push(folder_row)
    const total_count = file_count + folder_count
    const tails = ['Total', total_count, total_size].map(v => ({ content: v, hAlign }))
    tb.push(headers, ...records)
    tb.push(tails)
    return tb.toString().replace(/─/g, '—') // Prevent the table from breaking on the mobile phone and it will look more beautiful in pc after removing the replace
}

async function get_name_by_id(fid: string) {
    const info = await get_info_by_id(fid)
    return info ? info.name : fid
}

export async function get_folder_name(fid: string) {
    let name = FID_TO_NAME[fid]
    if (name) return name
    name = await get_name_by_id(fid)
    return FID_TO_NAME[fid] = name
}