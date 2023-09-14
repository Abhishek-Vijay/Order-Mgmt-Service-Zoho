const envVariables = require('../helper/envHelper');
const axios = require('axios');
const get_access_token = require('./access_token_Module');

// S3 related imports
const { S3Client, PutObjectCommand} = require("@aws-sdk/client-s3");
// Create an Amazon S3 service client object.
const s3Client = new S3Client({ region: envVariables.REGION });

let token;

var log4js = require('log4js');
const db = require('../db/DBModule');
var logger = log4js.getLogger();
logger.level = "debug";

let zohoServices = {};
let txn_logs = [];
let log_index = 1;

// var ORGANIZATION_ID = 60020823522;
// var CLIENT_ID = '1000.F5SXT96LTYLGTH1KIEAP3RRQW3NF9Y';
// var CLIENT_SECRET = 'c59989b20b948e43cc2dd9f96c3277e5619f281fe7';

axios.interceptors.response.use( undefined, async(err) => {
    const { config, response } = err;
    console.log("came in the Axios Interceptor");
    if (!config || !config.retry) {
      return Promise.reject(err);
    }
    // retry while Network timeout or Network Error
    logger.warn("Got response code ",response.status);
    if (!(response.status == 500 || response.status == 502 || response.status == 503 || response.status == 504)) {
        return Promise.reject(err);
    }
    config.retry -= 1;
    const delayRetryRequest = new Promise((resolve) => {
      setTimeout(() => {
        logger.warn("retrying the request......", config.url);
        resolve();
      }, config.retryDelay || 2000);
    });
    await delayRetryRequest;
    return axios(config);
  });

const accessToken = async(correlationId,uhid) =>{
    // Step 1 - get auth code using client_id and client_secret
        // Step 1 - To get access token using auth code
        if(token){
            // let token_time = await file.token_time_read().then(data => +data).catch(error => {
            //     logger.error(error);
            //     return;
            // });
            if(token_timer && ((Date.now()) - token_timer < (token.expires_in-300)*1000)){
                logger.info("token without any API call ",token.access_token," correlationId Id: ",correlationId, " patient uhid: ",uhid);
            }else{
                token = await get_access_token(uhid, correlationId);
                logger.info("token after API call because expired ",token.access_token," correlationId Id: ",correlationId, " patient uhid: ",uhid);
            }
        }else{
            token = await get_access_token(uhid, correlationId);
            logger.info("token after API call ",token.access_token," correlationId Id: ",correlationId, " patient uhid: ",uhid);
        }

        let config = {
            headers:{
                Authorization: `Zoho-oauthtoken ${token.access_token}`,
                'content-type': 'application/json'
            },
            retry: 3
        }
        return config;
}

// to create or update an user in zoho books
const zohoUserCreationOrUpdation = async(userObj, correlationId, uhid) =>{
    let config = await accessToken(correlationId,uhid);
    console.log(config);
    return axios.get(`https://www.zohoapis.in/books/v3/contacts?cf_uhid=${uhid}&organization_id=${envVariables.ORGANIZATION_ID}`,config)
            .then(res=>{
                if(res.data.contacts.length > 0){
                    logger.info("Step 2 successfull - Got customer id from zoho Books, won't create a new customer"," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                    // updation condition
                    if(uhid){
                        logger.info("Updation request received, updating contact info in books..."," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                        return axios.put(`https://www.zohoapis.in/books/v3/contacts/${res.data.contacts[0].contact_id}?organization_id=${envVariables.ORGANIZATION_ID}`,
                        userObj, config).then(response=>{
                            logger.info(response.data.message," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                            return `${response.data.message} for ${response.data.contact.contact_id}`
                        }).catch(err=>{
                            logger.error("User info updation failed in zoho books, " + err.response.data.message," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                            throw new Error("update user error, " + err.response.data.message);
                        })
                    }
                    return res.data.contacts[0].contact_id;
                }
                else{
                    logger.warn("couldn't find contact in books, creating contact..."," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                    return axios.post(`https://www.zohoapis.in/books/v3/contacts?organization_id=${envVariables.ORGANIZATION_ID}`,userObj,config).then(result=>{
                        logger.info("Step 2 successfull - created a new customer on the fly"," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                        return result.data.contact.contact_id;
                    }).catch(err=>{
                        logger.error("step 2 at creating user error " + err.response.data.message," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                        throw new Error("create user error, " + err.response.data.message);
                    })
                }
            })
            .catch(error=>{
                logger.error("step 2 at getting user error " + error.response.data.message," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                throw new Error("get user error, " + error.response.data.message);
            })
}

zohoServices.invoice = async(uhid, items_list, userObj, msg_id, correlationId, encounterId) =>{
    try {
        let config = await accessToken(correlationId, uhid); 
        // let testing = await axios.get('http://localhost:7000/testingAPI', config).then(res=>{
        //     console.log("promise resolved");
        //     console.log(res);
        // }).catch(err=>{
        //     console.log(err);
        //     console.log("promise rejected error");
        //     throw new Error(err);   // important to throw the error to call the interceptor
        // })

        // Step 3 - get ids of all the requested items using concept_id provided
        logger.trace("Step 3 started - getting ids of all the requested items using concept_id provided")
        let line_items = items_list.map(item =>{
            return axios.get(`https://www.zohoapis.in/books/v3/items?cf_concept_id=${item.conceptId}&organization_id=${envVariables.ORGANIZATION_ID}`,config)
            .then(result_res=>{
                if(result_res.data.items.length >0){
                let item_id = result_res.data.items[0].item_id;
                logger.info("item found with concept_id ",item.conceptId," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                txn_logs.push(`{${log_index}:"${"Step 3 : item found with concept_id =>"+ item.conceptId +", on message id =>"+msg_id+ ", patient uhid =>"+ uhid}"}`);
                log_index++;
                return {item_id,quantity:item.quantity}
                }
                logger.warn("no item found with concept_id "+ item.conceptId +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                txn_logs.push(`{${log_index}:"${"Step 3 : no item found with concept_id =>"+ item.conceptId +", on message id =>"+msg_id+ ", patient uhid =>"+ uhid}"}`);
                // log_index++;
                throw new Error("no item found with concept_id "+item.conceptId);
            }).catch(async err=>{
                if(err.response){
                    logger.error("step 3 at getting items list error " + err.response.data.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                    txn_logs.push(`{${log_index}:"${"Step 3 : getting items list error, " + err.response.data.message +", on message id =>"+msg_id+ ", patient uhid =>"+ uhid}"}`);
                    // log_index++;
                    await db.Order_Txn_Logs_Insert(msg_id, txn_logs);
                    txn_logs = [];
                    log_index = 1;
                    throw new Error("get items list error, " + err.response.data.message);
                }
                logger.error("step 3 at getting items list error " + err.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                await db.Order_Txn_Logs_Insert(msg_id, txn_logs);
                txn_logs = [];
                log_index = 1;
                throw new Error("get items list error, " + err.message);
            })
        })

        // Note - resolve line_items promise and once resolved only, then go forward
        logger.trace("resolving line_items promise started.....") 
        return Promise.all(line_items).then(async line_items_values=>{
            logger.info("line items ids found",line_items_values," correlationId Id: ",correlationId, " patient uhid: ",uhid);
            await db.Order_Txn_Logs_Insert(msg_id, txn_logs);
            txn_logs = [];

            // Step 2 - Get user id from zoho Books or create a new user on the fly
            logger.trace("Step 2 started - Getting user id from zoho Books or else creating a new user on the fly")
            let user_id = await zohoUserCreationOrUpdation(userObj,correlationId,uhid);

            let invoice_create_body = {
                "customer_id": user_id,
                "line_items": line_items_values,
                "payment_options": {
                    "payment_gateways": [
                        {
                            "configured": true,
                            "additional_field1": "standard",
                            "gateway_name": envVariables.PAYMENT_GATEWAY
                        }
                    ]
                }
            }

            // Step 4 - create invoice and get invoice id to use in send email api
            logger.trace("Step 4 started - creating invoice and getting invoice id to use in send email api")
            let invoice_details = await axios.post(`https://www.zohoapis.in/books/v3/invoices?organization_id=${envVariables.ORGANIZATION_ID}`, invoice_create_body, config)
            .then(response_result =>{
                logger.info(response_result.data.message," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                txn_logs.push(`{${log_index}:"${"Step 4 : Invoice is created successfully, " +"on message id =>"+msg_id+ ", patient uhid =>"+ uhid}"}`);
                log_index++;
                return response_result.data;
            }).catch(async err=>{
                logger.error("step 4 invoice creation error " + err.response.data.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                txn_logs.push(`{${log_index}:"${"Step 4 : Got error while creating Invoice, "+ err.response.data.message +", on message id =>"+msg_id+ " patient uhid =>"+ uhid}"}`);
                // log_index++;
                await db.Order_Txn_Logs_Update(msg_id, txn_logs);
                txn_logs = [];
                log_index = 1;
                throw new Error("invoice creation error, " + err.response.data.message);
            }) 

            // Step 5 - Email the generated invoice to user for further processing
            let email_body = {
                "send_from_org_email_id": false,
                "to_mail_ids": [
                    userObj.contact_persons[0].email
                ],
                "subject": `Invoice from Tata MD Healthcare (Invoice#: ${invoice_details.invoice.invoice_number})`,
                "body": `Dear Customer,         <br><br>Thanks for your business.         <br><br>The invoice ${invoice_details.invoice.invoice_number} is attached with this email. You can choose the easy way out and <a href= ${invoice_details.invoice.invoice_url.replace("/secure","/securepay")}  >pay online for this invoice.</a>         <br><br>Here's an overview of the invoice for your reference.         <br><br>Invoice Overview:         <br>Invoice  : ${invoice_details.invoice.invoice_number}         <br>Date : ${invoice_details.invoice.date}         <br>Amount : ${invoice_details.invoice.currency_symbol} ${invoice_details.invoice.total}         <br><br>Thank you for giving us this opportunity to serve you. In case of any queries, please reach out to us at 08069156999.<br><br>\nRegards<br>\nTata MD Healthcare<br>\n`
            }

            logger.trace("Step 5 started- Emailing the generated invoice to the customer for further processing.....")
            let success_msg = await axios.post(`https://www.zohoapis.in/books/v3/invoices/${invoice_details.invoice.invoice_id}/email?organization_id=${envVariables.ORGANIZATION_ID}`,email_body,config)
            .then(res=>{
                logger.info(res.data," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                txn_logs.push(`{${log_index}:"${"Step 5 : Invoice sent through Email to customer," +" on message id =>"+msg_id+ ", patient uhid =>"+ uhid}"}`);
                log_index++;
                return res.data;
            }).catch(async err=>{
                logger.error("sending Email to customer error, " + err.response.data.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, ", patient uhid: ",uhid)
                txn_logs.push(`{${log_index}:"${"Step 5 : sending Email to customer error, " + err.response.data.message +", on message id =>"+msg_id+ ", patient uhid: "+ uhid}"}`);
                // log_index++;
                await db.Order_Txn_Logs_Update(msg_id, txn_logs);
                txn_logs = [];
                log_index = 1;
                throw new Error("sending Email to customer error, " + err.response.data.message);
            })
            await db.Order_Txn_Logs_Update(msg_id, txn_logs);
            txn_logs = [];
            log_index = 1;

            // Step 6 - Get Invoice in pdf format and save it to amazon S3 bucket
            let new_config = config;
            new_config['responseType'] = 'arraybuffer'
            let invoice_in_pdf = await axios.get(`https://www.zohoapis.in/books/v3/invoices/${invoice_details.invoice.invoice_id}?organization_id=${envVariables.ORGANIZATION_ID}&accept=pdf`,new_config)
            .then(res=>{
                logger.info(res.data," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                return res.data
            }).catch(err=>{
                logger.error("Getting invoice in pdf format error, " + err.response.data.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                // throw new Error("Getting invoice in pdf format error, " + err.response.data.message);
            })

            // Set the parameters for S3 Bucket
            const params = {
                Bucket: `${envVariables.S3_BUCKET}`, // The name of the bucket. For example, 'sample-bucket-101'.
                Key: `${envVariables.DEPLOYMENT_ENV}/${envVariables.S3_FOLDER}/${uhid}/${encounterId}/${invoice_details.invoice.invoice_number}.pdf`, // The name of the object. For example, 'sample_upload.txt'.
                Body: invoice_in_pdf, // The content of the object. For example, 'Hello world!".
            };

            let s3_bucket_url;
            try {
                const results = await s3Client.send(new PutObjectCommand(params));
                logger.info("Successfully created " + params.Key + " and uploaded it to " + params.Bucket + "/" + params.Key);
                // return results; // For unit tests.
                s3_bucket_url = `https://${envVariables.S3_BUCKET}.s3.${envVariables.REGION}.amazonaws.com/${envVariables.DEPLOYMENT_ENV}/${envVariables.S3_FOLDER}/${uhid}/${encounterId}/${invoice_details.invoice.invoice_number}.pdf`
              } catch (err) {
                logger.error("Error while uploading invoice pdf in S3 Bucket: ", err);
            }

            if(success_msg){
                let invoice_no = invoice_details.invoice.invoice_number;
                let invoice_url = invoice_details.invoice.invoice_url;
                return {msg_id, invoice_no, invoice_url, s3_bucket_url, correlationId};
            }
        }).catch(error=>{
            if(error.response){
                logger.error("Promise resolve error for list of items array, " + error.response.data.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                throw new Error("Promise resolve error for list of items array, " + error.response.data.message +" on message id <>"+msg_id+"<> correlationId Id ->"+correlationId); 
            }
            logger.error("Promise resolve error for list of items array, " + error.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
            throw new Error("Promise resolve error for list of items array, " + error.message +" on message id <>"+msg_id+"<> correlationId Id ->"+correlationId);
        })
    } catch (error) {
        logger.error("before final Error"," correlationId Id: ",correlationId, " patient uhid: ",uhid);
        throw new Error(error);
    }
    
}

module.exports = {zohoServices, zohoUserCreationOrUpdation};