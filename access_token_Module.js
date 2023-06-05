const axios = require('axios');
// const file = require("./File_Ops");
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "all"

let token;
token_timer = 0;
const get_access_token = async() =>{
    // let refresh_token = await file.refresh_token_read().then(data => data).catch(error => {
    //     logger.error(error);
    //     return;
    // });
    let refresh_token = process.env.refresh_token
    if(refresh_token){
        token = await axios.post(`https://accounts.zoho.in/oauth/v2/token?refresh_token=${refresh_token}&client_id=${process.env.clientId}&client_secret=${process.env.clientsecret}&redirect_uri=https://www.zoho.in/books&grant_type=refresh_token`)
        .then(resp=>{
            if (resp.data.access_token) return resp.data;
            else{
                logger.error(resp.data.error)
                throw new Error(resp.data.error)
            }
        })
        .catch(error=>{
            logger.error("step 2 error " + error.message)
            throw new Error("access token error, " + error.message);
        })
        // logger.info("Token got using refresh token ",token);
        // current time in milliseconds from 1st jan 1970
        token_timer = Date.now();
        return token;
    }else{
        logger.warn("refresh token is not found in File System");
        token = await axios.post(`https://accounts.zoho.in/oauth/v2/token?code=${process.env.code}&client_id=${process.env.clientId}&client_secret=${process.env.clientsecret}&redirect_uri=https://www.zoho.in/books&grant_type=authorization_code`)
        .then(res =>{
            if (res.data.access_token) return res.data;
            else{
                logger.error(res.data.error)
                throw new Error(res.data.error);
            }
        })
        .catch(error=>{
            logger.error("step 2 error " + error.message)
            throw new Error("access token error, " + error.message);
        })
        // logger.info("Token got using auth code ",token);
        // caching the refresh token and expiration time - 
        // file.refresh_token_write(token.refresh_token);
        // current time in milliseconds from 1st jan 1970
        token_timer = Date.now();

        return token;
    }
    
} 

module.exports = get_access_token;
