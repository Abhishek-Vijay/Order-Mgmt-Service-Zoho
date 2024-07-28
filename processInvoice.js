const envVariables = require('./helper/envHelper');
const { zohoServices } = require('./zohoService/zoho');
const db = require('./db/DBModule');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

// Import required AWS SDK clients and commands for Node.js
const { SQSClient, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
// Create SQS service object.
const sqsClient = new SQSClient({region: envVariables.REGION});

const processInvoiceMessage = async(message) => {
    try{
    // Process the message here
    logger.info('Received message:', message.Body);
    let msg = JSON.parse(message.Body);
    logger.info("Processing for the customer with"," correlation Id: ",msg.key.correlationId, " patient uhid: ",msg.key.clinicalUhid," encounter Id: ",msg.key.encounterId)

    // checking all the informations are available in the SQS message or not
    if(msg.key && msg.message && msg.key.hasOwnProperty('messageId') && msg.key.hasOwnProperty('encounterId') && msg.key.hasOwnProperty('patientId') && msg.key.hasOwnProperty('clinicalUhid') && msg.message.hasOwnProperty('orderItems') && msg.message.hasOwnProperty('personInfo') && msg.key.messageId && msg.key.encounterId && msg.key.patientId && msg.key.clinicalUhid && msg.message.orderItems){
        // inserting user meta-data in PATIENT Table
        let patient_insertion_id = await db.Patient_Insert(msg.key.clinicalUhid, msg.key.patientId, msg.key.correlationId).then(data=>data).catch(err=>{
            logger.error(err);
            return;
        }); 

        logger.info("patient insertion successfull ", patient_insertion_id," correlation Id: ",msg.key.correlationId);
        // inserting order and invoice-data in UC_ORDER Table
        // let noInsertion_status;
        let order_insertion = await db.Order_Insert(msg.key.messageId, msg.key.encounterId, patient_insertion_id, {orderItems:msg.message.orderItems}, msg.key.correlationId).then(data=>data).catch(err=>{
            logger.error(err);
            // noInsertion_status = err.split(":")[1];
            return;
        });

        // console.log(noInsertion_status);
        // if(order_insertion.split("_")[1].toUpperCase() != 'FAILED')
        if(typeof order_insertion == 'string' && order_insertion.split("_")[1].toUpperCase()){
            logger.warn("Deleting the messages since the record is already present in UC_ORDER Table");
            // Delete the message from the queue
            const deleteParams = {
                QueueUrl: envVariables.INVOICE_QUEUE_URL,
                ReceiptHandle: message.ReceiptHandle,
            };
            try {
                const data = await sqsClient.send(new DeleteMessageCommand(deleteParams));
                logger.warn("Message deleted", data);
            } catch (err) {
                logger.error("Error while deleting ", err);
            };
        }else{
            if(typeof order_insertion == 'number'){
                logger.info(order_insertion," order is inserted in the UC_ORDER table"," with correlation Id: ",msg.key.correlationId," patient uhid: ",msg.key.clinicalUhid);
                    // zoho invoice function caller
                    let person_from_msg = msg.message.personInfo
                    let user = {
                        "contact_name": `${person_from_msg.firstName+" "+person_from_msg.lastName}`,
                        "contact_persons": [
                                {
                                    "first_name": `${person_from_msg.firstName}`,
                                    "last_name": `${person_from_msg.lastName}`,
                                    "email": `${person_from_msg.emailId.trim()}`,
                                    "is_primary_contact": true,
                                    "enable_portal": true
                                }
                            ],
                        "custom_fields": [
                                {
                                    "label": "UHID",
                                    "api_name": "cf_uhid",
                                    "value_formatted": `${msg.key.clinicalUhid}`,
                                    "search_entity": "contact",
                                    "data_type": "string",
                                    "placeholder": "cf_uhid",
                                    "value": `${msg.key.clinicalUhid}`
                                }
                            ],
                        "gst_treatment": "consumer",
                    }
        
                    let invoice_response = await zohoServices.invoice(msg.key.clinicalUhid, msg.message.orderItems, user, msg.key.messageId, msg.key.correlationId).then(async(response)=>{
                        logger.info("success response",response);
                        await db.Order_Update_Invoice(response.msg_id, response.invoice_no, "INVOICE_CREATED", response.correlationId).then(data=>data).catch(err=>{
                            logger.error(err);
                            return;
                        });
                        return response;
                    }).catch(async(error)=>{
                        logger.error(error)
                        console.log("came here in processing error");
                        await db.Order_Update_Invoice(error.message.split("<>")[1], null,"INVOICE_FAILED", error.message.split("->")[1]).then(data=>data).catch(err=>{
                            logger.error("INVOICE_FAILED ",err);
                            return;
                        });
                        return;
                    })
            
                    if(invoice_response){
                        // Delete the message from the queue
                        const deleteParams = {
                            QueueUrl: envVariables.INVOICE_QUEUE_URL,
                            ReceiptHandle: message.ReceiptHandle,
                        };
                        try {
                            const data = await sqsClient.send(new DeleteMessageCommand(deleteParams));
                            logger.warn("Message deleted", data," with correlation Id: ",msg.key.correlationId," patient uhid: ",msg.key.clinicalUhid);
                        } catch (err) {
                            logger.error("Error while deleting ", err);
                        };
                    }
            } 
        }
    }else{
        logger.warn("Bad message request from SQS"," with correlation Id: ",msg.key.correlationId," patient uhid: ",msg.key.clinicalUhid);
        logger.info("deleting the message since BAD Request")
        // Delete the message from the queue
        const deleteParams = {
            QueueUrl: envVariables.INVOICE_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
        };
        try {
            const data = await sqsClient.send(new DeleteMessageCommand(deleteParams));
            logger.warn("Message deleted", data," with correlation Id: ",msg.key.correlationId," patient uhid: ",msg.key.clinicalUhid);
        } catch (err) {
            logger.error("Error while deleting ", err);
        };
    }
}catch(error){
    logger.error("Some Error happened :", error);
}
}

module.exports = processInvoiceMessage;