const telegraph = require('telegraph-node')
const ph = new telegraph();
import readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.question('Enter account name: ', (code) => {
    rl.close();
    ph.createAccount(code).then((result: any) => {
        console.info("You\'r Telegra.ph token==>", result.access_token);
    }).catch(console.error);
});