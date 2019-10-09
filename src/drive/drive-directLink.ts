import  request  = require('request')
import jsdom = require("jsdom");

/**
 * Searches for a given file on Google Drive. Only search the subfolders and files
 * of the folder that files are uploaded into. This function only performs performs
 * prefix matching, though it tries some common variations.
 * @param {string} fileName The name of the file to search for
 * @param {function} callback A function to call with an error, or a human-readable message
 */
export function getLink(url: string, callback: (err: string, message: string) => void): void {
    var matches = url.match(/\bhttps?:\/\/\S+/gi);

    var fileID = "";

    if (url.indexOf("view") !== -1) {
        fileID = matches[0].split("/")[5];
    } else if (url.indexOf("open?id=") !== -1) {
        fileID = matches[0].split("open?id=")[1].trim()
    } else if (url.indexOf("uc?id=") !== -1) {
        fileID = matches[0].split("uc?id=")[1].trim()
    }

    var cookieRequest = request.defaults({
        jar: true
    })

    var exportURL = "https://drive.google.com/uc?export=download&id=" + fileID;
    cookieRequest.get({
            url: exportURL,
            followRedirect: false
        },
        function (error, response, body) {
console.log('inside func-->', body);

            if (response.headers.location) {
                console.log('res inside func-->');
                if (response.headers.location.indexOf("accounts.google.com") !== -1) {
                    console.log('public inside func-->');
                    //Ignore non public links
                    return;
                }
                callback(null, '<a href = \'' + response.headers.location + '\'>' + response.headers.location + '</a>');
                // return;
            }

            var dom = new jsdom.JSDOM(body);

            var fileName = dom.window.document.querySelector(".uc-name-size a").textContent;

            let myContainer = <Element> dom.window.document.querySelector("#uc-download-link");
            var dlLink = "https://drive.google.com" + myContainer.getAttribute('href');

console.log('2nd--->', fileName);
console.log('dllink--->', dlLink);


            cookieRequest.get({
                    url: dlLink,
                    followRedirect: false
                },
                function (error, response, body) {
console.log('responseee--->', response.headers.location);

                    if (response.headers.location && response.headers.location.indexOf("accounts.google.com") !== -1) {
                        // Non public link
                        return;
                    }
                    console.log('2nd should sent--->', response.headers.location);
                callback(null, '<a href = \'' + response.headers.location + '\'>' + fileName + '</a>');
                });
        });
}
