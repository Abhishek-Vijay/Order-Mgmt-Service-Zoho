'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "all"

// Import required AWS SDK clients and commands for Node.js
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
// Create SQS service object.
const sqsClient = new SQSClient({region: process.env.REGION});
  
const queueURL = process.env.queueURL;
const params = {
    AttributeNames: ["SentTimestamp"],
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ["All"],
    QueueUrl: queueURL,
    VisibilityTimeout: 10,
    WaitTimeSeconds: 10,
};

const db = require('./DBModule');

const app = express() // creates http server
const zoho = require('./zoho');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// SQS Caller Function to get the queue 
const sqsFun = async() =>{
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

    setTimeout(()=>sqsFun(),5000);
}

const processMessage = async(message) => {
    // Process the message here
    logger.info('Received message:', message.Body);
    let msg = JSON.parse(message.Body);
    // inserting user meta-data in PATIENT Table
    let patient_insert_id = await db.Patient_Insert(msg.key.patientId, msg.key.clinicalUuid).then(data=>data).catch(err=>{
        logger.error(err);
        return;
    }); 

    logger.info("patient insertion successfull ", patient_insert_id);
    // inserting order and invoice-data in UC_ORDER Table
    let noInsertion_status;
    let order_insert_count = await db.Order_Insert(msg.key.orderId, patient_insert_id, {orderItems:msg.message.orderItems}).then(data=>data).catch(err=>{
        logger.error(err);
        noInsertion_status = err.split(":")[1];
        return;
    });

    if(order_insert_count){
        logger.info("order is inserted ", order_insert_count);
        if(msg.key && msg.message && msg.key.hasOwnProperty('orderId') && msg.key.hasOwnProperty('patientId') && msg.key.hasOwnProperty('clinicalUuid') && msg.message.hasOwnProperty('orderItems')){
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
                            "label": "UUID",
                            "api_name": "cf_uuid",
                            "value_formatted": `${msg.key.clinicalUuid}`,
                            "search_entity": "contact",
                            "data_type": "string",
                            "placeholder": "cf_uuid",
                            "value": `${msg.key.clinicalUuid}`
                        }
                    ]
            }

            let invoice_response = await zoho.invoice(msg.key.clinicalUuid, msg.message.orderItems, user, msg.key.orderId).then(async(response)=>{
                logger.info("success response",response);
                await db.Order_Update_Invoice(response.order_id, response.invoice_no, "INVOICE_CREATED").then(data=>data).catch(err=>{
                    logger.error(err);
                    return;
                });
                return response;
            }).catch(async(error)=>{
                logger.error(error)
                await db.Order_Update_Invoice(error.message.split("=>")[1], null, "INVOICE_FAILED").then(data=>data).catch(err=>{
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
                    logger.warn("Message deleted", data);
                } catch (err) {
                    logger.error("Error while deleting ", err);
                };
            }
        }else{
            logger.warn("Bad message request from SQS");
        }
    }else{
        if(noInsertion_status.split("_")[1].toUpperCase() != 'FAILED'){
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
        }   
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
    if (req.headers.token !== process.env.TOKEN) {
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
app.listen(5000, () => {
    console.log('Zoho Books APP/Webhook is listening');
    sqsFun();
})