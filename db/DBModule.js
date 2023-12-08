const { reject } = require('lodash');
const envVariables = require('../helper/envHelper');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

// postgres DB connection
const Pool = require('pg').Pool
const pool = new Pool({
    user: envVariables.DB.POSTGRES_USER,
    host: envVariables.DB.POSTGRES_HOST,
    database: envVariables.DB.POSTGRES_DATABASE,
    password: envVariables.DB.POSTGRES_PASSWORD,
    port: envVariables.DB.POSTGRES_PORT,
})

const { UUIDGenerator } = require('../helper/generator');

let DBModule = {};


// Patient get ALL Query
DBModule.Patient_getAll = () =>{
    return new Promise((resolve, reject) =>{
        // postgres DB changes 
        pool.query('select * from PATIENT', (error, results) => {
            if (error) {
                logger.error(error," correlationId Id: ",correlationId);
                reject(error);
            }
            // response.status(200).json(results.rows)
            logger.info("Patient's Result ",results.rows);
        })
    })
}

// UC_ORDER get ALL Query
DBModule.Order_getAll = () =>{
    return new Promise((resolve, reject) =>{
        // postgres DB changes 
        pool.query('select * from UC_ORDER', (error, results) => {
            if (error) {
                logger.error(error," correlationId Id: ",correlationId);
                reject(error);
            }
            // response.status(200).json(results.rows)
            logger.info("UC_ORDER's Result ",results.rows);
        })
    })
}

// Patient Meta-Data Insertion Query
DBModule.Patient_Insert = (clinical_uhid, uuid, correlationId) =>{
    return new Promise((resolve, reject) =>{
        pool.query('select * from PATIENT where clinical_uhid = $1', [clinical_uhid] ,(error,res) => {
            if (error) {
                logger.error(error," correlationId Id: ",correlationId);
                reject(error);
            }else{
                if(res.rows.length == 0){
                    let current_date = new Date();
                    // let id = UUIDGenerator();
                    pool.query('INSERT INTO PATIENT (clinical_uhid, uuid, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING *', [clinical_uhid, uuid, current_date], (error, results) => {
                        if (error) {
                            logger.error(error," correlationId Id: ",correlationId);
                            reject(error);
                        }
                        logger.info("Inserting the row in PATIENT Table ",results.rows[0].clinical_uhid," correlationId Id: ",correlationId);
                        resolve(results.rows[0].clinical_uhid);
                    })
                }else{
                    logger.info("The record is already present in PATIENT Table ",res.rows[0].clinical_uhid," correlationId Id: ",correlationId);
                    resolve(res.rows[0].clinical_uhid);
                }
            }
        })
    })
}

// Patient Meta-Data Updation Query
DBModule.Patient_Update = (clinical_uhid, zoho_contact_id, correlationId) =>{
    let current_date = new Date();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE PATIENT SET ZOHO_CONTACT_ID = $2, UPDATED_AT = $3 WHERE clinical_uhid = $1', [clinical_uhid, zoho_contact_id, current_date], (error, results) => {
            if (error) {
                logger.error(error," correlationId Id: ",correlationId);
                reject(error);
            }
            logger.info("Updating the row in PATIENT Table ",results.rowCount," correlationId Id: ",correlationId);
            resolve(results.rowCount);
        })
    })
}

DBModule.update_subscription_details = (subscriptionId, clinical_uhid, payment_status,subscription_status,planCode, start_date, end_date) =>{
    let updated_date = new Date();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE UC_SUBSCRIPTION SET subscription_id = $1,subscription_status = $2,payment_status = $3,updated_at = $4,start_date = $7,end_date = $8 WHERE clinical_uhid = $5 and billing_plan_code = $6', [subscriptionId, subscription_status,payment_status,updated_date,clinical_uhid,planCode,start_date,end_date], (error, results) => {
            if (error) {
                logger.error('Error while updating the subscription details',error);
                reject(error);
            }
            logger.info("Updating the row in subscription Table ",results.rowCount);
            resolve(results.rowCount);
        })
    })
}

// UC_ORDER Insertion Query
DBModule.Order_Insert = (id, encounter_id, clinical_uhid, order_details, correlationId) =>{
    return new Promise((resolve, reject) =>{
        pool.query('select * from UC_ORDER where id = $1', [id] ,(error,res) => {
            if (error) {
                logger.error(error," correlationId Id: ",correlationId);
                reject(error);
            }else{
                if(res.rows.length == 0){
                    let current_date = new Date();
                    let processing_status = 'IN_PROGRESS';
                    pool.query('INSERT INTO UC_ORDER (id, encounter_id, clinical_uhid, order_details, invoice_number, invoice_url, s3_bucket_url, processing_status, created_at, updated_at) VALUES ($1, $2, $3, $4, null, null, null, $5, $6, $6) RETURNING *', [id, encounter_id, clinical_uhid, order_details, processing_status, current_date], (error, results) => {
                        if (error) {
                            logger.error(error," correlationId Id: ",correlationId);
                            reject(error);
                        }
                        logger.info("Inserting the row in UC_ORDER Table ",results.rowCount," correlationId Id: ",correlationId);
                        resolve(results.rowCount);
                    })
                }else{
                    logger.warn("The record is already present in UC_ORDER Table "+res.rows[0].processing_status," correlationId Id: ",correlationId);
                    resolve(res.rows[0].processing_status);
                }
            }
        })
    })
    
} 

// UC_ORDER Invoice Updation Query
DBModule.Order_Update_Invoice = (id, invoice_number, invoice_url, s3_bucket_url, processing_status, payment_status, correlationId) =>{
    let current_date = new Date();
    return new Promise((resolve, reject) =>{
        // console.log(id, invoice_number, processing_status);
        pool.query('UPDATE UC_ORDER SET invoice_number = $2, invoice_url = $5, s3_bucket_url = $6, processing_status = $3, payment_status = $7, UPDATED_AT = $4 WHERE id = $1',[id, invoice_number, processing_status, current_date, invoice_url, s3_bucket_url, payment_status], (error, results) => {
            if (error) {
                logger.error(error," correlationId Id: ",correlationId);
                reject(error);
            }
            logger.info("Updating the row in UC_ORDER Table - Invoice ",results.rowCount," correlationId Id: ",correlationId);
            resolve(results.rowCount);
        }) 
    })   
}

// UC_ORDER Payment Updation Query
DBModule.Order_Update_Payment = (invoice_number, processing_status, payment_status) =>{
    let current_date = new Date();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE UC_ORDER SET processing_status = $2, payment_status = $3, UPDATED_AT = $4 WHERE invoice_number = $1 RETURNING *',[invoice_number, processing_status, payment_status, current_date], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rows[0]){
                logger.info("Updating the Payment status in UC_ORDER Table - clinical uhid: ",results.rows[0].clinical_uhid, "encounter id: ",results.rows[0].encounter_id);
            }else{
                logger.info("No Record found to update Payment status in UC_ORDER Table for - invoice number: ",invoice_number);
            }
            resolve(results.rowCount);
        }) 
    })   
}

// UC_ORDER Invoice URL search Query
DBModule.Order_Invoice_Urls = (uuid) =>{
    // let current_date = new Date();
    return new Promise((resolve, reject) =>{
        pool.query('Select uc_order.encounter_id, uc_order.invoice_number, uc_order.invoice_url, uc_order.processing_status, uc_order.clinical_uhid, uc_order.payment_status, uc_order.created_at from UC_ORDER uc_order inner join Patient p on p.clinical_uhid = uc_order.clinical_uhid WHERE p.uuid = $1',[uuid], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rows[0]){
                logger.info("Found the invoice url in UC_ORDER Table for -  uuid: ",uuid, "encounter id: ",results.rows[0].encounter_id);
            }else{
                logger.info("No Record found to get invoice url in UC_ORDER Table for - uuid: ",uuid);
            }
            resolve(results.rows);
        }) 
    })   
}

DBModule.get_customer_id = (uuid) =>{
    return new Promise((resolve, reject) =>{
        pool.query('Select clinical_uhid from PATIENT p WHERE p.uuid = $1',[uuid], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rows[0]){
                logger.info("Found the customerId in PATIENT table with uuid: ",uuid);
            }else{
                logger.info("No Record found to get customerId in PATIENT table with uuid: ",uuid);
            }
            resolve(results.rows[0]);
        })
    })
}

DBModule.get_patient_uuid = (clinical_uhid) =>{
    return new Promise((resolve, reject) =>{
        pool.query('Select uuid from PATIENT p WHERE p.clinical_uhid = $1',[clinical_uhid], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rows[0]){
                logger.info("Found the uuid in PATIENT table with clinical_uhid: ",clinical_uhid);
            }else{
                logger.info("No Record found to get uuid in PATIENT table with clinical_uhid: ",clinical_uhid);
            }
            resolve(results.rows[0].uuid);
        })
    })
}

DBModule.get_clinical_uhid = (customerId) =>{
    return new Promise((resolve, reject) =>{
        pool.query('Select clinical_uhid from PATIENT p WHERE p.customer_id = $1',[customerId], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rows[0]){
                logger.info("Found the customerId in PATIENT table with customerId: ",customerId, "customerId: ",results.rows[0].clinical_uhid);
            }else{
                logger.info("No Record found to get customerId in PATIENT table with customerId: ",customerId);
            }
            resolve(results.rows[0].clinical_uhid);
        })
    })
}

// ORDER_TXN_LOGS insertion Query
DBModule.Order_Txn_Logs_Insert = (order_msg_id, logs_arr) =>{
    let current_date = new Date();
    let id = UUIDGenerator();
    return new Promise((resolve, reject) =>{
        pool.query('INSERT INTO ORDER_TXN_LOGS (id, order_msg_id, order_logs, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING *',[id, order_msg_id, logs_arr, current_date], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            logger.info("Inserting zoho txn logs in ORDER_TXN_LOGS Table - order msg id: ",results.rows[0].order_msg_id);
            resolve(results.rows[0].id);
        })
    })
}

// New Table SUBSCRIPTION_PLANS
DBModule.Insert_plan_table = (plan_code, plan_name) =>{
    return new Promise((resolve, reject) =>{
        pool.query('select * from SUBSCRIPTION_PLANS where plan_code = $1', [plan_code] ,(error,res) => {
            if (error) {
                logger.error(error);
                reject(error);
            }else{
                if(res.rows.length == 0){
                    pool.query('INSERT INTO SUBSCRIPTION_PLANS (plan_code, plan_name) VALUES ($1, $2) RETURNING *',[plan_code, plan_name], (error, results) => {
                        if (error) {
                            logger.error(error);
                            reject(error);
                        }
                        logger.info("Inserting subscription details in SUBSCRIPTION_PLANS Table - plan_code: ",results.rows[0].plan_code);
                        resolve(results.rows[0].plan_code);
                    })
                }else{
                    logger.warn("The record is already present in SUBSCRIPTION_PLANS Table "+res.rows[0].plan_code);
                    resolve(res.rows[0]);
                }
            }
        })
    })
}

// Getting plan name using plan code from SUBSCRIPTION_PLANS
DBModule.get_plan_name = (plan_code) =>{
    return new Promise((resolve, reject) =>{
        pool.query('Select plan_name from SUBSCRIPTION_PLANS WHERE plan_code = $1',[plan_code], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rows[0]){
                logger.info("Found the plan_name in SUBSCRIPTION_PLANS table  ",results.rows[0].plan_name);
            }else{
                logger.info("No Record found to get plan_name in SUBSCRIPTION_PLANS table with plan_code: ", plan_code);
            }
            // need to update if not available 
            resolve(results.rows[0].plan_name);
        })
    })
}

DBModule.create_subscription_logs = (clinical_uhid, billing_plan_code) =>{
    return new Promise((resolve, reject) =>{
        pool.query('select * from UC_SUBSCRIPTION where clinical_uhid = $1 and billing_plan_code = $2', [clinical_uhid, billing_plan_code] ,(error,res) => {
            if (error) {
                logger.error(error);
                reject(error);
            }else{
                if(res.rows.length == 0){
                    let created_at = new Date();
                    let id = UUIDGenerator();
                    let subscription_status = 'REQUESTED';
                    let payment_status = 'NIL';
                    let requested_count = 1;
                    pool.query('INSERT INTO UC_SUBSCRIPTION (id, clinical_uhid, billing_plan_code, subscription_status,payment_status,requested_count,created_at,updated_at) VALUES ($1, $2, $3, $4, $5, $7, $6,$6) RETURNING *',[id, clinical_uhid, billing_plan_code,subscription_status,payment_status,created_at, requested_count], (error, results) => {
                        if (error) {
                            logger.error(error);
                            reject(error);
                        }
                        logger.info("Inserting subscription details in subscription Table - id: ",results.rows[0].id);
                        resolve(results.rows[0]);
                    })
                }else{
                    logger.warn("The record is already present in UC_SUBSCRIPTION Table "+res.rows[0].billing_plan_code);
                    resolve(res.rows[0]);
                }
            }
        })
    })
}

// Fetch Subscription Details -
DBModule.get_user_subscription = (uuid) =>{
    return new Promise((resolve, reject) =>{
        pool.query(`select sp.plan_code, sp.plan_name from uc_subscription us 
        inner join patient p on p.clinical_uhid  = us.clinical_uhid 
        inner join subscription_plans sp on sp.plan_code = us.billing_plan_code 
        where p.uuid = $1 and us.subscription_status = 'SUBSCRIBED'`,[uuid], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rowCount){
                logger.info("Found subscription count in UC_SUBSCRIPTION Table - Total Count: ", results.rowCount);
            }else{
                logger.info("No Record found to in UC_SUBSCRIPTION Table to show as subscription for patient:", uuid);
            }
            resolve(results.rows);
        }) 
    })
}

// update requested count for non-subscribed plans
DBModule.update_subscription_requestCount = (count, clinical_uhid, billing_plan_code) =>{
    let current_date = new Date();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE UC_SUBSCRIPTION set requested_count = $1, updated_at = $2 where clinical_uhid = $3 and billing_plan_code = $4 RETURNING *',[count, current_date, clinical_uhid, billing_plan_code], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rows[0]){
                logger.info("Updating requested_count in UC_SUBSCRIPTION Table - Total Count: ", count);
            }else{
                logger.info("No Record found to update requested_count in UC_SUBSCRIPTION Table");
            }
            resolve(results.rowCount);
        }) 
    })
}

// ORDER_TXN_LOGS Updation Query
DBModule.Order_Txn_Logs_Update = (order_id, logs_arr) =>{
    let current_date = new Date();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE ORDER_TXN_LOGS set order_logs = (select order_logs from ORDER_TXN_LOGS where order_msg_id = $1) || $2, UPDATED_AT = $3 where order_msg_id = $1 RETURNING *',[order_id, logs_arr, current_date], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            if(results.rows[0]){
                logger.info("Updating zoho txn logs in ORDER_TXN_LOGS Table - order msg id: ",results.rows[0].order_msg_id);
            }else{
                logger.info("No Record found to update zoho txn logs in ORDER_TXN_LOGS Table for - order id: ",order_id);
            }
            resolve(results.rowCount);
        }) 
    }) 
}

// ORDER_TXN_LOGS Webhook Updation Query
DBModule.Order_Txn_Logs_Webhook_Update = (invoice_number, logs) =>{
    return new Promise((resolve, reject) =>{
        pool.query('select otl.order_msg_id, array_length(otl.order_logs,1) from order_txn_logs otl inner join uc_order uo on otl.order_msg_id = uo.id where uo.invoice_number = $1',[invoice_number], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            resolve(results);
        }) 
    }).then(async res=>{
        if(res.rows[0]){
            logger.info("Updating zoho txn logs in ORDER_TXN_LOGS Table for - invoice number: ",invoice_number)
            let logs_arr = [`{${res.rows[0].array_length+1}:"${"Payment Logs : " + logs +", for invoice number =>"+ invoice_number}"}`];
            await DBModule.Order_Txn_Logs_Update(res.rows[0].order_msg_id, logs_arr);
        }else{
            logger.info("No Record found to update zoho txn logs in ORDER_TXN_LOGS Table for - invoice number: ",invoice_number);
        }
    }).catch(err=>{
        reject(err);
    })
}

module.exports = DBModule;