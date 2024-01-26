const envVariables = require('../helper/envHelper');
const axios = require('axios');
// const file = require("./File_Ops");
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

let token;
let token_timer = 0;
const accessToken = async(uhid) =>{
    // Step 1 - get auth code using client_id and client_secret
        // Step 1 - To get access token using auth code
        if(token){
            // let token_time = await file.token_time_read().then(data => +data).catch(error => {
            //     logger.error(error);
            //     return;
            // });
            console.log("token timer here ",token_timer);
            console.log("token here ", token);
            if(token_timer && ((Date.now()) - token_timer < (token.expires_in-300)*1000)){
                logger.info("token without any API call ",token.access_token," patient uhid: ",uhid);
            }else{
                token = await get_access_token();
                logger.info("token after API call because expired ",token.access_token," patient uhid: ",uhid);
            }
        }else{
            token = await get_access_token();
            logger.info("token after API call ",token.access_token," patient uhid: ",uhid);
        }

        // let config = {
        //     headers:{
        //         Authorization: `Zoho-oauthtoken ${token.access_token}`,
        //         'content-type': 'application/json'
        //     },
        //     retry: 3
        // }
        return token.access_token;
}

const get_access_token = async() =>{
    // let refresh_token = await file.refresh_token_read().then(data => data).catch(error => {
    //     logger.error(error);
    //     return;
    // });
    let refresh_token = envVariables.REFRESH_TOKEN
    if(refresh_token){
        const token = await axios.post(`https://accounts.zoho.in/oauth/v2/token?refresh_token=${refresh_token}&client_id=${envVariables.CLIENT_ID}&client_secret=${envVariables.CLIENT_SECRET}&redirect_uri=https://uc-portal.tatamd.com/&grant_type=refresh_token`)
        .then(resp=>{
            if (resp.data.access_token) return resp.data;
            else{
               // logger.error(resp.data.error," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                // txn_logs.push(`{${log_index}:"${"Step 1 - got access token error after API call, "+ resp.data.error +", patient uhid =>"+ uhid}"}`);
                throw new Error(resp.data.error)
            }
        })
        .catch(error=>{
          //  logger.error("step 1 error " + error.response.data.message," correlationId Id: ",correlationId, " patient uhid: ",uhid);
            // txn_logs.push(`{${log_index}:"${"Step 1 - got error while trying to get access token from API call, "+ error.response.data.message +", patient uhid =>"+ uhid}"}`);
            // log_index++;
            throw new Error("access token error, " + error.response.data.message);
        })
        // logger.info("Token got using refresh token ",token);
        // current time in milliseconds from 1st jan 1970
        token_timer = Date.now();
        return token;
    }else{
    //    logger.warn("refresh token is not found in File System"," correlationId Id: ",correlationId, " patient uhid: ",uhid);
        const token = await axios.post(`https://accounts.zoho.in/oauth/v2/token?code=${envVariables.CODE}&client_id=${envVariables.CLIENT_ID}&client_secret=${envVariables.CLIENT_SECRET}&redirect_uri=https://uc-portal.tatamd.com/&grant_type=authorization_code`)
        .then(res =>{
            if (res.data.access_token) return res.data;
            else{
             //   logger.error(res.data.error," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                throw new Error(res.data.error);
            }
        })
        .catch(error=>{
        //    logger.error("step 2 error " + error.response.data.message," correlationId Id: ",correlationId, " patient uhid: ",uhid)
            throw new Error("access token error, " + error.response.data.message);
        })
        // logger.info("Token got using auth code ",token);
        // caching the refresh token and expiration time - 
        // file.refresh_token_write(token.refresh_token);
        // current time in milliseconds from 1st jan 1970
        token_timer = Date.now();

        return token;
    }
    
}

const get_billing_access_token = async() =>{
   let refresh_token = envVariables.REFRESH_TOKEN;
    if(refresh_token){
        const token = await axios.post(`https://accounts.zoho.in/oauth/v2/token?refresh_token=${refresh_token}&client_id=${envVariables.CLIENT_ID}&client_secret=${envVariables.CLIENT_SECRET}&redirect_uri=https://uc-portal.tatamd.com/&grant_type=refresh_token`)
        .then(resp=>{
            if (resp.data.access_token) {
             return resp.data.access_token;}

            else{
                throw new Error(resp.data.error)
            }
        })
        .catch(error=>{
            throw new Error("access token error, " + error.response.data.message);
        })
        // current time in milliseconds from 1st jan 1970
        // token_timer = Date.now();
        return token;
    }
    }


module.exports = {accessToken,get_access_token,get_billing_access_token};
