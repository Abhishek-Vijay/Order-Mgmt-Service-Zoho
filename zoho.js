const axios = require('axios');
const get_access_token = require('./access_token_Module');

let token;

var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "all"

let zohoServices = {};

// var organization_id = 60020823522;
// var clientId = '1000.F5SXT96LTYLGTH1KIEAP3RRQW3NF9Y';
// var clientsecret = 'c59989b20b948e43cc2dd9f96c3277e5619f281fe7';
zohoServices.invoice = async(uhid, items_list, userObj, msg_id, correlationId) =>{
    try {
        // Step 1 - get auth code using client_id and client_secret
        // Step 2 - To get access token using auth code
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
            }
        }

        // Step 3 - get ids of all the requested items using concept_id provided
        logger.trace("Step 3 started - getting ids of all the requested items using concept_id provided")
        let line_items = items_list.map(item =>{
            return axios.get(`https://www.zohoapis.in/books/v3/items?cf_concept_id=${item.conceptId}&process.env.organization_id=${process.env.organization_id}`,config)
            .then(result_res=>{
                if(result_res.data.items.length >0){
                let item_id = result_res.data.items[0].item_id;
                logger.info("item found with concept_id ",item.conceptId," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                return {item_id,quantity:item.quantity}
                }
                logger.warn("no item found with concept_id "+ item.conceptId +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                throw new Error("no item found with concept_id "+item.conceptId);
            }).catch(err=>{
                logger.error("step 3 at getting items list error " + err.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                throw new Error("get items list error, " + err.message);
            })
        })

        // Note - resolve line_items promise and once resolved only, then go forward
        logger.trace("resolving line_items promise started.....") 
        return Promise.all(line_items).then(async line_items_values=>{
            logger.info("line items ids found",line_items_values," correlationId Id: ",correlationId, " patient uhid: ",uhid);

            // Step 4 - Get user id from zoho Books or create a new user on the fly
            logger.trace("Step 4 started - Getting user id from zoho Books or else creating a new user on the fly")
            let user_id = await axios.get(`https://www.zohoapis.in/books/v3/contacts?cf_uhid=${uhid}&process.env.organization_id=${process.env.organization_id}`,config)
            .then(res=>{
                if(res.data.contacts.length > 0){
                    logger.info("Step 4 successfull - Got customer id from zoho Books"," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                    return res.data.contacts[0].contact_id;
                }
                else{
                    logger.warn("couldn't find contact in books, creating contact..."," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                    return axios.post(`https://www.zohoapis.in/books/v3/contacts?process.env.organization_id=${process.env.organization_id}`,userObj,config).then(result=>{
                        logger.info("Step 4 successfull - created a new customer on the fly"," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                        return result.data.contact.contact_id;
                    }).catch(err=>{
                        logger.error("step 4 at creating user error " + err.message," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                        throw new Error("create user error, " + err.message);
                    })
                }
            })
            .catch(error=>{
                logger.error("step 4 at getting user error " + error.message," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                throw new Error("get user error, " + error.message);
            })

            let invoice_create_body = {
                "customer_id": user_id,
                "line_items": line_items_values,
                "payment_options": {
                    "payment_gateways": [
                        {
                            "configured": true,
                            "additional_field1": "standard",
                            "gateway_name": process.env.PAYMENT_GATEWAY
                        }
                    ]
                }
            }

            // Step 5 - create invoice and get invoice id to use in send email api
            logger.trace("Step 5 started - creating invoice and getting invoice id to use in send email api")
            let invoice_details = await axios.post(`https://www.zohoapis.in/books/v3/invoices?process.env.organization_id=${process.env.organization_id}`, invoice_create_body, config)
            .then(response_result =>{
                logger.info(response_result.data.message," correlationId Id: ",correlationId, " patient uhid: ",uhid);
                return response_result.data;
            }).catch(err=>{
                logger.error("step 5 invoice creation error " + err.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                throw new Error("invoice creation error, " + err.message);
            }) 

            // Step 6 - Email the generated invoice to user for further processing
            let email_body = {
                "send_from_org_email_id": false,
                "to_mail_ids": [
                    userObj.contact_persons[0].email
                ],
                "subject": `Invoice from Tata Urban Clinic (Invoice#: ${invoice_details.invoice.invoice_number})`,
                "body": `Dear Customer,         <br><br>Thanks for your business.         <br><br>The invoice ${invoice_details.invoice.invoice_number} is attached with this email. You can choose the easy way out and <a href= ${invoice_details.invoice.invoice_url.replace("/secure","/securepay")}  >pay online for this invoice.</a>         <br><br>Here's an overview of the invoice for your reference.         <br><br>Invoice Overview:         <br>Invoice  : ${invoice_details.invoice.invoice_number}         <br>Date : ${invoice_details.invoice.date}         <br>Amount : ${invoice_details.invoice.currency_symbol} ${invoice_details.invoice.total}         <br><br>It was great working with you. Looking forward to working with you again.<br><br>\nRegards<br>\nTata Urban Clinic<br>\n`
            }

            logger.trace("Step 6 started- Emailing the generated invoice to the customer for further processing.....")
            let success_msg = await axios.post(`https://www.zohoapis.in/books/v3/invoices/${invoice_details.invoice.invoice_id}/email?process.env.organization_id=${process.env.organization_id}`,email_body,config)
            .then(res=>{
                logger.info(res.data," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                return res.data
            }).catch(err=>{
                logger.error("Email sending to user error, " + err.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
                throw new Error("Email sending to user error, " + err.message);
            })

            if(success_msg){
                let invoice_no = invoice_details.invoice.invoice_number
                return {msg_id, invoice_no, correlationId};
            }
        }).catch(error=>{
            logger.error("Promise resolve error for list of items array, " + error.message +" on message id =>"+msg_id," correlationId Id: ",correlationId, " patient uhid: ",uhid)
            throw new Error("Promise resolve error for list of items array, " + error.message +" on message id <>"+msg_id+"<> correlationId Id ->"+correlationId);
        })
    } catch (error) {
        logger.error("before final Error"," correlationId Id: ",correlationId, " patient uhid: ",uhid);
        throw new Error(error);
    }
    
}

module.exports = zohoServices;