'use strict';

const envVariables = require('./helper/envHelper');
const express = require('express');
const bodyParser = require('body-parser');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

// Import required AWS SDK clients and commands for Node.js
const { SQSClient, ReceiveMessageCommand } = require("@aws-sdk/client-sqs");
// Create SQS service object.
const sqsClient = new SQSClient({region: envVariables.REGION});

const invoiceParams = {
    AttributeNames: ["SentTimestamp"],
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ["All"],
    QueueUrl: envVariables.INVOICE_QUEUE_URL,
    VisibilityTimeout: 10,
    WaitTimeSeconds: 10,
};

const personParams = {
    AttributeNames: ["SentTimestamp"],
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ["All"],
    QueueUrl: envVariables.PERSON_QUEUE_URL,
    VisibilityTimeout: 10,
    WaitTimeSeconds: 10,
};

const db = require('./db/DBModule');

const app = express() // creates http server
const processInvoiceMessage = require('./processInvoice');
const processPersonMessage = require('./processPerson');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let queueFlag = true;
// SQS Caller Function to get the queue 
const readingSQSMsg = async() =>{
    logger.info("Middleware called");
    if(queueFlag){
        try {
            let command = new ReceiveMessageCommand(invoiceParams)
            const data = await sqsClient.send(command);
            if (data.Messages) {
                processInvoiceMessage(data.Messages[0])
            } else {
                logger.warn("No messages to delete in Invoice Queue");
            }
        } catch (err) {
            logger.error("Receive Error", err);
        }
    }else{
        try {
            let command = new ReceiveMessageCommand(personParams)
            const data = await sqsClient.send(command);
            if (data.Messages) {
                processPersonMessage(data.Messages[0])
            } else {
                logger.warn("No messages to delete in Person Queue");
            }
        } catch (err) {
            logger.error("Receive Error", err);
        }
    }   

    setTimeout(()=>{
        queueFlag = !queueFlag;
        readingSQSMsg();}, 2500);
}

// API to get invoice url for mobile app to use.
app.get('/order-mgmt/patient/:uuid/payment-invoice', async(req,res)=>{
    // console.log(req.params.uuid);
    await db.Order_Invoice_Urls(req.params.uuid).then(data=>{
        if(data.length){
            let formattedData = data.map(obj=>{
                return {
                    encounterId: obj.encounter_id,
                    invoiceNumber: obj.invoice_number,
                    invoiceUrl: obj.invoice_url,
                    processingStatus: obj.processing_status
                }
            });
            res.statusCode = 200;
            res.json(formattedData);
        }else{
            res.statusCode = 200;
            res.json(data);
        }
    }).catch(err=>{
        logger.error(err);
        res.statusCode = 404;
        res.json(err);
    });  
    
})

// Payment webhook for payment notification.
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
        await db.Order_Txn_Logs_Webhook_Update(req.body.invoice_number, status);
    }
    // return a text response
    const data = { type: 'Received' };
    res.json(data);
});

// app.listen() part should always be located in the last line of your code
app.listen(envVariables.APP_SERVER_PORT, () => {
    console.log('Zoho Books APP/Webhook is listening');
    readingSQSMsg();
})