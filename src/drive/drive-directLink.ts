import request = require('request')
import jsdom = require("jsdom");

/**
 * TO BE WRITTEN LATER😁😁😁
 * TO BE WRITTEN LATER😁😁😁
 * TO BE WRITTEN LATER😁😁😁
 * @param {string} url The url of the file to get direct link for
 * @param {function} callback A function to call with an error, or a human-readable message
 */
export function getLink(url: string, getOnlyLink: boolean, callback: (err: string, message: string) => void): void {
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
            var dom = new jsdom.JSDOM(body);
            var fileName_div = dom.window.document.querySelector(".uc-name-size a");
            if (response.headers.location) {
                console.log(response.headers);

                if (response.headers.location.indexOf("accounts.google.com") !== -1) {
                    //Ignore non public links
                    callback('Non public link', null);
                }
                callback(null, getOnlyLink ? response.headers.location : 'Direct Link: <a href = \'' + response.headers.location + '\'>Click Here' + '</a>');
            } else if (fileName_div) {
                let fileName = fileName_div.textContent;
                let myContainer = <Element>dom.window.document.querySelector("#uc-download-link");
                var dlLink = "https://drive.google.com" + myContainer.getAttribute('href');
                console.log('2nd--->', fileName);
                console.log('dllink--->', dlLink);
                cookieRequest.get({
                    url: dlLink,
                    followRedirect: false
                },
                    function (error, response, body) {
                        if (response.headers.location && response.headers.location.indexOf("accounts.google.com") !== -1) {
                            // Non public link
                            callback('Non public link', null);
                        }
                        callback(null, getOnlyLink ? response.headers.location : 'Direct Link: <a href = \'' + response.headers.location + '\'>' + fileName + '</a>');
                    });
            } else {
                callback('Not a proper gdrive link', null);
            }
        });
}
