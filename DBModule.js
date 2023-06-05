var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "all"

// postgres DB connection
const Pool = require('pg').Pool
const pool = new Pool({
    user: process.env.POSTGRES_user,
    host: process.env.POSTGRES_host,
    database: process.env.POSTGRES_database,
    password: process.env.POSTGRES_password,
    port: process.env.POSTGRES_port,
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
                reject(error);
            }
            // response.status(200).json(results.rows)
            logger.info("UC_ORDER's Result ",results.rows);
        })
    })
}

// Patient Meta-Data Insertion Query
DBModule.Patient_Insert = (clinical_patient_id, clinical_UUid) =>{
    return new Promise((resolve, reject) =>{
        pool.query('select * from PATIENT where clinical_patient_id = $1 and clinical_UUid = $2', [clinical_patient_id, clinical_UUid] ,(error,res) => {
            if (error) {
                reject(error);
            }else{
                if(res.rows.length == 0){
                    let current_date = new Date().toLocaleString();
                    let id = UUID();
                    pool.query('INSERT INTO PATIENT (ID, clinical_patient_id, clinical_UUid, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING *', [id, clinical_patient_id, clinical_UUid, current_date], (error, results) => {
                        if (error) {
                            reject(error);
                        }
                        logger.info("Inserting the row in PATIENT Table ",results.rows[0].id);
                        resolve(results.rows[0].id);
                    })
                }else{
                    logger.info("The record is already present in PATIENT Table ",res.rows[0].id);
                    resolve(res.rows[0].id);
                }
            }
        })
    })
}

// Patient Meta-Data Updation Query
DBModule.Patient_Update = (id) =>{
    let current_date = new Date().toLocaleString();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE PATIENT SET UPDATED_AT = $2 WHERE id = $1', [id, current_date], (error, results) => {
            if (error) {
                reject(error);
            }
            logger.info("Updating the row in PATIENT Table ",results.rows);
        })
    })
}

// UC_ORDER Insertion Query
DBModule.Order_Insert = (order_id, patient_id , order_details) =>{
    return new Promise((resolve, reject) =>{
        pool.query('select * from UC_ORDER where order_id = $1', [order_id] ,(error,res) => {
            if (error) {
                reject(error);
            }else{
                if(res.rows.length == 0){
                    let current_date = new Date().toLocaleString();
                    let processing_status = 'IN_PROGRESS';
                    pool.query('INSERT INTO UC_ORDER (order_id, patient_id, order_details, invoice_number , processing_status, created_at, updated_at) VALUES ($1, $2, $3, null, $4, $5, $5) RETURNING *', [order_id, patient_id, order_details, processing_status, current_date], (error, results) => {
                        if (error) {
                            reject(error);
                        }
                        logger.info("Inserting the row in UC_ORDER Table ",results.rowCount);
                        resolve(results.rowCount);
                    })
                }else{
                    logger.warn("The record is already present in UC_ORDER Table "+res.rows[0].processing_status);
                    reject("The record is already present in UC_ORDER Table:"+res.rows[0].processing_status);
                }
            }
        })
    })
    
} 

// UC_ORDER Invoice Updation Query
DBModule.Order_Update_Invoice = (order_id, invoice_number, processing_status) =>{
    let current_date = new Date().toLocaleString();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE UC_ORDER SET invoice_number = $2, processing_status = $3, UPDATED_AT = $4 WHERE order_id = $1',[order_id, invoice_number, processing_status, current_date], (error, results) => {
            if (error) {
                reject(error);
            }
            logger.info("Updating the row in UC_ORDER Table - Invoice ",results.rowCount);
            resolve(results.rowCount);
        }) 
    })   
}

// UC_ORDER Payment Updation Query
DBModule.Order_Update_Payment = (invoice_number, processing_status) =>{
    let current_date = new Date().toLocaleString();
    return new Promise((resolve, reject) =>{
        pool.query('UPDATE UC_ORDER SET processing_status = $2, UPDATED_AT = $3 WHERE invoice_number = $1',[invoice_number, processing_status, current_date], (error, results) => {
            if (error) {
                reject(error);
            }
            logger.info("Updating the row in UC_ORDER Table - Payment ",results.rowCount);
            resolve(results.rowCount);
        }) 
    })   
}


module.exports = DBModule;