const envVariables = require('../helper/envHelper');
const axios = require('axios');
// const file = require("./File_Ops");
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

let token;
token_timer = 0;
const get_access_token = async(uhid, correlationId) =>{
    // let refresh_token = await file.refresh_token_read().then(data => data).catch(error => {
    //     logger.error(error);
    //     return;
    // });
    let refresh_token = envVariables.REFRESH_TOKEN
    if(refresh_token){
        token = await axios.post(`https://accounts.zoho.in/oauth/v2/token?refresh_token=${refresh_token}&client_id=${envVariables.CLIENT_ID}&client_secret=${envVariables.CLIENT_SECRET}&redirect_uri=https://www.zoho.in/books&grant_type=refresh_token`)
        .then(resp=>{
            if (resp.data.access_token) return resp.data;
            else{
                logger.error(resp.data.error," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                throw new Error(resp.data.error)
            }
        })
        .catch(error=>{
            logger.error("step 2 error " + error.message," correlationId Id: ",correlationId, " patient uhid: ",uhid)
            throw new Error("access token error, " + error.message);
        })
        // logger.info("Token got using refresh token ",token);
        // current time in milliseconds from 1st jan 1970
        token_timer = Date.now();
        return token;
    }else{
        logger.warn("refresh token is not found in File System"," correlationId Id: ",correlationId, " patient uhid: ",uhid);
        token = await axios.post(`https://accounts.zoho.in/oauth/v2/token?code=${envVariables.CODE}&client_id=${envVariables.CLIENT_ID}&client_secret=${envVariables.CLIENT_SECRET}&redirect_uri=https://www.zoho.in/books&grant_type=authorization_code`)
        .then(res =>{
            if (res.data.access_token) return res.data;
            else{
                logger.error(res.data.error," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                throw new Error(res.data.error);
            }
        })
        .catch(error=>{
            logger.error("step 2 error " + error.message," correlationId Id: ",correlationId, " patient uhid: ",uhid)
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
