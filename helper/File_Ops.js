// include node fs module
var fs = require('fs');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

let fileSys = {};

// writeFile function with filename, content and callback function
fileSys.refresh_token_write = (refresh_token) =>{
    fs.writeFile('refresh_token.txt', refresh_token, function (err) {
    if (err) throw err;
    logger.info('File is created successfully.');
    return true;
  });
}

// writeFile function with filename, content and callback function
fileSys.token_time_write = (time) =>{
    // can not save number so converting number to string
    fs.writeFile('last_access_token_time.txt', time.toString(), function (err) {
    if (err) throw err;
    logger.info('File is created successfully.');
    return true;
  });
}

fileSys.refresh_token_read = () =>{
    return new Promise((resolve, reject)=>{
        fs.readFile('refresh_token.txt', 'utf8', (err, data) => {
            if (err) {
              reject(err);
            }
            resolve(data);
          });
    });
}

fileSys.token_time_read = () =>{
    return new Promise((resolve,reject)=>{
        fs.readFile('last_access_token_time.txt', 'utf8', (err, data) => {
            if (err) {
                reject(err);
            }
            // convert string to number and returing number.
            resolve(data);
          });
    });
}

module.exports = fileSys;