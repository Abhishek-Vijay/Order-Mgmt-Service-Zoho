'use strict';

// require('dotenv').config();
const envVariables = require('./helper/envHelper');
const express = require('express');
const bodyParser = require('body-parser');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug"

// Import required AWS SDK clients and commands for Node.js
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
// Create SQS service object.
const sqsClient = new SQSClient({region: envVariables.REGION});
  
const queueURL = envVariables.QUEUE_URL;
const params = {
    AttributeNames: ["SentTimestamp"],
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ["All"],
    QueueUrl: queueURL,
    VisibilityTimeout: 10,
    WaitTimeSeconds: 10,
};

const db = require('./db/DBModule');

const app = express() // creates http server
const zoho = require('./zohoService/zoho');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// SQS Caller Function to get the queue 
const ReadingSQSMsg = async() =>{
    logger.info("Middleware called")
    try {
        let command = new ReceiveMessageCommand(params)
        const data = await sqsClient.send(command);
        if (data.Messages) {
            processMessage(data.Messages[0])
        } else {
            logger.warn("No messages to delete");
        }
    } catch (err) {
        logger.error("Receive Error", err);
    }

    setTimeout(()=>ReadingSQSMsg(),5000);
}

const processMessage = async(message) => {
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
                QueueUrl: queueURL,
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
                                    "email": `${person_from_msg.emailId}`,
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
                            ]
                    }
        
                    let invoice_response = await zoho.invoice(msg.key.clinicalUhid, msg.message.orderItems, user, msg.key.messageId, msg.key.correlationId).then(async(response)=>{
                        logger.info("success response",response);
                        await db.Order_Update_Invoice(response.msg_id, response.invoice_no, "INVOICE_CREATED", response.correlationId).then(data=>data).catch(err=>{
                            logger.error(err);
                            return;
                        });
                        return response;
                    }).catch(async(error)=>{
                        logger.error(error)
                        console.log("came here");
                        await db.Order_Update_Invoice(error.message.split("<>")[1], null, "INVOICE_FAILED", error.message.split("->")[1]).then(data=>data).catch(err=>{
                            logger.error("INVOICE_FAILED ",err);
                            return;
                        });
                    })
            
                    if(invoice_response){
                        // Delete the message from the queue
                        const deleteParams = {
                            QueueUrl: queueURL,
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
            QueueUrl: queueURL,
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

// app.post('/', (req, res) => {
//     // return values
//     let {cf_uuid, items, user, order_id} = req.body
//     zoho.invoice(cf_uuid, items, user, order_id).then(response=>{
//        res.json(response);
//     }).catch(error=>{
//         res.json(error.message)
//     })
// });

app.post('/paymentHook', async(req, res) => {
    // check if verification token is correct
    if (req.headers.token !== envVariables.TOKEN) {
        return res.sendStatus(401);
    }
    // print request body
    if(req.body.status){
        let status;
        logger.info(req.body);
        if (req.body.status.toUpperCase() == 'PAID') status = 'PAYMENT_COMPLETED';
        else if (req.body.status.toUpperCase() == 'FAILED') status = 'PAYMENT_FAILED';
        else if (req.body.status.toUpperCase() == 'OVERDUE') status = 'PAYMENT_OVERDUE';
        await db.Order_Update_Payment(req.body.invoice_number, `${status}`).then(data=>data).catch(err=>{
            logger.error(err);
            return;
        });
    }
    // return a text response
    const data = { type: 'Received' };
    res.json(data);
});

// app.listen() part should always be located in the last line of your code
app.listen(envVariables.APP_SERVER_PORT, () => {
    console.log('Zoho Books APP/Webhook is listening');
    ReadingSQSMsg();
})