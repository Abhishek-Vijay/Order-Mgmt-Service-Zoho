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

// uuid import 
const { v4: uuidv4 } = require('uuid');

let DBModule = {};

const UUID = () =>{
    // uuid generation 
    let new_uuid = uuidv4();
    logger.info('Your UUID is: ' + new_uuid);
    return new_uuid;
}

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
                    let current_date = new Date().toLocaleString();
                    // let id = UUID();
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
DBModule.Patient_Update = (clinical_uhid, correlationId) =>{
    let current_date = new Date().toLocaleString();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE PATIENT SET UPDATED_AT = $2 WHERE id = $1', [clinical_uhid, current_date], (error, results) => {
            if (error) {
                logger.error(error," correlationId Id: ",correlationId);
                reject(error);
            }
            logger.info("Updating the row in PATIENT Table ",results.rows," correlationId Id: ",correlationId);
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
                    let current_date = new Date().toLocaleString();
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
DBModule.Order_Update_Invoice = (id, invoice_number, invoice_url, s3_bucket_url, processing_status, correlationId) =>{
    let current_date = new Date().toLocaleString();
    return new Promise((resolve, reject) =>{
        // console.log(id, invoice_number, processing_status);
        pool.query('UPDATE UC_ORDER SET invoice_number = $2, invoice_url = $5, s3_bucket_url = $6, processing_status = $3, UPDATED_AT = $4 WHERE id = $1',[id, invoice_number, processing_status, current_date, invoice_url, s3_bucket_url], (error, results) => {
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
DBModule.Order_Update_Payment = (invoice_number, processing_status) =>{
    let current_date = new Date().toLocaleString();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE UC_ORDER SET processing_status = $2, UPDATED_AT = $3 WHERE invoice_number = $1 RETURNING *',[invoice_number, processing_status, current_date], (error, results) => {
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
    // let current_date = new Date().toLocaleString();
    return new Promise((resolve, reject) =>{
        pool.query('Select uc_order.encounter_id, uc_order.invoice_number, uc_order.invoice_url, uc_order.processing_status from UC_ORDER uc_order inner join Patient p on p.clinical_uhid = uc_order.clinical_uhid WHERE p.uuid = $1',[uuid], (error, results) => {
            if (error) {
                logger.error(error);
                reject(error);
            }
            // console.log("search Query result ", results.rows);
            if(results.rows[0]){
                logger.info("Found the invoice url in UC_ORDER Table - clinical uhid: ",results.rows[0].clinical_uhid, "encounter id: ",results.rows[0].encounter_id);
            }else{
                logger.info("No Record found to update Payment status in UC_ORDER Table for - invoice number: ",invoice_number);
            }
            resolve(results.rows);
        }) 
    })   
}


module.exports = DBModule;